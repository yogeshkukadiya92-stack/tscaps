"""Align OpenAI's Gujarati transcript to audio, without redistributing word times."""
import logging
import math
import os
from functools import lru_cache
from pathlib import Path

last_failure = None

import httpx
from fastapi import HTTPException


@lru_cache(maxsize=1)
def alignment_model():
    import stable_whisper
    model_path = os.getenv('GUJARATI_ALIGNMENT_MODEL', '/models/aligner')
    # Large v3 needs 128 mel bins. Without this asset faster-whisper
    # silently defaults to 80 and fails only at the first real request.
    if not (Path(model_path) / 'preprocessor_config.json').is_file():
        raise RuntimeError('Gujarati aligner is missing its audio preprocessing configuration')
    model = stable_whisper.load_faster_whisper(
        model_path,
        device='cpu', compute_type='int8', cpu_threads=4, num_workers=1,
        local_files_only=True,
    )
    if model.feature_extractor.mel_filters.shape[0] != model.model.n_mels:
        raise RuntimeError('Gujarati aligner audio configuration does not match the model')
    return model


def align_reference(pcm, reference):
    global last_failure
    last_failure = None
    try:
        result = alignment_model().align(
            pcm, reference, language='gu', verbose=None, regroup=False,
            remove_instant_words=True, failure_threshold=0.2,
        )
        if result is None:
            raise ValueError(f'Alignment rejected transcript ({len(reference.split())} words)')
        return [word for segment in result.to_dict()['segments'] for word in segment['words']]
    except Exception as error:
        import traceback
        frame = traceback.extract_tb(error.__traceback__)[-1]
        last_failure = {'type': type(error).__name__, 'module': os.path.basename(frame.filename), 'line': frame.lineno}
        if isinstance(error, ModuleNotFoundError):
            last_failure['dependency'] = error.name
        logging.getLogger(__name__).exception('Gujarati acoustic alignment failed')
        raise HTTPException(503, 'Gujarati word alignment failed; please retry later') from error


def transcribe_gujarati(pcm, transport=None):
    from groq_provider import as_wave
    from gujarati_transcription import audio_reference
    duration = len(pcm) / 16000
    words = []
    with httpx.Client(timeout=180, follow_redirects=False, transport=transport) as client:
        # Independent short contexts prevent one sentence from hiding later speech.
        for core_start in range(0, math.ceil(duration), 4):
            core_end = min(duration, core_start + 4)
            start, end = max(0, core_start - 1), min(duration, core_end + 1)
            chunk = pcm[int(start * 16000):int(end * 16000)]
            reference = audio_reference(client, as_wave(chunk), end - start)
            if not reference:
                continue
            aligned = align_reference(chunk, reference)
            if not aligned:
                raise HTTPException(503, 'Gujarati word alignment failed; please retry later')
            previous_end = 0
            for item in aligned:
                try:
                    a, b = float(item['start']), float(item['end'])
                    text = item['word'].strip()
                    if (not text or not math.isfinite(a) or not math.isfinite(b)
                            or a < previous_end - 0.02 or a < 0 or b <= a
                            or b > end - start + 0.02 or b - a > 3):
                        raise ValueError('Unreliable word timing')
                    previous_end = b
                except (KeyError, TypeError, ValueError, AttributeError) as error:
                    raise HTTPException(503, 'Invalid GPU transcription response') from error
                absolute_start = round(start + a, 3)
                if core_start <= absolute_start < core_end:
                    words.append({'text': text, 'start': absolute_start,
                                  'end': round(min(end, start + b), 3)})
    return {'words': words, 'language': 'gu',
            'transcription': {'provider': 'openai', 'model': 'gpt-4o-transcribe',
                              'alignment': 'whisper-attention', 'version': 3}}
