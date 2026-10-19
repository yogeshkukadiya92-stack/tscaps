# OpenAI prompt editing with per-duration credits

## User flow
Upload a video and create/import captions → Creative → Auto Edit → enter an instruction → choose Standard or High AI quality → Estimate credits → confirm the displayed charge → preview → Apply auto edit → Save/Export.

The raw video must finish uploading to cloud storage before estimating credits. The processing service downloads that owner-scoped original, measures its actual duration with ffprobe and hashes its bytes. Client-reported duration cannot lower the charge.

- Standard: `ceil(source_seconds / 5)` credits.
- High: `2 * ceil(source_seconds / 5)` credits.
- 23 seconds: 5 Standard credits or 10 High credits.
- The same saved project's identical source bytes and quality are unlocked after the first successful AI plan. Prompt revisions then cost zero extra credits, subject to the daily request cap.
- Choosing another quality or changing the source is a separate charge, shown before confirmation.
- Credits pay for producing an editable AI plan, not for pressing Export. Discarding a successful plan does not refund it; that source/quality remains unlocked.
- Provider/schema failures release first-use credits. A disappeared worker's reservation recovers on the next attempt after two minutes. Browser cancellation may happen after the server successfully created a plan; re-estimate to see the unlocked source.

## What AI does
OpenAI interprets English/Hindi/Gujarati instructions and the existing transcript. A validated plan chooses pause removal, zooms, voice/colour polish and caption styling. Actual pause cuts use measured audio and protect spoken words. Existing preview, apply, undo, manual editing and project persistence are reused.

Standard and High select separate AI planning models; they do not magically increase video resolution. Export resolution stays in the existing Export dialog. Unsupported requests (new music, generated B-roll, translation, cutting spoken fillers, highlight extraction or exact target duration) are reported as limitations rather than silently claimed as completed. This version does not perform visual semantic analysis of frames.

## Server configuration
Set secrets only on the processing server, never in config.js:

```
OPENAI_API_KEY=<server secret>
AI_EDIT_MODEL=<OpenAI model supporting Chat Completions structured outputs>
AI_EDIT_HIGH_MODEL=<higher-quality supported OpenAI model>
SUPABASE_SERVICE_ROLE_KEY=<server secret for atomic credit RPCs>
SUPABASE_URL=<existing Supabase URL>
SUPABASE_ANON_KEY=<existing public key>
AI_EDIT_USAGE_DB=/budget/ai-edit.sqlite
AI_EDIT_DAILY_LIMIT=20
```

Persist `/budget` across restarts. The processing Dockerfiles now install ffmpeg/ffprobe. Source checks accept MP4/MOV/WebM, at most 512 MB and 30 minutes. Two source checks may run simultaneously per worker. Keep existing proxy body/time limits compatible. The server makes OpenAI requests only to `https://api.openai.com/v1/chat/completions` and validates structured output before applying anything.

## Credits and checkout
1. Apply `supabase/migrations/20261017_reelstudio_ai_credits.sql`.
2. Deploy `reelstudio-credits` and the updated `razorpay-webhook` Edge Functions.
3. Set the existing Razorpay and Supabase secrets and `APP_ORIGIN`.
4. Set `AI_CREDIT_PACK_SIZE` and `AI_CREDIT_PACK_AMOUNT_PAISE` after the owner chooses a rupee price. No price has been invented; purchase remains unavailable until these are set.
5. Enable signed `order.paid` / `payment.captured` webhook events for the same webhook endpoint. Credits are granted only after authoritative order state is paid, and only once even with duplicate webhooks.
6. Rebuild/deploy processing and studio. The existing public `transcriptionUrl` points to both transcription and AI edit routes.

Credits are separate from existing subscriptions. The existing whole-app subscription gate is unchanged; keep it disabled if the business model is a free base editor plus credit-based AI only. Refunds/chargebacks require operator review; no automatic wallet clawback is implemented.

## Release verification still needed
Run a real OpenAI request with configured models, Razorpay test-mode checkout and signed webhook delivery, then a physical-phone upload/quote/edit/export. Unit/integration tests use mocked OpenAI and payments; they do not incur charges. No deployment or real charge is performed by this implementation task.

API reference used: https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat

### Gujarati caption accuracy and timing

With `GUJARATI_AUDIO_ASSIST=auto` (default) and `OPENAI_API_KEY`, Gujarati
uses OpenAI `gpt-transcribe` with Gujarati and English language hints, then
local acoustic forced alignment. Full reels are transcribed intact: fixed
four-second cuts lose context for loanwords and can omit words at boundaries.
Recordings over ten minutes split near a quiet audio frame; every original
sample belongs to exactly one chunk, each below the provider's 25 MB limit.

`GUJARATI_TRANSCRIPTION_MODEL=gpt-4o-transcribe` is an explicit compatibility
option. Models are not silently substituted or retried after a paid failure.
Each model reserves twice its documented audio-minute estimate against the
existing independent OpenAI monthly budget. Current model/schema/rates:
https://developers.openai.com/api/docs/guides/speech-to-text
https://developers.openai.com/api/docs/pricing

`Dockerfile.api` includes a pinned CPU alignment runtime and multilingual Large
v3 Turbo snapshot at `/models/aligner`, plus the full multilingual Large v3 decoder at `/models/aligner-full`. Both snapshots are pinned. The full decoder loads once on demand when the first measurement has an invalid word. `GUJARATI_ALIGNMENT_MODEL` overrides the
local directory. Startup validates the required 128-mel preprocessing asset and
loads the model once. Requests never download models. Other languages retain
Groq transcription.

Forced alignment preserves the complete OpenAI transcript, including short
Gujarati words. It does not discard zero-duration words, silently remove an
unaligned tail, or allocate guessed time evenly through gaps. Missing words,
invalid/reversed/zero timestamps, or >3-second word spans fail without replacing
the user's captions. If the pruned decoder collapses a word, the full multilingual decoder measures the same complete audio/text once. An isolated collapsed word can use that independently measured interval only if the words match and neighbouring timestamps remain ordered. No additional paid ASR call is made. The current transcript is never a Whisper prefix prompt.

Responses identify provider, model, alignment and protocol version 9 for live
verification. Health exposes `gujarati_alignment_version: 9` and non-content
failure diagnostics. Audio is held in request memory only. Successful HTTP status
and valid timing bounds do not establish perfect speech-recognition accuracy:
compare the full video with the generated words, including technical terms,
short function words, long pauses and the ending.

Gujarati spelling is checked before alignment with `gpt-5.4-mini-2026-03-17` using structured, indexed one-word replacements. At most eight phonetically similar Gujarati-word edits are accepted; short words, English names, word counts and order are protected. The fixed 1024-token completion and conservative UTF-8 input bound reserve twice published $.75/$4.50 per-million-token prices against the same OpenAI transcription cap. Proofreading failure does not overwrite captions. Model/pricing: https://developers.openai.com/api/docs/models/gpt-5.4-mini

On an alignment failure, only the authenticated request receives its own untimed `draftText` with HTTP 503. The draft is not a valid timed-caption result and is not exposed through public health or stored by the service.

A narrow Gujarati loanword lexicon canonicalizes observed phonetic variants of embroidery to એમ્બ્રોઇડરી, preserving the already-recognized suffix and punctuation. It cannot insert a missing word or alter an unrelated word. This runs before proofreading and after accepted corrections.

Use Gujarati as the single language hint for Gujarati speech. Optional `GUJARATI_TRANSCRIPTION_KEYWORDS` is a comma-separated deployment vocabulary (at most 16 terms, 64 characters each). Supply real names and terminology from the recording; the ASR sends these as `keywords[]`, not previous-transcript prefix text. This deployment uses the owner's Wilcom/Codex/embroidery terminology. Vocabulary guides recognition but does not bypass acoustic validation.

The Gujarati start/retranscribe dialog has an optional Names & technical words field. Terms are sent only for that recording as the bounded `keywords` query parameter. An explicit empty list clears deployment defaults, so the next video does not inherit the previous recording's names. Other languages and local decoders retain their existing behavior.
