import httpx
import numpy as np
import pytest
from fastapi import HTTPException
from groq_provider import reserve_budget, transcribe_groq

@pytest.fixture(autouse=True)
def configure(monkeypatch, tmp_path):
    monkeypatch.setenv('PROCESSING_BUDGET_DB', str(tmp_path / 'usage.sqlite'))
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    monkeypatch.setenv('GROQ_MODEL', 'whisper-large-v3')
    monkeypatch.setenv('GROQ_MONTHLY_USD_LIMIT', '5')


def test_gpu_contract_and_original_language():
    def handle(request):
        assert request.url.host == 'api.groq.com'
        assert request.headers['authorization'] == 'Bearer test-key'
        assert b'whisper-large-v3' in request.content and b'gu' in request.content
        assert b'timestamp_granularities[]' in request.content
        return httpx.Response(200, json={'language': 'gu', 'words': [{'word': 'hello', 'start': 0, 'end': 0.5}]})
    result = transcribe_groq(np.zeros(16000, dtype=np.float32), 'gu', httpx.MockTransport(handle))
    assert result['words'] == [{'text': 'hello', 'start': 0, 'end': 0.5}]


def test_budget_is_durable_and_refuses_excess(monkeypatch):
    monkeypatch.setenv('GROQ_MONTHLY_USD_LIMIT', '0.111')
    reserve_budget(3600, 'whisper-large-v3')
    with pytest.raises(HTTPException) as failure:
        reserve_budget(10, 'whisper-large-v3')
    assert failure.value.status_code == 429


def test_missing_key_never_makes_a_paid_request(monkeypatch):
    monkeypatch.delenv('GROQ_API_KEY')
    with pytest.raises(HTTPException) as failure:
        transcribe_groq(np.zeros(16000), 'hi')
    assert failure.value.status_code == 503


def test_long_audio_offsets_timestamps_without_duplicate_overlap():
    calls = []
    def handle(request):
        calls.append(request)
        assert len(request.content) < 25 * 1024 * 1024
        items = [{'word': 'first', 'start': 0, 'end': 0.5}, {'word': 'boundary', 'start': 600, 'end': 600.3}] if len(calls) == 1 else [{'word': 'boundary', 'start': 1, 'end': 1.3}]
        return httpx.Response(200, json={'words': items})
    result = transcribe_groq(np.zeros(602 * 16000, dtype=np.float32), 'hi', httpx.MockTransport(handle))
    assert len(calls) == 2
    assert [word['text'] for word in result['words']] == ['first', 'boundary']
    assert result['words'][1]['start'] == 600


def test_final_word_endpoint_drift_is_clamped():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={
        'words': [{'word': 'છે', 'start': 0.7, 'end': 1.4}]}))
    result = transcribe_groq(np.zeros(16000), 'gu', transport)
    assert result['words'] == [{'text': 'છે', 'start': 0.7, 'end': 1.0}]


def test_large_out_of_range_endpoint_still_fails():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={
        'words': [{'word': 'bad', 'start': 0.7, 'end': 20}]}))
    with pytest.raises(HTTPException):
        transcribe_groq(np.zeros(16000), 'gu', transport)
