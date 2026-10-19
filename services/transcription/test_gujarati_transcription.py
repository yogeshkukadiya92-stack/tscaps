import httpx
import numpy as np
import pytest
from fastapi import HTTPException

from groq_provider import transcribe_groq
from gujarati_transcription import correct_aligned_spelling, enabled


@pytest.fixture(autouse=True)
def setup(monkeypatch, tmp_path):
    monkeypatch.setenv('GROQ_API_KEY', 'groq-test')
    monkeypatch.setenv('OPENAI_API_KEY', 'openai-test')
    monkeypatch.setenv('GUJARATI_AUDIO_ASSIST', 'true')
    monkeypatch.setenv('PROCESSING_BUDGET_DB', str(tmp_path / 'budget.sqlite'))
    monkeypatch.setenv('GROQ_MONTHLY_USD_LIMIT', '5')
    monkeypatch.setenv('OPENAI_TRANSCRIPTION_MONTHLY_USD_LIMIT', '5')


def test_audio_grounded_reference_then_timestamped_decode():
    calls = []
    def handle(request):
        calls.append(request.url.host)
        if request.url.host == 'api.openai.com':
            assert request.headers['authorization'] == 'Bearer openai-test'
            assert b'gpt-4o-transcribe' in request.content
            assert b'audio.wav' in request.content
            return httpx.Response(200, json={'text': 'આ મેડિકલ છે'})
        # A transcript prefix can make Whisper omit the same words in audio.
        assert 'આ મેડિકલ છે'.encode() not in request.content
        return httpx.Response(200, json={'words': [
            {'word': 'આ', 'start': 0, 'end': .2},
            {'word': 'મેડીકલ', 'start': .2, 'end': .6},
            {'word': 'છે', 'start': .6, 'end': 1}]})
    result = transcribe_groq(np.zeros(16000), 'gu', httpx.MockTransport(handle))
    assert calls == ['api.openai.com', 'api.groq.com']
    assert result['words'][1] == {'text': 'મેડિકલ', 'start': .2, 'end': .6}


def test_short_windows_recover_later_speech_and_keep_absolute_times():
    calls = []
    def handle(request):
        calls.append(request.url.host)
        if request.url.host == 'api.openai.com':
            return httpx.Response(200, json={'text': 'વાત છે'})
        return httpx.Response(200, json={'words': [
            {'word': 'વાત', 'start': 1, 'end': 1.4},
            {'word': 'છે', 'start': 2, 'end': 2.4}]})
    result = transcribe_groq(np.zeros(32 * 16000), 'gu', httpx.MockTransport(handle))
    assert calls == ['api.openai.com', 'api.groq.com'] * 2
    assert [w['start'] for w in result['words']] == [1, 2, 20, 21]


def test_new_words_do_not_receive_made_up_timing():
    original = [{'word': 'વાત', 'start': 0, 'end': .4}, {'word': 'છે', 'start': 25, 'end': 26}]
    assert correct_aligned_spelling(original, 'વાત પછી ઘણા નવા શબ્દો છે') == original
    assert correct_aligned_spelling(original, 'અલગ વાક્ય') == original


def test_assist_failure_does_not_silently_return_uncorrected_captions():
    with pytest.raises(HTTPException) as error:
        transcribe_groq(np.zeros(16000), 'gu', httpx.MockTransport(lambda _: httpx.Response(401)))
    assert error.value.status_code == 503


def test_assist_budget_blocks_paid_calls(monkeypatch):
    monkeypatch.setenv('OPENAI_TRANSCRIPTION_MONTHLY_USD_LIMIT', '0.000001')
    calls = []
    with pytest.raises(HTTPException) as error:
        transcribe_groq(np.zeros(16000), 'gu', httpx.MockTransport(lambda r: calls.append(r)))
    assert error.value.status_code == 429
    assert calls == []


def test_explicit_enable_requires_key(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY')
    with pytest.raises(HTTPException):
        enabled()
    monkeypatch.setenv('GUJARATI_AUDIO_ASSIST', 'auto')
    assert enabled() is False


def test_other_languages_do_not_send_audio_to_openai():
    calls = []
    def handle(request):
        calls.append(request.url.host)
        return httpx.Response(200, json={'words': [{'word': 'hello', 'start': 0, 'end': .5}]})
    transcribe_groq(np.zeros(16000), 'en', httpx.MockTransport(handle))
    assert calls == ['api.groq.com']
