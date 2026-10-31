"""Bound native inference in a spawned process that can actually be stopped.

Cancelling an asyncio thread does not stop CTranslate2/native alignment. A hung
encoder must be terminated before the admission slot can accept another job.
"""
import asyncio
import multiprocessing
import os
from fastapi import HTTPException


def _worker(connection, pcm, language, keywords):
    try:
        from groq_provider import transcribe_groq
        result = transcribe_groq(pcm, language, keywords=keywords)
        connection.send(('ok', result))
    except HTTPException as error:
        connection.send(('error', error.status_code, error.detail, getattr(error, 'draft_text', None)))
    except Exception:
        connection.send(('error', 503, 'Transcription worker failed; please retry.', None))
    finally:
        connection.close()


async def run_isolated(pcm, language, keywords=None, *, timeout=None, worker=_worker):
    seconds = timeout if timeout is not None else max(30, min(1800, float(os.getenv('TRANSCRIPTION_INFERENCE_TIMEOUT_SECONDS', '600'))))
    context = multiprocessing.get_context('spawn')
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(target=worker, args=(sender, pcm, language, keywords), daemon=True)
    started = False
    try:
        process.start()
        started = True
        sender.close()
        try:
            result = await asyncio.wait_for(asyncio.to_thread(receiver.recv), timeout=seconds)
        except TimeoutError as error:
            raise HTTPException(504, 'Transcription timed out. Please retry with a shorter clip.') from error
        except (EOFError, OSError) as error:
            raise HTTPException(503, 'Transcription worker stopped; please retry.') from error
        if result[0] == 'ok':
            return result[1]
        if result[3] is not None:
            from gujarati_alignment import AlignmentDraftError
            raise AlignmentDraftError(result[3])
        raise HTTPException(result[1], result[2])
    finally:
        # Reap the child before releasing the caller's busy slot, including on
        # timeout/disconnect. No thread can keep using the model after admission.
        if started:
            if process.is_alive():
                process.terminate()
            await asyncio.to_thread(process.join, 5)
            if process.is_alive():
                process.kill()
                await asyncio.to_thread(process.join)
            process.close()
        sender.close()
        receiver.close()
