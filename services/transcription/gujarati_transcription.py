"""Audio-grounded Gujarati spelling assistance; never manufacture word times."""
import os
import unicodedata
from difflib import SequenceMatcher

import httpx
from fastapi import HTTPException


def enabled():
    setting = os.getenv('GUJARATI_AUDIO_ASSIST', 'auto')
    if setting not in ('auto', 'true', 'false'):
        raise HTTPException(503, 'Invalid Gujarati audio assistance configuration')
    if setting == 'true' and not os.getenv('OPENAI_API_KEY'):
        raise HTTPException(503, 'Gujarati audio assistance is not configured')
    return setting != 'false' and bool(os.getenv('OPENAI_API_KEY'))


def audio_reference(client, audio, seconds):
    from groq_provider import reserve_budget
    # Conservative reservation (2x the model's estimated audio-minute cost),
    # independent from Groq and AI-edit credits. Never retry paid calls silently.
    reserve_budget(seconds, 'gpt-4o-transcribe', provider='openai', rate=0.72)
    try:
        response = client.post('https://api.openai.com/v1/audio/transcriptions',
            headers={'Authorization': 'Bearer ' + os.environ['OPENAI_API_KEY']},
            data={'model': 'gpt-4o-transcribe', 'language': 'gu', 'response_format': 'json',
                  'temperature': '0', 'prompt':
                  'Transcribe ALL speech from the beginning to the end of this Gujarati recording. '
                  'Write every clause and repetition, not just the first sentence. '
                  'Use Gujarati script for Gujarati speech and naturally pronounced loanwords. '
                  'Preserve English names and acronyms. Do not translate or summarize. '
                  'Do not invent words in silence or complete a cut-off ending.'},
            files={'file': ('audio.wav', audio, 'audio/wav')})
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Gujarati audio assistance temporarily unavailable') from error
    if response.status_code != 200:
        raise HTTPException(429 if response.status_code == 429 else 503,
                            'Gujarati audio assistance failed; please retry later')
    try:
        text = response.json()['text']
        if not isinstance(text, str) or len(text) > 8000:
            raise ValueError('Invalid reference')
        return text.strip()
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(503, 'Invalid Gujarati audio assistance response') from error


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFC', text).casefold()
                   if not unicodedata.category(c).startswith(('P', 'Z')))


def correct_aligned_spelling(words, reference):
    """Apply small, similar one-to-one corrections between matching anchors.

    Insertions/deletions and substantially different phrases remain timestamped
    Whisper output. Assigning GPT's extra words evenly through gaps would create
    false timing, especially across the long missing-speech region in a reel.
    """
    tokens = reference.split()
    original = [normalized(word['word']) for word in words]
    target = [normalized(token) for token in tokens]
    corrected = [dict(word) for word in words]
    for tag, a, b, c, d in SequenceMatcher(None, original, target, autojunk=False).get_opcodes():
        if tag != 'replace' or b - a != d - c or b - a > 3:
            continue
        for i, j in zip(range(a, b), range(c, d)):
            if original[i] and target[j] and SequenceMatcher(None, original[i], target[j]).ratio() >= 0.65:
                corrected[i]['word'] = tokens[j]
    return corrected
