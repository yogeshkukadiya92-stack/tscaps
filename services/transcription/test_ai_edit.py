import json
from datetime import datetime, timedelta, timezone
import httpx
import pytest
from fastapi.testclient import TestClient
from app import app

PLAN = {'style': 'energetic', 'preset': 'bold-talk', 'options': {'pauses': True, 'zooms': True, 'polish': True, 'captions': True}, 'summary': 'Trim pauses and add bold captions.', 'limitations': []}
PAYLOAD = {'prompt': 'Cut pauses and make an energetic reel', 'transcript': 'Hello world', 'duration': 12.0, 'project_id': '11111111-1111-4111-8111-111111111111', 'request_id': '22222222-2222-4222-8222-222222222222', 'quality': 'standard', 'source_hash': 'a'*64+':standard', 'max_credits': 3}

@pytest.fixture
def setup(monkeypatch, tmp_path):
    monkeypatch.setenv('SUPABASE_URL', 'https://auth.test')
    monkeypatch.setenv('OPENAI_API_KEY', 'server-only-secret')
    monkeypatch.setenv('AI_EDIT_MODEL', 'test-model')
    monkeypatch.setenv('AI_EDIT_HIGH_MODEL', 'test-high-model')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'service-secret')
    async def quote(*args):
        quality = args[-1]
        return {'duration': 12.0, 'source_hash': 'a'*64+':'+quality, 'quality': quality, 'credits': 6 if quality == 'high' else 3}
    monkeypatch.setattr('ai_source.quote_source', quote)
    monkeypatch.setenv('AI_EDIT_USAGE_DB', str(tmp_path / 'usage.sqlite'))
    monkeypatch.setenv('AI_EDIT_DAILY_LIMIT', '2')
    monkeypatch.delenv('ALLOWED_USER_IDS', raising=False)
    app.state.auth_url = 'https://auth.test/auth/v1/user'
    app.state.public_key = 'public'
    state = {'paid': True, 'calls': 0, 'plan': PLAN, 'status': 200, 'finished': [], 'reserved': []}
    def route(request):
        if request.url.path == '/auth/v1/user':
            return httpx.Response(200 if request.headers.get('authorization') == 'Bearer valid' else 401, json={'id': 'owner'})
        if request.url.path.endswith('reelstudio_ai_reserve'):
            assert request.headers['authorization'] == 'Bearer service-secret'
            state['reserved'].append(json.loads(request.content))
            return httpx.Response(200, json={'version': 'a'*64+':standard', 'token': PAYLOAD['request_id']} if state['paid'] else {'error': 'credits'})
        if request.url.path.endswith('reelstudio_ai_finish'):
            state['finished'].append(json.loads(request.content))
            return httpx.Response(200, json=True)
        if request.url.path.endswith('reelstudio_ai_unlocked'):
            return httpx.Response(200, json=False)
        state['calls'] += 1
        assert request.headers['authorization'] == 'Bearer server-only-secret'
        body = json.loads(request.content)
        assert body['model'] in ('test-model', 'test-high-model')
        assert request.url.host == 'api.openai.com'
        assert body['response_format']['type'] == 'json_schema'
        return httpx.Response(state['status'], json={'choices': [{'message': {'content': json.dumps(state['plan'])}}]})
    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(route))
    return TestClient(app), state


def send(client, payload=PAYLOAD):
    return client.post('/ai-edit', headers={'Authorization': 'Bearer valid'}, json=payload)


def test_paid_prompt_returns_valid_edit_plan(setup):
    client, state = setup
    assert send(client).json() == PLAN
    assert state['calls'] == 1
    assert state['reserved'][0]['credit_cost'] == 3
    assert state['finished'][-1]['result'] == PLAN


def test_no_credits_does_not_call_openai(setup):
    client, state = setup
    state['paid'] = False
    assert send(client).status_code == 402
    assert state['calls'] == 0


def test_unsigned_request_never_calls_provider(setup):
    client, state = setup
    assert client.post('/ai-edit', json=PAYLOAD).status_code == 401
    assert state['calls'] == 0


@pytest.mark.parametrize('payload', [{**PAYLOAD, 'prompt': ' '}, {**PAYLOAD, 'prompt': 'a'*2001}, {**PAYLOAD, 'duration': -1}, {**PAYLOAD, 'duration': 1801}, {**PAYLOAD, 'transcript': 'a'*16001}])
def test_invalid_input_never_calls_provider(setup, payload):
    client, state = setup
    assert send(client, payload).status_code == 400
    assert state['calls'] == 0


def test_durable_daily_limit(setup):
    client, state = setup
    assert send(client).status_code == 200
    assert send(client).status_code == 200
    assert send(client).status_code == 429
    assert state['calls'] == 2


def test_invalid_ai_plan_rejected(setup):
    client, state = setup
    state['plan'] = {**PLAN, 'options': {**PLAN['options'], 'pauses': 'false'}}
    assert send(client).status_code == 502
    assert state['finished'][-1]['result'] is None


def test_provider_failure_is_retryable_and_not_leaked(setup):
    client, state = setup
    state['status'] = 500
    result = send(client)
    assert result.status_code == 503
    assert 'server-only-secret' not in result.text


def test_missing_model_disables_ai_without_charging(setup, monkeypatch):
    client, state = setup
    monkeypatch.delenv('AI_EDIT_MODEL')
    assert send(client).status_code == 503
    assert state['calls'] == 0


def test_changed_quote_does_not_charge(setup):
    client, state = setup
    assert send(client, {**PAYLOAD, 'max_credits': 2}).status_code == 409
    assert not state['reserved']
    assert state['calls'] == 0


def test_credit_estimate(setup):
    client, state = setup
    result = client.get('/ai-edit/quote?project_id=' + PAYLOAD['project_id'], headers={'Authorization': 'Bearer valid'})
    assert result.status_code == 200
    assert result.json()['charge'] == 3
    assert not state['reserved']


def test_high_quality_reserves_twice_the_credits(setup):
    client, state = setup
    result = send(client, {**PAYLOAD, 'quality': 'high', 'source_hash': 'a'*64+':high', 'max_credits': 6})
    assert result.status_code == 200
    assert state['reserved'][0]['credit_cost'] == 6
