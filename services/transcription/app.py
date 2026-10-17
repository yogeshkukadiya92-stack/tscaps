"""One warm model per worker. Audio is held in memory only for its request."""
import asyncio
import os
import re
import wave
import tempfile
from uuid import UUID
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from audio import MAX_BYTES, decode_wave


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.auth_url = os.environ['SUPABASE_URL'].rstrip('/') + '/auth/v1/user'
    app.state.public_key = os.environ['SUPABASE_ANON_KEY']
    app.state.provider = os.getenv('TRANSCRIPTION_PROVIDER', 'local')
    if app.state.provider not in ('local', 'groq'):
        raise RuntimeError('Unsupported transcription provider')
    if os.getenv('ENABLE_TRANSCRIPTION', 'true') == 'true' and app.state.provider == 'local':
        from faster_whisper import WhisperModel, BatchedInferencePipeline
        device = os.getenv('WHISPER_DEVICE', 'cpu')
        model = await run_in_threadpool(lambda: WhisperModel(
            os.getenv('WHISPER_MODEL', 'large-v3-turbo'), device=device,
            compute_type=os.getenv('WHISPER_COMPUTE_TYPE', 'int8_float16' if device == 'cuda' else 'int8'),
            download_root='/models', cpu_threads=int(os.getenv('WHISPER_CPU_THREADS', '4')),
            num_workers=1,
        ))
        app.state.engine = BatchedInferencePipeline(model=model)
    app.state.busy = False
    app.state.render_busy = False
    app.state.http = httpx.AsyncClient(timeout=15, follow_redirects=False)
    yield
    await app.state.http.aclose()


app = FastAPI(lifespan=lifespan, root_path=os.getenv('API_ROOT_PATH', ''))
origins = [value.strip() for value in os.getenv('ALLOWED_ORIGINS', '').split(',') if value.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['POST', 'GET'],
                   allow_headers=['Authorization', 'Content-Type'])


@app.get('/health')
async def health():
    return {'ready': True, 'transcription': hasattr(app.state, 'engine') or (app.state.provider == 'groq' and bool(os.getenv('GROQ_API_KEY'))), 'busy': app.state.busy, 'render_busy': app.state.render_busy}


async def authorize(request: Request):
    bearer = request.headers.get('authorization', '')
    if not bearer.startswith('Bearer ') or len(bearer) > 8192:
        raise HTTPException(401, 'Sign in to transcribe')
    try:
        result = await app.state.http.get(app.state.auth_url,
            headers={'Authorization': bearer, 'apikey': app.state.public_key})
    except httpx.HTTPError:
        raise HTTPException(503, 'Authentication temporarily unavailable')
    if result.status_code != 200:
        raise HTTPException(401, 'Session expired')
    user = result.json()
    allowed = {value.strip() for value in os.getenv('ALLOWED_USER_IDS', '').split(',') if value.strip()}
    if not user.get('id') or (allowed and user['id'] not in allowed):
        raise HTTPException(403, 'Account not enabled for processing')
    return user


def infer(body: bytes, language: str | None):
    try:
        pcm = decode_wave(body)
    except (ValueError, EOFError, wave.Error) as error:
        # Decode is isolated from model errors and never leaks request contents.
        raise HTTPException(400, 'Expected a valid mono 16 kHz PCM16 WAV') from error
    if app.state.provider == 'groq':
        from groq_provider import transcribe_groq
        return transcribe_groq(pcm, language)
    segments, info = app.state.engine.transcribe(pcm, language=language, task='transcribe',
        beam_size=5, batch_size=int(os.getenv('WHISPER_BATCH_SIZE', '8')),
        word_timestamps=True, vad_filter=True, condition_on_previous_text=False,
        vad_parameters={'min_silence_duration_ms': 500})
    words = []
    for segment in segments:
        for word in segment.words or []:
            if word.word.strip():
                words.append({'text': word.word.strip(), 'start': word.start, 'end': word.end})
    return {'words': words, 'language': info.language}


@app.post('/transcribe')
async def transcribe(request: Request, language: str | None = None):
    await authorize(request)
    if not hasattr(app.state, 'engine') and app.state.provider != 'groq':
        raise HTTPException(503, 'Transcription is not enabled')
    if language is not None and not re.fullmatch(r'[a-z]{2,3}', language):
        raise HTTPException(400, 'Invalid speech language')
    if request.headers.get('content-type', '').split(';')[0] != 'audio/wav':
        raise HTTPException(415, 'Send audio/wav')
    # No wait between check and assignment: admission is atomic on this worker's event loop.
    if app.state.busy:
        raise HTTPException(429, 'Transcription server busy; retry shortly', headers={'Retry-After': '10'})
    app.state.busy = True
    try:
        body = bytearray()
        async with asyncio.timeout(120):
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_BYTES:
                    raise HTTPException(413, 'Audio exceeds 30 minutes')
                body.extend(chunk)
        return await run_in_threadpool(infer, bytes(body), language)
    except TimeoutError:
        raise HTTPException(408, 'Audio upload timed out')
    finally:
        app.state.busy = False


@app.post('/render')
async def render(request: Request, project_id: UUID, output_format: str = 'mp4'):
    user = await authorize(request)
    if os.getenv('ENABLE_SERVER_RENDER', 'false') != 'true':
        raise HTTPException(503, 'Server export is not enabled')
    if output_format not in ('mp4', 'webm'):
        raise HTTPException(400, 'Invalid output format')
    # Reject missing/foreign/deleted projects through the caller's RLS before launching a browser.
    lookup = await app.state.http.get(os.environ['SUPABASE_URL'].rstrip('/') + '/rest/v1/reelstudio_projects',
        params={'select': 'id', 'id': 'eq.' + str(project_id), 'user_id': 'eq.' + user['id'], 'deleted_at': 'is.null'},
        headers={'Authorization': request.headers['authorization'], 'apikey': app.state.public_key})
    if lookup.status_code != 200 or not lookup.json():
        raise HTTPException(404, 'Cloud project not found')
    if app.state.render_busy:
        raise HTTPException(429, 'Export server busy; retry shortly', headers={'Retry-After': '10'})
    app.state.render_busy = True
    folder = tempfile.TemporaryDirectory(prefix='reelstudio-render-')
    try:
        from render import render_project
        async with asyncio.timeout(30 * 60):
            path = await render_project(str(project_id), request.headers['authorization'][7:], user, folder.name, output_format)
        return FileResponse(path, media_type='video/mp4' if output_format == 'mp4' else 'video/webm',
                            filename='reelstudio.' + output_format, background=BackgroundTask(folder.cleanup))
    except BaseException as error:
        folder.cleanup()
        if not isinstance(error, Exception):
            raise
        raise HTTPException(503, 'Server export failed. Retry or use device export.') from error
    finally:
        app.state.render_busy = False


@app.post('/ai-edit')
async def ai_edit(request: Request):
    from ai_edit import EditRequest, credit_rpc, generate_plan
    from pydantic import ValidationError
    import json
    user = await authorize(request)
    body = bytearray()
    try:
        async with asyncio.timeout(15):
            async for chunk in request.stream():
                if len(body) + len(chunk) > 100000:
                    raise HTTPException(413, 'AI editing request is too large.')
                body.extend(chunk)
        payload = EditRequest.model_validate(json.loads(body))
        if not payload.prompt.strip():
            raise ValueError('Empty prompt')
    except (ValueError, ValidationError):
        raise HTTPException(400, 'Enter an instruction of 3–2000 characters and a video up to 30 minutes.')
    except TimeoutError:
        raise HTTPException(408, 'Request upload timed out.')
    from ai_source import quote_source
    quote = await quote_source(app.state.http, user['id'], payload.project_id, request.headers['authorization'], payload.quality)
    if quote['source_hash'] != payload.source_hash or quote['credits'] > payload.max_credits:
        raise HTTPException(409, 'The video or price changed. Review a new quote before continuing.')
    payload = payload.model_copy(update={'duration': quote['duration']})
    params = {'owner_id': user['id'], 'video_id': payload.project_id, 'attempt_id': payload.request_id}
    reservation = await credit_rpc(app.state.http, 'reelstudio_ai_reserve', {**params, 'source_hash': quote['source_hash'], 'credit_cost': quote['credits']})
    if not isinstance(reservation, dict):
        raise HTTPException(503, 'Could not confirm AI credits.')
    if 'cached' in reservation:
        return reservation['cached']
    if reservation.get('error'):
        reason = reservation['error']
        raise HTTPException(402 if reason == 'credits' else 409,
            'Buy AI credits to edit this video.' if reason == 'credits' else 'Save this project first, or wait for its current AI edit to finish.')
    finish = {**params, 'version': reservation['version']}
    try:
        plan = await generate_plan(app.state.http, payload, user['id'])
        completed = await credit_rpc(app.state.http, 'reelstudio_ai_finish', {**finish, 'result': plan})
        if completed is not True:
            raise HTTPException(409, 'This edit expired. Retry to recover your credit.')
        return plan
    except BaseException:
        # Failures release a first-use credit. Expired reservations also recover on retry.
        try:
            await asyncio.shield(credit_rpc(app.state.http, 'reelstudio_ai_finish', {**finish, 'result': None}))
        except Exception:
            pass
        raise


@app.get('/ai-edit/quote')
async def ai_edit_quote(request: Request, project_id: UUID, quality: str = 'standard'):
    from ai_source import quote_source
    user = await authorize(request)
    from ai_edit import credit_rpc
    quote = await quote_source(app.state.http, user['id'], str(project_id), request.headers['authorization'], quality)
    unlocked = await credit_rpc(app.state.http, 'reelstudio_ai_unlocked', {'owner_id': user['id'], 'video_id': str(project_id), 'source_hash': quote['source_hash']})
    return {**quote, 'charge': 0 if unlocked is True else quote['credits']}
