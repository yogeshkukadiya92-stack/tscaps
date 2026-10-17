"""Measure uploaded source bytes on the server before quoting per-second credits."""
import asyncio
import hashlib
import json
import math
import os
import tempfile
from uuid import UUID
from fastapi import HTTPException
import httpx


def credits_for_duration(duration: float, quality: str) -> int:
    if not math.isfinite(duration) or duration <= 0 or duration > 1800 or quality not in ('standard', 'high'):
        raise ValueError('Invalid duration or quality')
    return math.ceil(duration / 5) * (2 if quality == 'high' else 1)


_slots = asyncio.Semaphore(2)


async def quote_source(client, owner: str, project: str, authorization: str, quality: str):
    if _slots.locked():
        raise HTTPException(429, 'Video checks are busy. Retry shortly.')
    async with _slots:
        return await _measure_source(client, owner, project, authorization, quality)


async def _measure_source(client, owner: str, project: str, authorization: str, quality: str):
    try:
        UUID(owner); UUID(project)
    except ValueError:
        raise HTTPException(400, 'Invalid project.')
    if quality not in ('standard', 'high'):
        raise HTTPException(400, 'Choose Standard or High AI quality.')
    # Fixed owner-scoped path: never fetch a user-supplied URL.
    url = os.environ['SUPABASE_URL'].rstrip('/') + f'/storage/v1/object/authenticated/reelstudio-videos/{owner}/{project}/original'
    digest = hashlib.sha256()
    size = 0
    try:
        with tempfile.TemporaryDirectory(prefix='ai-source-') as folder:
            path = folder + '/source'
            async with asyncio.timeout(120):
                async with client.stream('GET', url, headers={'Authorization': authorization, 'apikey': client.headers.get('apikey', '') or os.environ.get('SUPABASE_ANON_KEY', '')}, timeout=30) as response:
                    if response.status_code != 200:
                        raise HTTPException(409, 'Finish uploading and saving the video before using AI editing.')
                    with open(path, 'wb') as target:
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > 512 * 1024 * 1024:
                                raise HTTPException(413, 'AI editing supports source videos up to 512 MB.')
                            digest.update(chunk); target.write(chunk)
            process = await asyncio.create_subprocess_exec('ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                '-format_whitelist', 'mov,matroska,webm', '-show_entries', 'format=duration', '-of', 'json', path,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            try:
                stdout, _ = await asyncio.wait_for(process.communicate(), timeout=20)
            except BaseException:
                process.kill(); await process.wait(); raise
            duration = float(json.loads(stdout)['format']['duration'])
            if process.returncode or not math.isfinite(duration) or duration <= 0 or duration > 1800:
                raise ValueError('Invalid duration')
    except (httpx.HTTPError, TimeoutError):
        raise HTTPException(503, 'Could not read the uploaded video. Retry after the upload finishes.')
    except (ValueError, KeyError, FileNotFoundError):
        raise HTTPException(503, 'Could not measure the video. Contact support if retrying does not help.')
    return {'duration': duration, 'quality': quality, 'source_hash': digest.hexdigest() + ':' + quality,
            'credits': credits_for_duration(duration, quality)}
