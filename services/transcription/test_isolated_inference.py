import asyncio
import multiprocessing
import time

import pytest
from fastapi import HTTPException
from isolated_inference import run_isolated


def hang(connection, pcm, language, keywords):
    time.sleep(60)


def echo(connection, pcm, language, keywords):
    connection.send(('ok', {'words': [{'text': keywords, 'start': 0, 'end': 1}], 'language': language}))
    connection.close()


def provider_error(connection, pcm, language, keywords):
    connection.send(('error', 429, 'Monthly transcription budget reached', None))
    connection.close()


def crash(connection, pcm, language, keywords):
    connection.close()


def test_hung_native_worker_is_reaped_and_next_job_succeeds():
    async def scenario():
        with pytest.raises(HTTPException) as error:
            await run_isolated(b'', 'gu', timeout=0.2, worker=hang)
        assert error.value.status_code == 504
        assert not multiprocessing.active_children()
        for language in ['gu', 'hi']:
            result = await run_isolated(b'', language, 'spoken words', timeout=10, worker=echo)
            assert result['language'] == language
            assert result['words'][0]['text'] == 'spoken words'
        assert not multiprocessing.active_children()
    asyncio.run(scenario())


def test_cancelled_request_cannot_leave_a_native_worker_running():
    async def scenario():
        task = asyncio.create_task(run_isolated(b'', 'gu', timeout=60, worker=hang))
        await asyncio.sleep(0.2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not multiprocessing.active_children()
    asyncio.run(scenario())


@pytest.mark.parametrize('worker,status', [(provider_error, 429), (crash, 503)])
def test_worker_errors_keep_provider_budget_guards_and_reap_children(worker, status):
    async def scenario():
        with pytest.raises(HTTPException) as error:
            await run_isolated(b'', 'hi', timeout=10, worker=worker)
        assert error.value.status_code == status
        assert not multiprocessing.active_children()
    asyncio.run(scenario())
