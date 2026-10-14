# ReelStudio

ReelStudio is a browser-based Reels editing studio, built on the open-source Tscaps editor.

**Edit reels and animated captions in your browser, with optional private Supabase accounts and cloud projects.**

ReelStudio is a subtitle editor for short-form video (TikTok, Reels, Shorts). Drop a video, transcribe it with in-browser Whisper, pick a template, tune the controls, and export the result with captions burned into the pixels. Transcription and rendering run on your device. When Supabase is configured, source videos and project edits upload to your private account; without cloud configuration, projects stay in this browser.

## Supabase accounts and Coolify deployment

Provision a dedicated Supabase service and apply `supabase/migrations/20261014_reelstudio_projects.sql` to its Postgres database. It creates owner-protected project records and a private `reelstudio-videos` bucket. Videos up to 500 MB are supported. Database row-level security and storage policies restrict each account to its own data.

Set these **runtime** environment variables on the ReelStudio application in Coolify:

- `SUPABASE_URL`: the HTTPS Kong API origin.
- `SUPABASE_ANON_KEY`: the public anon key (never the service-role key, JWT secret, or database password).

The repository Dockerfile includes an nginx startup script that writes public settings to `config.js`. For an existing inline Coolify Dockerfile, also copy `/workspace/apps/studio/docker/40-reelstudio-config.sh` from the build stage into `/docker-entrypoint.d/40-reelstudio-config.sh` and make it executable. Pin the source archive to the updated commit. `config.js` is served with `no-store`.

For local development, use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in an ignored `.env.local` file. With no configuration, the existing local editor remains available.

Configure Supabase Auth's site URL and redirect allow list for your ReelStudio domain. Keep email confirmation enabled and configure working SMTP for signup confirmation and password recovery. Sign up, sign in, restored sessions, sign out, and password recovery use Supabase Auth. Import existing projects with **Import projects from this browser**; originals are retained locally. Missing local videos still need relinking. Deleted cloud projects can be recovered using **Recently deleted → Restore**.

### Automatic deployments from main

The running `tscaps-custom-styles` application receives signed GitHub **push** webhooks for `yogeshkukadiya92-stack/tscaps` and deploys changes to `main`. Coolify's repository and branch must match that source, and **Auto deploy** must remain enabled. The existing inline Dockerfile keeps the additional custom styles and uses `ARG SOURCE_COMMIT=main` in its source archive URL. **Source commit availability for builds** is enabled so a webhook deployment downloads the pushed commit, rather than a fixed older archive or a cached branch build.

The custom-style build step merges its five template names into the current registry instead of replacing that file, preserving newly added repository templates.

Configure the repository webhook with Coolify's **Manual Git webhooks → GitHub** URL, JSON content, SSL verification enabled, the application's existing webhook secret and push events only. Keep the secret in GitHub/Coolify settings; never commit it. After a push, confirm a **Webhook** deployment with the same commit appears in Coolify's Deployment Logs. Manual deployments remain available.

Back up both Postgres and the storage volume: database backups alone do not contain video objects. Editing the same project on multiple devices concurrently uses the last completed save.

Cloud source videos use Supabase's resumable (TUS) endpoint with 6 MB chunks. An upload strip shows transferred bytes and percentage above the editor, including during transcription and project saving. Transient connection/server failures retry automatically. **Retry** continues interrupted transfers from the server's last accepted chunk; **Cancel** stops the transfer and **Resume** continues it later. Cancellation does not discard your current captions or mark the project saved. The project is saved only after the source upload and metadata write both succeed.

The browser retains pending source files, upload URLs and project drafts in IndexedDB, scoped to the configured storage endpoint and signed-in owner. Refreshing or reopening the app restores them without selecting the file again. Active/interrupted uploads resume automatically when online; **Cancel** is remembered across reloads and requires an explicit **Resume**. Offline uploads wait for the connection to return. The upload strip also shows recent transfer speed and an approximate remaining time; estimates reset on Resume and disappear during stalls. Recovered drafts open via **Open project**, and their metadata is synced only after the upload succeeds. Completed saves remove their pending source and draft. Signing out aborts and hides in-memory transfers while preserving that account's local recovery records for its next sign-in.

Refresh recovery requires available browser storage. If saving the source fails (for example, quota exhaustion), the upload still runs and the strip explicitly asks you to keep the tab open. Clearing site data removes local recovery records. Completed chunks can expire on the storage server; expired uploads restart automatically. Self-hosted Supabase's gateway must expose `/storage/v1/upload/resumable`, allow the TUS `POST`, `HEAD`, `PATCH` and `OPTIONS` requests with upload/authorization/API-key headers, and expose the `Location`, `Upload-Offset`, `Upload-Length` and `Tus-Resumable` response headers through CORS. Hosted Supabase uses its direct storage hostname; self-hosted installs keep their configured API origin.

Every caption template is CSS. You can pick one from the gallery and tune it with the editor controls (font, size, colour, timing, animation). Or open the CSS tab and write whatever you want. The controls are the surface; CSS is the escape hatch that keeps the door open.

## Sample outputs

### Change transcription language or replace captions

In an existing project, open **Captions → Transcript → Change language / Retranscribe**. Choose the speech language and original script or Roman Hinglish, then **Replace all captions**. You can also replace the transcript with an SRT or VTT file. This uses the original source and cached transcription model without regenerating the video preview. Processing time still depends on the model and device.

Existing captions remain intact if transcription fails. A successful replacement keeps the caption templates, video cuts and project identity, replaces caption edits and individual styling, and can be restored with **Undo**. Click **Save** to persist the replacement. Language selection controls speech recognition; it does not translate speech into another language.

### Audio to subtitles

Choose **New project** and upload MP3, WAV, M4A, AAC, OGG or FLAC audio. The browser prepares a neutral vertical caption canvas with your audio. Transcribe it, correct the words and choose a caption template as usual. Under **Export → Subtitles**, download SRT for text/timing or ASS for base font, size, colours, position and karaoke timing. ASS playback requires the chosen fonts installed; full CSS animation, layered artwork and depth are preserved through video export.

Each of these is a caption template that ships in the repository. All rendered by the browser, exported frame by frame.

<table>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/91730bd9-8177-4f91-b9af-6864366e193f" autoplay loop muted playsinline></video></td>
    <td><video src="https://github.com/user-attachments/assets/08a92ca4-8791-4c18-8d1e-54d012038b6b" autoplay loop muted playsinline></video></td>
    <td><video src="https://github.com/user-attachments/assets/01291786-f277-4288-bd61-ac155272ad05" autoplay loop muted playsinline></video></td>
    <td><video src="https://github.com/user-attachments/assets/b731cdc4-9797-454f-9bb6-990e3789fa2c" autoplay loop muted playsinline></video></td>
  </tr>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/b0daa473-61de-4fd1-af4d-ff34f45f77df" autoplay loop muted playsinline></video></td>
    <td><video src="https://github.com/user-attachments/assets/54aa367a-2f19-4a47-9d33-d36bef199c9b" autoplay loop muted playsinline></video></td>
    <td><video src="https://github.com/user-attachments/assets/f7a48a6b-90d4-49c4-b26b-6c88fda0ccf6" autoplay loop muted playsinline></video></td>
    <td><video src="https://github.com/user-attachments/assets/fb0f5d7c-bd35-4f9c-8d59-48c69b1cf9f6" autoplay loop muted playsinline></video></td>
  </tr>
</table>

<video src="https://github.com/user-attachments/assets/4b1e3e38-13fa-4e33-8756-4b30c67203d8" autoplay loop muted playsinline></video>

> [!NOTE]
> Every clip on this page was made with the hosted version at [tscaps.io](https://tscaps.io). There, an LLM reads the transcript and tags some words or phrases. For example, it can tag entities, words to emphasize, the hook of the video, and more. The templates style then the words using these tags, which are referenced as CSS classes.
>
> The local version has the same tagging system, but it doesn't use an LLM, so these semantic tags are not applied automatically. You can still achieve the same result though, since you can manually tag any word.

## Features

**Editor**

- **38 animated caption templates** across five families (Modern, Key moments, Viral, Classic, Lab). Each template ships with colour presets and editor controls for font, size, weight, colour, spacing, animation, and more. CSS is available for anything the controls do not cover.
- **Word-by-word timing.** Each word carries its own start and end. Enables karaoke reveal, per-word emphasis, and per-word style overrides.
- **Per-element editing.** Click a word, a scene, or an emoji in the preview. A panel opens with that element's own typeface, size, weight, colour, rotation, and position. Or write CSS directly for it.
- **Motion controls.** Pick how each scene enters, how words arrive, how emojis move. Each animation has its own timing and easing controls.
- **Multi-sheet styling.** Assign different looks to different parts of the video. Sheets can be linked so a style change rides across all of them.
- **Timeline and cuts.** A waveform timeline where you select and cut silences or unwanted stretches. Auto-cut over silences. Captions realign to the shortened timeline.
- **Text behind subject.** Captions render behind the speaker via on-device person segmentation. No upload, no server.
- **Right-to-left and mixed-script.** Arabic, Hebrew, Persian, Urdu, and mixed-direction text resolves through the Unicode bidirectional algorithm.

**Transcription and I/O**

- **In-browser transcription.** Whisper runs on the device (tiny, base, small, medium). No API key, no account, no audio uploaded.
- **Download models once.** Whisper and behind-person models are saved in browser storage and reused after refresh or reopening the browser. Cache Storage has an IndexedDB fallback, and concurrent behind-person requests share one download. Switching models or backend may need different files; clearing site data or blocking browser storage requires downloading again. Loading a saved model into memory is shown as loading, not as another download.
- **Import SRT or VTT.** The hosted product has free tools at [tscaps.io/tools](https://tscaps.io/tools) for this: drop a video and a subtitle file, style the captions, export. No transcription step, no account.
- **Export subtitle files.** Write the captions back to SRT, VTT, ASS, SBV, or plain text, with optional word-level timing.
- **Frame-accurate video export.** The browser rasterizes the caption DOM at each frame, composites it with the video, and encodes the result to mp4 via WebCodecs.

**For developers**

- **Templates as code.** Each template is a folder of JSON + CSS that anyone can read and edit. Fork the repo and open a PR.
- **Embeddable engine.** The rendering engine ships separately on npm as [`@tscaps/engine`](https://www.npmjs.com/package/@tscaps/engine). Embed it in your own product without the editor UI.
- **Automation API.** Subtitle videos programmatically at scale via the [Tscaps Automation API](https://tscaps.io/api). Send a video, choose a style, and receive the captioned MP4 rendered in the cloud for your apps or bulk pipelines.

## How it works

1. **Drop a video.** The browser reads it through the WebCodecs API.
2. **Transcribe.** In-browser Whisper produces word-level timing. First run downloads the model (about 80 MB), cached after that.
3. **Style.** Pick a template, tune the controls, edit individual words. The live preview overlays the caption DOM on the video.
4. **Export.** For each output frame, the engine rasterizes the caption DOM into a bitmap, composites it with the source frame, and encodes the result back into mp4.

Captions are HTML elements styled with CSS in both preview and export. The browser renders them both times.

## What's in this repository

| Path | What it is |
|---|---|
| [`packages/engine`](packages/engine) | The framework-agnostic TypeScript engine that does the rendering. Published to npm as [`@tscaps/engine`](https://www.npmjs.com/package/@tscaps/engine). |
| [`apps/studio`](apps/studio) | The web app that wraps the engine in a UI: drop a video, edit captions, export. |
| [`templates`](templates) | The visual-style gallery the editor consumes. Each template is a folder of JSON and CSS. See [templates/AUTHORING.md](templates/AUTHORING.md) to write one. |
| [`skills`](skills) | Official AI agent skills, such as [`tscaps-api`](skills/tscaps-api) for automated video captioning via the Tscaps API. |

## Tscaps as a hosted product

A hosted version runs at **[tscaps.io](https://tscaps.io)** with two surfaces sharing the same editor:

- **[Local](https://tscaps.io/local).** The same in-browser flow this repository ships. Free, no signup. Transcription via in-browser Whisper. Speed depends on the device.
- **[Cloud](https://tscaps.io).** Server-side transcription (faster, more accurate), AI-driven styling, cross-device project sync. Free tier with a watermark. Paid tiers remove the watermark and raise limits.
- **[Automation API](https://tscaps.io/api).** Cloud API to subtitle videos programmatically. Send a video, pick any template, and get the edited video back with animated subtitles.

The cloud server is not open source. This repository is the open-source equivalent of the local surface: same editor, same engine, same templates, no server in the loop. Self-host it, fork it, or embed the engine in your own product.

## Run the web app

### With Docker (pre-built image)

The fastest path:

```bash
docker run -p 8080:80 ghcr.io/francozanardi/tscaps-web:latest
```

Open `http://localhost:8080`. The image is a static nginx serving the production bundle.

### With Docker (from source)

If you want to customise the build (templates, branding, environment), build the image locally. Build context is the workspace root:

```bash
docker build -f apps/studio/Dockerfile -t tscaps-web .
docker run -p 8080:80 tscaps-web
```

### From source (no Docker)

```bash
pnpm install
pnpm --filter ./apps/studio dev
```

Open the URL the dev server prints. Drop a video and the editor opens with the transcribe flow ready.

To produce a static bundle:

```bash
pnpm --filter ./apps/studio build
```

Output lands in `apps/studio/dist/`.

## Use the engine directly

The engine ships separately so you can embed it in your own product without the editor UI.

```bash
npm install @tscaps/engine
```

```ts
import { RenderPipelineBuilder } from '@tscaps/engine';

const inputVideo: Blob = /* from a file input, fetch, etc. */;

const pipeline = new RenderPipelineBuilder()
  .withInputVideo(inputVideo)
  .build();

const { blob } = await pipeline.run();
// `blob` is a Blob containing the captioned mp4
```

The full pipeline API, every styling knob, every transcriber, every splitter, the document model, and the tag system live in **[packages/engine/README.md](packages/engine/README.md)**, with worked examples and GIFs of each result.

## Templates

A template is a self-contained visual style for burned-in subtitles: a folder containing a `template.json` (metadata, controls, alignment) and a `style.scss` (the visual rules), plus an optional `filters.svg`. The stylesheet is Sass so a template can call the shared primitives under `templates/_lib/`. A build step compiles it to a flat `style.build.css`, and that is what the runtime reads. Nothing resolves at runtime, so the artifact stays editable by anyone who knows CSS.

The author guide is **[templates/AUTHORING.md](templates/AUTHORING.md)**, which builds a template from nothing a step at a time. The deep reference (the full `template.json` schema, the CSS variable contract, animation patterns, the primitive library, SVG filters, the live-vs-export differences, and the author's checklist) lives in **[templates/_docs/](templates/_docs)**.

If you have never written one and want to learn by reading: the existing templates under `templates/` are the canonical examples.

### Contribute a template

Templates are the easiest way to contribute. The CSS contract is documented end to end, the existing folders are working references, and a good template can ship in a single PR with zero build-system changes.

Open a PR with a new folder under `templates/` and the editor picks it up automatically.

## Document model

Every transcriber produces a `Document`. Templates style it. The hierarchy is:

```
Document
└── Section[]   contiguous run, processed by one splitter + tagger chain
    └── Segment[]   one screen-sized caption block, carries a time range
        └── Line[]   one visible line of text within a segment
            └── Word[]   a word with text, time range, and tag set
```

The render layer exposes that tree to CSS through three surfaces: a flat set of CSS classes per element, a flat set of CSS custom properties per element, and a tag system that adds more classes via taggers. Every styling decision a template makes targets one of those three surfaces.

The full description lives in [packages/engine/README.md](packages/engine/README.md#document-model).

## How tscaps compares

Tscaps sits in a gap between closed caption editors and general-purpose video editors. This table is intentionally coarse. Feature sets change; check each product for the current state.

|  | tscaps (this repo) | tscaps.io cloud | Closed caption editors (Submagic, Captions.ai, VEED) | Desktop editors (Premiere, DaVinci, CapCut) |
|---|---|---|---|---|
| Runs in your browser | Yes | Yes | Most | No |
| Video stays on your device | Yes | No | No | Yes |
| Open source | Yes | No | No | No |
| Free, no watermark | Yes | Free tier, watermarked | Free tier, watermarked | Varies |
| Account required | No | Yes | Yes | No |
| Animated caption templates | 38, CSS-driven, editable | Same + AI styling | Fixed list | Limited |
| Edit template CSS directly | Yes | Yes | No | No |
| Per-word and per-scene overrides | Yes | Yes | Limited | Manual keyframes |
| Timeline with cuts | Yes | Yes | Some | Yes |
| Text behind subject | Yes, on-device | Yes, on-device | No | Manual masking |
| Transcription | On-device Whisper | Server-side (faster) | Server-side | Varies |
| Multi-speaker | Manual | Automatic + manual | Automatic | Manual |
| AI-driven styling | No | Yes | Yes | No |
| SRT / VTT import | Via [tscaps.io/tools](https://tscaps.io/tools) | Via tools + editor | Yes | Yes |
| Subtitle file export | SRT, VTT, ASS, SBV, TXT | Same | Some | Yes |
| Embeddable engine on npm | Yes | N/A | No | No |
| Mobile app | No (but web works on mobile) | Same | Some | Yes (CapCut) |

**The positioning is framework, not a preset picker.** Closed tools give you a fixed list of looks. Tscaps gives you a gallery of templates you can read, edit, and extend, with editor controls on top and CSS as the escape hatch.

## FAQ

**Does tscaps upload my video anywhere?**
No, not in this build. The video never leaves the browser. The hosted [tscaps.io](https://tscaps.io) cloud surface does send the audio track to a server for transcription, and stores saved projects for cross-device sync. For a zero-server experience, use [tscaps.io/local](https://tscaps.io/local) or self-host this repository.

**How accurate is the in-browser transcription?**
It depends on the model and the device. Tscaps ships four Whisper models: tiny, base, small, and medium. On a laptop, small is a solid default. On a modern desktop, medium runs well. Phones are slow. If accuracy or speed matters, the cloud transcription at tscaps.io is faster and more accurate.

**Which video formats can I open?**
Anything the browser's WebCodecs API can decode: mp4 (H.264, H.265 on Safari and recent Chrome), webm (VP8, VP9, AV1), mov. Rotated videos are supported.

**Can I import captions from an SRT or VTT file?**
Yes. The hosted product has free tools at [tscaps.io/tools](https://tscaps.io/tools) for this: drop a video and a subtitle file, style the captions, export. No account needed.

**Do I need to know CSS?**
No. The editor has controls for font, size, weight, colour, spacing, animation, and per-element overrides. CSS is available for anything the controls do not cover, but you can style a full video without opening it.

**Can I write my own caption template?**
Yes. A template is a folder with `template.json` (metadata + editor controls) and `style.scss` (the visual rules). See [templates/AUTHORING.md](templates/AUTHORING.md) for a step-by-step guide and [templates/_docs/](templates/_docs) for the reference.

**Is this the same code as tscaps.io/local?**
Almost. Both run the same editor against the same engine. Two differences. First, tscaps.io/local shows some features as locked, with a link to the cloud version; this repository omits those features, so nothing in the UI mentions the hosted product. Second, tscaps.io/local sends anonymous usage events; this repository has no telemetry.

**Does it work on mobile?**
The editor loads on mobile. In-browser Whisper transcription is slow on phones: a 60-second clip can take a few minutes on a mid-range device. Export is also slower. For mobile, [tscaps.io](https://tscaps.io) runs transcription server-side.

**Why burn the captions into the pixels instead of a subtitle track?**
Two reasons. Subtitle tracks need the player to render them. TikTok, Reels, Shorts, and muted autoplay ignore them. Burned-in captions render everywhere. Second, tscaps captions are animated (word-by-word reveal, per-word emphasis, keyframe transitions). Subtitle formats cannot express that.

**Can I self-host this on my own server?**
Yes. The Docker image `ghcr.io/francozanardi/tscaps-web:latest` is a static build ready to serve. See *Run the web app* above.

**Can I embed the engine in my own product?**
Yes. `@tscaps/engine` on npm is a framework-agnostic TypeScript package. See [packages/engine/README.md](packages/engine/README.md).

**Which browsers work?**
Chrome 94+, Edge 94+, Safari 16.4+, Firefox 130+.

**What is the license?**
The engine is MIT. The editor app is AGPL-3.0. Templates are MIT. See below.

## Project status

Pre-1.0. The public engine API is stabilising but may shift between minor versions until 1.0. The web app is a moving target. Features land regularly. Pin to an exact version (or commit) in production and review the changelog before upgrading.

## Contributing

Issues, PRs, and template contributions are welcome. The repo is a pnpm monorepo. See the per-package READMEs for run, build, and test commands. New templates are especially welcome. See *Contribute a template* above.

## License

- `packages/engine`: [MIT](packages/engine/LICENSE)
- `apps/studio`: [AGPL-3.0](apps/studio/LICENSE)
- `templates/`: [MIT](templates/LICENSE)

## ReelStudio Creative Studio

Open a video and choose **Creative → Open Creative Studio**. This editing pass includes six color looks, brightness/contrast/saturation controls, slow zoom, beat zoom, shake, beat flash, trim, 0.5–2× speed, audio-based silence removal, manual-BPM beat jump cuts, music mixing, and a title overlay. Existing Timeline cuts can be included.

Preview and export share one canvas renderer. Creative exports run in real time at up to 1080p/30 fps; keep the tab visible. The browser selects MP4 where its recorder supports H.264/AAC, otherwise WebM. Download the result or choose **Add captions in a new project** to transcribe the edited timeline. To style a video with captions already burned in, choose that exported video inside Creative Studio. Creative settings and uploaded music are session-only; render and download before closing the studio.

## Roman Hinglish captions

New transcription defaults to **Roman Hinglish — Hindi + English**, using multilingual Whisper **Small** instead of Base. The Start dialog offers **Balanced · Small** and **Accuracy · Medium**, and remembers the selection. Medium needs a larger model download, more memory, and more processing time. Existing legacy Base preferences migrate to Small; explicit model choices made with the new caption-style setting are preserved.

Hinglish mode requests Hindi transcription with Whisper's existing `transcribe` task, then romanizes Hindi-script words into readable Latin captions. English text, word IDs, timestamps, and speaker information are preserved. Common caption spellings and English loanwords are normalized; other Hindi words use Sanscript with conservative Hindi schwa handling. This is a model configuration and spelling-conversion upgrade, not a fine-tuned Hinglish model or a guarantee of speech accuracy. Review names and uncommon words in the Transcript editor.

Choose **Original script / other languages** to use the normal language picker. Imported subtitle files retain their original text. Existing Hindi captions can be converted with **Transcript → Convert Hindi to Roman Hinglish**; Undo restores the original script. Roman captions are stored in the project and included in video and subtitle exports.

For deployments without SMTP, the owner can explicitly enable Supabase email autoconfirm for immediate password signup. This does **not** verify email ownership. Keep runtime `AUTH_EMAIL_ENABLED=false` so the app hides email password recovery. After SMTP is configured, turn verification back on and set `AUTH_EMAIL_ENABLED=true`.
