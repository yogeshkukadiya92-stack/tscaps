import asyncio
from pathlib import Path
import httpx
import pytest
from fastapi import HTTPException
from ai_source import quote_source

FIXTURE = Path(__file__).resolve().parents[2] / 'apps/studio/tests/e2e/fixtures/sample-with-audio.mp4'
OWNER = '11111111-1111-4111-8111-111111111111'
PROJECT = '22222222-2222-4222-8222-222222222222'

@pytest.mark.parametrize('quality,multiplier', [('standard', 1), ('high', 2)])
def test_real_video_duration_is_measured_not_client_reported(monkeypatch, quality, multiplier):
    monkeypatch.setenv('SUPABASE_URL', 'https://storage.test')
    async def run():
        def handler(request):
            assert request.url.path.endswith(f'/{OWNER}/{PROJECT}/original')
            assert request.headers['authorization'] == 'Bearer test'
            return httpx.Response(200, content=FIXTURE.read_bytes())
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await quote_source(client, OWNER, PROJECT, 'Bearer test', quality)
    result = asyncio.run(run())
    assert 1 < result['duration'] < 5
    assert result['credits'] == multiplier
    assert result['source_hash'].endswith(':'+quality)


def test_missing_upload_has_no_quote(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', 'https://storage.test')
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(404))) as client:
            await quote_source(client, OWNER, PROJECT, 'Bearer test', 'standard')
    with pytest.raises(HTTPException) as error: asyncio.run(run())
    assert error.value.status_code == 409


@pytest.mark.parametrize('seconds,standard,high', [(0.1,1,2),(5,1,2),(5.01,2,4),(23,5,10),(60,12,24),(1800,360,720)])
def test_five_second_credit_blocks(seconds, standard, high):
    from ai_source import credits_for_duration
    assert credits_for_duration(seconds, 'standard') == standard
    assert credits_for_duration(seconds, 'high') == high
