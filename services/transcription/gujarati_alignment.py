"""Align OpenAI's Gujarati transcript to audio, without redistributing word times."""
import logging
import math
import os
from functools import lru_cache
from pathlib import Path

last_failure = None

import httpx
from fastapi import HTTPException


class AlignmentDraftError(HTTPException):
    """Return paid ASR text only to the authenticated caller, never in health/logs."""
    def __init__(self, reference):
        super().__init__(503, 'Gujarati word alignment failed; please retry later')
        self.draft_text = reference


@lru_cache(maxsize=1)
def alignment_model():
    return load_alignment_model(os.getenv('GUJARATI_ALIGNMENT_MODEL', '/models/aligner'))


@lru_cache(maxsize=1)
def full_alignment_model():
    return load_alignment_model(os.getenv('GUJARATI_FULL_ALIGNMENT_MODEL', '/models/aligner-full'))


def load_alignment_model(model_path):
    import stable_whisper
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
        from gujarati_transcription import normalized
        def measure(model):
            result = model.align(pcm, reference, language='gu', verbose=None, regroup=False,
                                 remove_instant_words=False, failure_threshold=None, token_step=400)
            if result is None:
                return []
            words = [w for segment in result.to_dict()['segments'] for w in segment['words']]
            return words if normalized(' '.join(w['word'] for w in words)) == normalized(reference) else []
        aligned = measure(alignment_model())
        seconds = len(pcm) / 16000
        if aligned and timing_issue(aligned, seconds) is None:
            return aligned
        # The pruned Turbo decoder can collapse a code-switched word. Measure
        # the same complete transcript with the full multilingual decoder once.
        # Only borrow genuinely measured times; never interpolate or drop words.
        alternate = measure(full_alignment_model())
        if alternate and timing_issue(alternate, seconds) is None:
            return alternate
        aligned = repair_collapsed_words(aligned, alternate)
        if aligned and timing_issue(aligned, seconds) is None:
            return aligned
        raise ValueError('Alignment could not time every transcript word')
    except Exception as error:
        import traceback
        frame = traceback.extract_tb(error.__traceback__)[-1]
        last_failure = {'type': type(error).__name__, 'module': os.path.basename(frame.filename), 'line': frame.lineno}
        if isinstance(error, ModuleNotFoundError):
            last_failure['dependency'] = error.name
        logging.getLogger(__name__).exception('Gujarati acoustic alignment failed')
        raise HTTPException(503, 'Gujarati word alignment failed; please retry later') from error


def repair_collapsed_words(aligned, alternate):
    """Use an independent acoustic measurement for isolated collapsed words."""
    from gujarati_transcription import normalized
    if len(aligned) != len(alternate) or any(normalized(a['word']) != normalized(b['word'])
                                               for a, b in zip(aligned, alternate)):
        return aligned
    collapsed = [i for i, w in enumerate(aligned)
                 if math.isfinite(w['start']) and w['start'] == w['end']]
    if len(collapsed) > min(4, max(1, len(aligned) // 20)):
        return aligned
    repaired = [dict(w) for w in aligned]
    for index in collapsed:
        candidate = alternate[index]
        a, b = candidate['start'], candidate['end']
        if (math.isfinite(a) and math.isfinite(b) and 0 < b - a <= 3
                and (index == 0 or a >= repaired[index - 1]['end'] - .02)
                and (index + 1 == len(repaired) or b <= repaired[index + 1]['start'] + .02)):
            repaired[index].update(start=a, end=b)
    return repaired


def timing_issue(aligned, seconds):
    previous_end = 0
    for index, item in enumerate(aligned):
        try:
            a, b = float(item['start']), float(item['end'])
            text = item['word'].strip()
            if (not text or not math.isfinite(a) or not math.isfinite(b)
                    or a < previous_end - 0.02 or a < 0 or b <= a
                    or b > seconds + 0.02 or b - a > 3):
                raise ValueError('Unreliable word timing')
            previous_end = b
        except (KeyError, TypeError, ValueError, AttributeError):
            return index
    return None


def audio_windows(pcm):
    """Keep full reels intact; split long audio near a quiet frame below 25 MB."""
    import numpy as np
    size = len(pcm)
    start = 0
    maximum = 600 * 16000
    frame = 3200  # 200 ms; use the quietest frame near the maximum duration.
    while start < size:
        end = min(size, start + maximum)
        if end < size:
            search = pcm[end - 5 * 16000:end]
            energy = np.mean(search.reshape(-1, frame) ** 2, axis=1)
            end = end - len(search) + int(np.argmin(energy)) * frame + frame // 2
        yield start, end
        start = end


def transcribe_gujarati(pcm, transport=None):
    global last_failure
    from groq_provider import as_wave
    from gujarati_transcription import audio_reference, transcription_model
    words = []
    with httpx.Client(timeout=180, follow_redirects=False, transport=transport) as client:
        for begin, finish in audio_windows(pcm):
            start, end = begin / 16000, finish / 16000
            chunk = pcm[begin:finish]
            reference = audio_reference(client, as_wave(chunk), end - start)
            if not reference:
                continue
            try:
                aligned = align_reference(chunk, reference)
            except HTTPException as error:
                raise AlignmentDraftError(reference) from error
            if not aligned:
                raise AlignmentDraftError(reference)
            previous_end = 0
            for word_index, item in enumerate(aligned):
                try:
                    a, b = float(item['start']), float(item['end'])
                    text = item['word'].strip()
                    if (not text or not math.isfinite(a) or not math.isfinite(b)
                            or a < previous_end - 0.02 or a < 0 or b <= a
                            or b > end - start + 0.02 or b - a > 3):
                        raise ValueError('Unreliable word timing')
                    previous_end = b
                except (KeyError, TypeError, ValueError, AttributeError) as error:
                    last_failure = {'stage': 'timing-validation', 'index': word_index,
                                    'start': item.get('start'), 'end': item.get('end'),
                                    'chunk_seconds': end - start}
                    raise AlignmentDraftError(reference) from error
                words.append({'text': text, 'start': round(start + a, 3),
                              'end': round(min(end, start + b), 3)})
    return {'words': words, 'language': 'gu',
            'transcription': {'provider': 'openai', 'model': transcription_model(),
                              'alignment': 'whisper-attention', 'spelling_model': 'gpt-5.4-mini-2026-03-17', 'version': 8}}
