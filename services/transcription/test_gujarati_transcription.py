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


def test_openai_transcript_is_forced_aligned_instead_of_whisper_prompt(monkeypatch):
    calls = []
    expected = [{'word': 'ડિઝાઇનરની', 'start': .8, 'end': 1.5},
                {'word': 'જોબ', 'start': 1.5, 'end': 2.0}]
    def align(pcm, reference):
        assert len(pcm) == 8 * 16000
        assert reference == 'ડિઝાઇનરની જોબ'
        return expected
    monkeypatch.setattr('gujarati_alignment.align_reference', align)
    def handle(request):
        calls.append(request.url.host)
        assert request.url.host == 'api.openai.com'
        assert request.headers['authorization'] == 'Bearer openai-test'
        assert b'gpt-4o-transcribe' in request.content
        return httpx.Response(200, json={'text': 'ડિઝાઇનરની જોબ'})
    result = transcribe_groq(np.zeros(8 * 16000), 'gu', httpx.MockTransport(handle))
    assert calls == ['api.openai.com']
    assert result['words'] == [{'text': w['word'], 'start': w['start'], 'end': w['end']} for w in expected]
    assert result['transcription']['alignment'] == 'whisper-attention'


def test_short_windows_keep_absolute_times_and_own_boundary_words(monkeypatch):
    monkeypatch.setattr('gujarati_alignment.align_reference', lambda *_: [
        {'word': 'વાત', 'start': 1, 'end': 1.4},
        {'word': 'છે', 'start': 2, 'end': 2.4}])
    calls = []
    def handle(request):
        calls.append(request.url.host)
        return httpx.Response(200, json={'text': 'વાત છે'})
    result = transcribe_groq(np.zeros(32 * 16000), 'gu', httpx.MockTransport(handle))
    assert calls == ['api.openai.com'] * 2
    assert [w['start'] for w in result['words']] == [1, 2, 20, 21]


@pytest.mark.parametrize('items', [
    [{'word': 'ખોટું', 'start': 0, 'end': 5.66}],
    [{'word': 'શબ્દ', 'start': 8, 'end': 8}],
    [{'word': 'શબ્દ', 'start': float('nan'), 'end': 1}],
    [{'word': 'એક', 'start': 1, 'end': 2}, {'word': 'બે', 'start': .5, 'end': 1}],
    [],
])
def test_unreliable_alignment_is_never_published(monkeypatch, items):
    monkeypatch.setattr('gujarati_alignment.align_reference', lambda *_: items)
    with pytest.raises(HTTPException):
        transcribe_groq(np.zeros(8 * 16000), 'gu', httpx.MockTransport(
            lambda _: httpx.Response(200, json={'text': 'ગુજરાતી શબ્દ'})))


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
