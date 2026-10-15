"""Strict, bounded PCM input; never accept URLs or decode user-supplied video."""
import io
import wave
import numpy as np

MAX_SECONDS = 1800
MAX_BYTES = 44 + 16000 * MAX_SECONDS * 2


def decode_wave(body: bytes) -> np.ndarray:
    if len(body) > MAX_BYTES:
        raise ValueError('Audio exceeds 30 minutes')
    with wave.open(io.BytesIO(body), 'rb') as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate(), source.getcomptype()) != (1, 2, 16000, 'NONE'):
            raise ValueError('Expected 16 kHz mono PCM16 WAV')
        frames = source.getnframes()
        if not 0 < frames <= 16000 * MAX_SECONDS:
            raise ValueError('Audio duration must be between 0 and 30 minutes')
        pcm = source.readframes(frames)
        if len(pcm) != frames * 2:
            raise ValueError('Truncated audio')
    return np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
