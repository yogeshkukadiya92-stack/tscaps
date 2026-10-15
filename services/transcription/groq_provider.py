"""Usage-based GPU inference. The key never enters browser configuration."""
import io
import math
import os
import sqlite3
import wave
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
from fastapi import HTTPException

# Official rate card: dollars per audio hour. Unknown models fail closed.
RATES = {'whisper-large-v3': 0.111, 'whisper-large-v3-turbo': 0.04}


def reserve_budget(seconds: float, model: str):
    path = Path(os.getenv('PROCESSING_BUDGET_DB', '/budget/usage.sqlite'))
    path.parent.mkdir(parents=True, exist_ok=True)
    limit = float(os.getenv('GROQ_MONTHLY_USD_LIMIT', '5'))
    if not math.isfinite(limit) or limit <= 0:
        raise HTTPException(503, 'Monthly processing budget is not configured')
    cost = math.ceil(max(10, seconds) / 3600 * RATES[model] * 1_000_000)
    month = datetime.now(timezone.utc).strftime('%Y-%m')
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS usage (month TEXT PRIMARY KEY, micros INTEGER NOT NULL)')
        db.execute('BEGIN IMMEDIATE')
        spent = db.execute('SELECT micros FROM usage WHERE month=?', (month,)).fetchone()
        if (spent[0] if spent else 0) + cost > int(limit * 1_000_000):
            raise HTTPException(429, 'Monthly transcription budget reached')
        db.execute('INSERT INTO usage(month,micros) VALUES(?,?) ON CONFLICT(month) DO UPDATE SET micros=micros+excluded.micros', (month, cost))
    # Reservations are not refunded on upstream failure: retries cannot bypass the cap.


def as_wave(pcm):
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes((np.clip(pcm, -1, 32767 / 32768) * 32768).astype('<i2').tobytes())
    return buffer.getvalue()


def transcribe_groq(pcm, language, transport=None):
    model = os.getenv('GROQ_MODEL', 'whisper-large-v3')
    if model not in RATES:
        raise HTTPException(503, 'Unsupported transcription model')
    key = os.getenv('GROQ_API_KEY')
    if not key:
        raise HTTPException(503, 'GPU transcription is not configured')
    duration = len(pcm) / 16000
    words = []
    detected_language = language
    with httpx.Client(timeout=180, follow_redirects=False, transport=transport) as client:
        # Each PCM WAV stays below 25 MB, including overlap, on every plan.
        for core_start in range(0, math.ceil(duration), 600):
            core_end = min(duration, core_start + 600)
            start = max(0, core_start - 1)
            end = min(duration, core_end + 1)
            reserve_budget(end - start, model)
            fields = {'model': model, 'response_format': 'verbose_json', 'temperature': '0',
                      'timestamp_granularities[]': 'word'}
            if language:
                fields['language'] = language
            try:
                response = client.post('https://api.groq.com/openai/v1/audio/transcriptions',
                    headers={'Authorization': 'Bearer ' + key}, data=fields,
                    files={'file': ('audio.wav', as_wave(pcm[int(start * 16000):int(end * 16000)]), 'audio/wav')})
            except httpx.HTTPError as error:
                raise HTTPException(503, 'GPU provider temporarily unavailable') from error
            if response.status_code == 429:
                raise HTTPException(429, 'GPU provider busy; retry shortly')
            if response.status_code != 200:
                raise HTTPException(503, 'GPU transcription failed')
            try:
                result = response.json()
                detected_language = result.get('language', detected_language)
                if not isinstance(result.get('words'), list):
                    raise ValueError('Missing word timestamps')
                for item in result['words']:
                    absolute_start, absolute_end = float(item['start']) + start, float(item['end']) + start
                    text = item['word'].strip()
                    if not text or not math.isfinite(absolute_start) or not math.isfinite(absolute_end) or absolute_end < absolute_start:
                        raise ValueError('Invalid word')
                    if core_start <= absolute_start < core_end:
                        # Whisper can round the final word past the clip boundary.
                        # Accept at most one second of endpoint drift and clamp it.
                        if absolute_end > duration + 1:
                            raise ValueError('Out-of-range word')
                        words.append({'text': text, 'start': absolute_start, 'end': min(duration, absolute_end)})
            except (ValueError, KeyError, TypeError, AttributeError) as error:
                raise HTTPException(503, 'Invalid GPU transcription response') from error
    return {'words': words, 'language': detected_language}
