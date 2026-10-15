import io
import wave
from types import SimpleNamespace

import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient

from audio import decode_wave
from app import app


def wav(rate=16000, channels=1):
    output = io.BytesIO()
    with wave.open(output, 'wb') as stream:
        stream.setnchannels(channels)
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(b'\x00\x00' * rate * channels)
    return output.getvalue()


def test_decode_audio():
    result = decode_wave(wav())
    assert result.dtype == np.float32 and len(result) == 16000
    for data in [wav(rate=48000), wav(channels=2), b'broken']:
        with pytest.raises((ValueError, EOFError, wave.Error)):
            decode_wave(data)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', 'https://auth.test')
    monkeypatch.setenv('ENABLE_SERVER_RENDER', 'true')
    app.state.provider = 'local'
    app.state.auth_url = 'https://auth.test/auth/v1/user'
    app.state.public_key = 'public'
    app.state.busy = False
    app.state.render_busy = False
    def handle(request):
        if request.headers.get('authorization') != 'Bearer valid':
            return httpx.Response(401)
        if request.url.path == '/auth/v1/user':
            return httpx.Response(200, json={'id': 'owner'})
        return httpx.Response(200, json=[])
    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handle))
    engine = SimpleNamespace(transcribe=lambda *args, **kwargs: (
        [SimpleNamespace(words=[SimpleNamespace(word=' hello', start=0, end=0.5)])], SimpleNamespace(language='en')))
    app.state.engine = engine
    yield TestClient(app)


def test_auth_required_before_processing(client):
    assert client.post('/transcribe', content=wav(), headers={'Content-Type': 'audio/wav'}).status_code == 401


def test_timestamps_and_language(client):
    result = client.post('/transcribe?language=hi', content=wav(), headers={'Authorization': 'Bearer valid', 'Content-Type': 'audio/wav'})
    assert result.status_code == 200
    assert result.json()['words'] == [{'text': 'hello', 'start': 0, 'end': 0.5}]
    assert app.state.busy is False


def test_busy_server_refuses_another_request(client):
    app.state.busy = True
    response = client.post('/transcribe', headers={'Authorization': 'Bearer valid', 'Content-Type': 'audio/wav'})
    assert response.status_code == 429 and response.headers['retry-after'] == '10'


def test_invalid_body_releases_capacity(client):
    response = client.post('/transcribe', content=b'broken', headers={'Authorization': 'Bearer valid', 'Content-Type': 'audio/wav'})
    assert response.status_code == 400 and app.state.busy is False


def test_unsupported_language(client):
    response = client.post('/transcribe?language=not-valid', content=wav(), headers={'Authorization': 'Bearer valid', 'Content-Type': 'audio/wav'})
    assert response.status_code == 400


def test_export_requires_owned_cloud_project(client):
    response = client.post('/render?project_id=d6da6f51-39c5-4b68-9eba-d1bcca14c8c4', headers={'Authorization': 'Bearer valid'})
    assert response.status_code == 404
    assert app.state.render_busy is False
