# Budget GPU API on Coolify (recommended for ₹1,000/month budget)

Create a **Public Repository** application in the existing ReelStudio environment, repository `https://github.com/yogeshkukadiya92-stack/tscaps`, branch `main`, Dockerfile build pack, root build context, Dockerfile path **`/services/transcription/Dockerfile.api`**, HTTP port **8000**. Name it **reelstudio-gpu-transcription**. No NVIDIA card is needed on the Coolify server: audio inference is performed by Groq.

Set the same **public** `SUPABASE_URL` and `SUPABASE_ANON_KEY` as ReelStudio, `ALLOWED_ORIGINS=https://cap.yogeshaihub.in`, and **`GROQ_API_KEY` as a secret runtime variable**. The owner must enter the key directly in Coolify, never in chat or frontend config. Use a dedicated provider key. Set `GROQ_MODEL=whisper-large-v3` (accuracy) or `whisper-large-v3-turbo` (lower cost). Default `GROQ_MONTHLY_USD_LIMIT=5` is a conservative application-side reservation cap, not a currency conversion or a promise about taxes/provider-wide bills. The official rates checked on 16 October 2026 are $0.111/audio-hour for Large v3 and $0.04/audio-hour for Turbo, with word timestamps supported: [Groq speech docs](https://console.groq.com/docs/speech-to-text). Keep the provider's own billing limit within the user's ₹1,000 budget, accounting for exchange rate, tax, and any usage outside this app.

**Mount a persistent volume at `/budget`**, writable by the image's `worker` user. One worker only. A SQLite ledger reserves billable audio duration (including the provider's minimum and chunk overlap) before every request. Reservations are retained after failed upstream requests; restarting the process with the same volume does not reset usage. Calendar months use UTC. Deleting the volume resets the ledger. This is a budget guard, not authoritative provider billing. Budget exhaustion returns 429 rather than making another paid request. No automatic paid retry.

Use an HTTPS service domain and an upstream timeout of at least 15 minutes. `/health` reports transcription enabled only after the key is present. Only then set public runtime `TRANSCRIPTION_URL=https://<service-domain>` on the existing web application and redeploy. The secret stays on the backend. Local transcription remains active until this URL is configured.

The service sends mono audio to **Groq**; the video remains in the normal private project storage. Source audio is split into <=10-minute overlapping windows, each under 25 MB, and returned word times are shifted back to the original timeline. Short reels use one request. No actual Groq speed/accuracy measurement has been made without the owner's key. Existing local and CPU-server results are not evidence of Groq performance.

## Observed host staging checks

On 16 October 2026, private CPU containers were built on the existing Coolify host from commit `5b877fc`: `reelstudio-transcription` on loopback port 18081, and `reelstudio-render` on loopback port 18082, both attached to the existing `coolify` Docker network with restart policies. These are staging containers started through the host terminal, **not managed Coolify application resources**. Neither endpoint was enabled in the public frontend. The source/build logs are under `/tmp/reelstudio-processing-5b877fc` and `/tmp/reelstudio-*-build.log`; the model cache is the named volume `reelstudio-whisper-models`. The service environment file contains only existing public Supabase configuration and is permission 0600 at `/tmp/reelstudio-processing.env`.

CPU Large v3 Turbo (int8, four CPU threads, four-core container limit) processed the public 11-second JFK sample in **15.78 and 17.91 seconds**, after a cold download/load of 30.16 seconds. Both runs produced 22 words. This is a smoke benchmark, not Hindi/Gujarati accuracy validation. Transcription `/health` was ready, unauthenticated POST returned 401, and the configured Supabase auth health endpoint returned 200. The export image's real Chromium loaded ReelStudio with HTTP 200 and exposed WebCodecs; its health endpoint was ready. Authenticated project export and proxy routing remain unverified. Do not enable server export for users until those checks pass. Staging containers can be stopped when no longer needed; preserve the named model volume if it will be reused.

---

# ReelStudio processing on Coolify

The existing host was inspected on 16 October 2026: Ubuntu 24.04, 12 CPU cores, 47 GiB RAM, no NVIDIA runtime/device exposed. Start with CPU; do not select the GPU image on this host. Server processing is optional and remains off until its public HTTPS endpoints are configured in the web app.

## Transcription service

Create a separate application from this repository, repository root build context, Dockerfile `services/transcription/Dockerfile`, port **8000**. Mount a persistent volume at `/models` (writable by the image's `worker` user). Set:

```
SUPABASE_URL=<same API origin as ReelStudio>
SUPABASE_ANON_KEY=<same PUBLIC anon key as ReelStudio>
ALLOWED_ORIGINS=https://cap.yogeshaihub.in
WHISPER_MODEL=large-v3-turbo
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_CPU_THREADS=4
WHISPER_BATCH_SIZE=4
ALLOWED_USER_IDS=<initial owner's Supabase UUID>
```

Use 4 CPU / 6 GiB limits initially; keep **one Uvicorn worker**. `/health` becomes reachable after the model loads. The model is loaded once per process, cached in `/models`, and reused. Configure an HTTPS domain and upstream request timeout of at least 15 minutes. Configure the reverse proxy to cap `/transcribe` bodies at 58 MB and rate-limit requests. First boot downloads the model and is slower.

The service verifies each caller's access token with Supabase Auth. `ALLOWED_USER_IDS` restricts initial rollout; do not remove it before deciding who may consume server compute. It does not implement paid-plan entitlement checks. Requests receive 429 when the single inference slot is busy; the UI shows a retry error. No unbounded queue or automatic switch to a different accuracy model. PCM must be mono 16 kHz WAV, at most 30 minutes; raw video and arbitrary URLs are refused. Audio is held in memory during the request and never written to disk. Configure infrastructure logging accordingly.

Set public runtime `TRANSCRIPTION_URL=https://<transcription-domain>` on the existing web application and redeploy. Only a public endpoint belongs there. The browser extracts audio (about 1.92 MB/min), sends the selected speech language and user token to this service, and retains the original video for editing. Preview preparation overlaps the HTTP roundtrip. Roman Hinglish still requests Hindi and romanizes the result. Local settings remain available when the endpoint is disabled.

For a future NVIDIA host use `Dockerfile.gpu`, enable NVIDIA Container Toolkit/device reservations in Coolify, `WHISPER_DEVICE=cuda`, `WHISPER_COMPUTE_TYPE=int8_float16`. Start batch size 4; benchmark before increasing. The CUDA/cuDNN pip libraries follow the [faster-whisper installation guidance](https://github.com/SYSTRAN/faster-whisper#gpu).

## Separate server export service

Use `services/transcription/Dockerfile.render`, port **8000**, a separate application with 4 CPU / 8 GiB limits. Set the same Supabase public configuration and allow list, plus:

```
ALLOWED_ORIGINS=https://cap.yogeshaihub.in
EDITOR_ORIGIN=https://cap.yogeshaihub.in
ENABLE_TRANSCRIPTION=false
ENABLE_SERVER_RENDER=true
```

Give it an HTTPS domain and 30-minute upstream request timeout. Set public runtime `RENDER_URL=https://<render-domain>` on the web app and redeploy. **Creative → Render on server** saves the cloud project, refreshes the user's session, and asks the service to open that saved project in an isolated ephemeral browser. Private media is accessed through normal RLS and signed URLs. The service verifies ownership before launching Chromium. Projects with missing/local-only media must be saved/uploaded first. One render runs at a time; a busy service returns 429.

The service uses the existing browser compositor in WebM, preserving captions, clips and effects. MP4 requests convert that result through FFmpeg H.264/AAC at CRF 18, veryfast. MP4 therefore has an additional encoding pass, and server CPU export is not guaranteed faster than a powerful local device. Temporary files and browser sessions are removed after download/error; no refresh token is sent or persisted. Keep an account session lifetime of at least one hour. Closing/cancelling a browser request stops waiting locally; a running server export can continue until its 30-minute deadline. Do not claim background job persistence across server restarts: there is no durable job queue yet.

## Validation and rollout

1. Run service contract tests: `python -m pytest services/transcription/test_processing.py` with the API dependencies installed.
2. Verify `/health`, authenticate with the owner's session, transcribe a known Hindi/Gujarati sample, and compare text/timestamps to audio.
3. On a short saved cloud test project, compare server WebM/MP4 to device export (captions, effects, cuts, audio, duration, orientation).
4. Measure upload start, end-to-end transcription time, preview seeking, export time and concurrent-load rejection. Record the hardware and cold/warm model state. No speed multiplier is promised before these measurements.
5. Enable the public runtime endpoints only after the service checks pass. Remove the endpoints and redeploy to restore device processing.

Local development: CPU dependency pins target Python 3.11/3.12. The GPU/render container builds and real model/render smoke tests require Docker/the target server and are not established by mocked unit tests.
