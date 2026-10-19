"""Audio-grounded Gujarati spelling assistance; never manufacture word times."""
import os
import unicodedata
from difflib import SequenceMatcher

import httpx
from fastapi import HTTPException
from gujarati_spelling import proofread_reference


def enabled():
    setting = os.getenv('GUJARATI_AUDIO_ASSIST', 'auto')
    if setting not in ('auto', 'true', 'false'):
        raise HTTPException(503, 'Invalid Gujarati audio assistance configuration')
    if setting == 'true' and not os.getenv('OPENAI_API_KEY'):
        raise HTTPException(503, 'Gujarati audio assistance is not configured')
    return setting != 'false' and bool(os.getenv('OPENAI_API_KEY'))


MODELS = {'gpt-transcribe': 0.54, 'gpt-4o-transcribe': 0.72}


def transcription_model():
    model = os.getenv('GUJARATI_TRANSCRIPTION_MODEL', 'gpt-transcribe')
    if model not in MODELS:
        raise HTTPException(503, 'Unsupported Gujarati transcription model')
    return model


def transcription_keywords():
    terms = [term.strip() for term in os.getenv('GUJARATI_TRANSCRIPTION_KEYWORDS', '').split(',') if term.strip()]
    if len(terms) > 16 or any(len(term) > 64 or any(ord(c) < 32 for c in term) for term in terms):
        raise HTTPException(503, 'Invalid Gujarati transcription vocabulary')
    return list(dict.fromkeys(terms))


def audio_reference(client, audio, seconds):
    from groq_provider import reserve_budget
    model = transcription_model()
    # 2x the published audio-minute estimate, independent from Groq/edit credits.
    reserve_budget(seconds, model, provider='openai', rate=MODELS[model])
    # A recording's context is useful; task instructions and a current transcript
    # prefix can bias recognition and cause omissions. Let ASR hear whole clauses.
    fields = {'model': model, 'response_format': 'json',
              'prompt': 'ગુજરાતી વાતચીત, જેમાં રોજિંદા English શબ્દો અને નામો પણ બોલાય છે. ગુજરાતી લિપિ.'}
    if model == 'gpt-transcribe':
        fields['languages[]'] = ['gu']
        if terms := transcription_keywords():
            fields['keywords[]'] = terms
    else:
        fields['language'] = 'gu'
        fields['temperature'] = '0'
        if terms := transcription_keywords():
            fields['prompt'] += ' નામો અને શબ્દો: ' + ', '.join(terms)
    try:
        response = client.post('https://api.openai.com/v1/audio/transcriptions',
            headers={'Authorization': 'Bearer ' + os.environ['OPENAI_API_KEY']},
            data=fields, files={'file': ('audio.wav', audio, 'audio/wav')})
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Gujarati audio assistance temporarily unavailable') from error
    if response.status_code != 200:
        raise HTTPException(429 if response.status_code == 429 else 503,
                            'Gujarati audio assistance failed; please retry later')
    try:
        text = response.json()['text']
        if not isinstance(text, str) or len(text) > 120000:
            raise ValueError('Invalid reference')
        return proofread_reference(client, text.strip()) if text.strip() else ""
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
