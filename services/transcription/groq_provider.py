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


def reserve_budget(seconds: float, model: str, *, provider="groq", rate=None):
    path = Path(os.getenv('PROCESSING_BUDGET_DB', '/budget/usage.sqlite'))
    path.parent.mkdir(parents=True, exist_ok=True)
    limit = float(os.getenv('OPENAI_TRANSCRIPTION_MONTHLY_USD_LIMIT' if provider == 'openai' else 'GROQ_MONTHLY_USD_LIMIT', '5'))
    if not math.isfinite(limit) or limit <= 0:
        raise HTTPException(503, 'Monthly processing budget is not configured')
    cost = math.ceil(max(10, seconds) / 3600 * (RATES[model] if rate is None else rate) * 1_000_000)
    month = datetime.now(timezone.utc).strftime('%Y-%m')
    if provider != 'groq':
        month = provider + ':' + month
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
    # Gujarati is error-sensitive: use the full multilingual decoder even
    # when the service's general-purpose default is the pruned Turbo model.
    # Reserve at this model's actual rate so the existing cap still applies.
    if language == 'gu':
        model = 'whisper-large-v3'
    key = os.getenv('GROQ_API_KEY')
    if not key:
        raise HTTPException(503, 'GPU transcription is not configured')
    duration = len(pcm) / 16000
    words = []
    detected_language = language
    with httpx.Client(timeout=180, follow_redirects=False, transport=transport) as client:
        # Each PCM WAV stays below 25 MB, including overlap, on every plan.
        # Short independent Gujarati windows limit decoder omissions: one bad
        # segment must not swallow the rest of a whole reel. Context overlap is
        # sent to both providers, while ownership uses the original time axis.
        chunk_seconds = 20 if language == 'gu' else 600
        for core_start in range(0, math.ceil(duration), chunk_seconds):
            core_end = min(duration, core_start + chunk_seconds)
            start = max(0, core_start - 1)
            end = min(duration, core_end + 1)
            audio = as_wave(pcm[int(start * 16000):int(end * 16000)])
            reserve_budget(end - start, model)
            reference = None
            if language == 'gu':
                from gujarati_transcription import audio_reference, enabled
                if enabled():
                    reference = audio_reference(client, audio, end - start)
            fields = {'model': model, 'response_format': 'verbose_json', 'temperature': '0',
                      'timestamp_granularities[]': 'word'}
            if language:
                fields['language'] = language
            if language == 'gu':
                # Whisper's prompt is transcription context, not an instruction
                # following chat prompt. Keep it in the requested script.
                fields['prompt'] = reference or 'ગુજરાતી ભાષામાં વાતચીત. ગુજરાતી શબ્દો સાથે English શબ્દો.'
            try:
                response = client.post('https://api.groq.com/openai/v1/audio/transcriptions',
                    headers={'Authorization': 'Bearer ' + key}, data=fields,
                    files={'file': ('audio.wav', audio, 'audio/wav')})
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
                if reference:
                    from gujarati_transcription import correct_aligned_spelling
                    result['words'] = correct_aligned_spelling(result['words'], reference)
                for index, item in enumerate(result['words']):
                    absolute_start, absolute_end = float(item['start']) + start, float(item['end']) + start
                    text = item['word'].strip()
                    if not text or not math.isfinite(absolute_start) or not math.isfinite(absolute_end) or absolute_end < absolute_start:
                        raise ValueError('Invalid word')
                    if core_start <= absolute_start < core_end:
                        # Whisper may stretch its final word into the padded final
                        # 30-second window of each chunk. Clip that endpoint;
                        # reject large drift on interior words or beyond padding.
                        final_word = index == len(result['words']) - 1
                        tolerance = 30 if final_word else 1
                        if absolute_end > end + tolerance:
                            raise ValueError('Out-of-range word')
                        words.append({'text': text, 'start': absolute_start, 'end': min(end, absolute_end)})
            except (ValueError, KeyError, TypeError, AttributeError) as error:
                raise HTTPException(503, 'Invalid GPU transcription response') from error
    return {'words': words, 'language': detected_language}
