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
