# ReelStudio

ReelStudio is a browser-based Reels editing studio, built on the open-source Tscaps editor.

**Edit reels and animated captions in your browser, with optional private Supabase accounts and cloud projects.**

ReelStudio is a subtitle editor for short-form video (TikTok, Reels, Shorts). Drop a video, transcribe it with in-browser Whisper, pick a template, tune the controls, and export the result with captions burned into the pixels. Transcription and rendering run on your device. When Supabase is configured, source videos and project edits upload to your private account; without cloud configuration, projects stay in this browser.

## Supabase accounts and Coolify deployment

### Five-day trial and monthly subscription

The optional billing integration gives each account five free days, then offers **₹399/week or ₹799/month Razorpay subscriptions**. Trial users do not enter payment details. Server-side entitlement checks protect cloud writes; signed checkout verification and verified webhooks unlock paid access. Users can cancel renewal while keeping their already-paid period. Billing defaults off until the database migrations, Edge Functions, Razorpay plans and secrets are configured. Follow [the billing setup guide](supabase/BILLING_SETUP.md) before enabling `BILLING_ENABLED=true`.

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

Cloud source videos use Supabase's resumable (TUS) endpoint with 6 MB chunks. Network transfer starts alongside the browser recovery copy, without waiting for the full file to finish writing to IndexedDB. Completion waits for that initial recovery attempt so cleanup cannot race it. An upload strip shows transferred bytes and percentage above the editor, including during transcription and project saving. Transient connection/server failures retry automatically. **Retry** continues interrupted transfers from the server's last accepted chunk; **Cancel** stops the transfer and **Resume** continues it later. Cancellation does not discard your current captions or mark the project saved. The project is saved only after the source upload and metadata write both succeed.

The browser retains pending source files, upload URLs and project drafts in IndexedDB, scoped to the configured storage endpoint and signed-in owner. Refreshing or reopening the app restores them without selecting the file again. Active/interrupted uploads resume automatically when online; **Cancel** is remembered across reloads and requires an explicit **Resume**. Offline uploads wait for the connection to return. The upload strip also shows recent transfer speed and an approximate remaining time; estimates reset on Resume and disappear during stalls. Recovered drafts open via **Open project**, and their metadata is synced only after the upload succeeds. Completed saves remove their pending source and draft. Signing out aborts and hides in-memory transfers while preserving that account's local recovery records for its next sign-in.

Refresh recovery requires available browser storage. If saving the source fails (for example, quota exhaustion), the upload still runs and the strip explicitly asks you to keep the tab open. Clearing site data removes local recovery records. Completed chunks can expire on the storage server; expired uploads restart automatically. Self-hosted Supabase's gateway must expose `/storage/v1/upload/resumable`, allow the TUS `POST`, `HEAD`, `PATCH` and `OPTIONS` requests with upload/authorization/API-key headers, and expose the `Location`, `Upload-Offset`, `Upload-Length` and `Tus-Resumable` response headers through CORS. Hosted Supabase uses its direct storage hostname; self-hosted installs keep their configured API origin.

Every caption template is CSS. You can pick one from the gallery and tune it with the editor controls (font, size, colour, timing, animation). Or open the CSS tab and write whatever you want. The controls are the surface; CSS is the escape hatch that keeps the door open.

The Typography font picker offers fonts for the caption's writing system. Hindi/Devanagari choices include Poppins, Kalam, Noto Sans Devanagari, Noto Serif Devanagari, Mukta, Hind, Rajdhani and Tiro Devanagari Hindi. English choices also include Open Sans, Lato, Source Sans 3 and Merriweather. Font files ship with the app for preview and video export; use **Upload custom font** for additional licensed fonts.

## Sample outputs

### Change transcription language or replace captions

In an existing project, open **Captions → Transcript → Change language / Retranscribe**. Choose the speech language and original script or Roman Hinglish, then **Replace all captions**. You can also replace the transcript with an SRT or VTT file. This uses the original source and cached transcription model without regenerating the video preview. Processing time still depends on the model and device.

Existing captions remain intact if transcription fails. A successful replacement keeps the caption templates, video cuts and project identity, replaces caption edits and individual styling, and can be restored with **Undo**. Click **Save** to persist the replacement. Language selection controls speech recognition; it does not translate speech into another language.

### Auto Edit

Open **Creative → Auto Edit**, choose **Clean**, **Energetic** or **Professional**, and click **Auto edit reel** for one-step analysis and application, or **Analyze auto edit** to review a draft first. Review the proposed number of pause cuts, time saved, zooms and caption styles, then **Apply auto edit** and preview. Each option can be switched off before analysis. This runs locally using audio energy and the existing transcript; it does not generate a new transcript, select semantic highlights, or add stock music/B-roll.

Clean keeps natural pauses and gentle zooms; Energetic uses shorter pause handles, stronger/frequent zooms and larger captions; Professional keeps longer pauses and restrained styling. Audio analysis streams 50ms windows and protects word timestamps with speech handles. Missing transcripts, silent audio and undecodable audio never cause guessed speech cuts. Existing timed effects/B-roll keep their positions by skipping new pause cuts; custom contrast, saturation, caption sizes, CSS and linked caption styles are preserved.

The **Reel templates** gallery offers **25 recipes** across Creator, Business, Education, Lifestyle and Bold. Search by name, topic or intensity, filter by category, and load six previews at a time. Recipes pair existing built-in caption looks with an Auto Edit intensity and recipe-specific zoom cadence. Hover/focus previews show the real caption renderer; selection prepares the recipe without modifying the project. Analyze/Apply uses the same editable project model. Caption looks replace untouched default sheets only; custom colours, fonts, positioning, animations, CSS, hook/speaker roles and linked designs are preserved. **Use current caption look** clears the recipe choice. These recipes do not rank current trends or promise virality.

All generated edits use the normal project model and export renderer. Edit zooms in **Effects**, pause boundaries or restore individual cuts in **Timing**, voice settings in **Audio**, and caption text/style in **Captions**. Save/reload preserves these edits. Choose another style or reel template and analyze again, including after Save/reload. Generated effects, cuts, polish values and caption changes carry persistent ownership history: only unchanged auto edits are replaced. Manually changed/deleted effects, restored pause cuts, custom settings and caption formatting are protected. Older projects without this history keep their existing effects/cuts and receive a compatibility note. One Undo after applying restores the previous edit, including caption styling.

Before applying, click **Preview before / after** and switch **Before** (the current project) / **After** (the proposed edit) in the main video preview. Both use the normal compositor, caption pipeline and audio mix without modifying saved project state. **Discard draft** or **Close comparison** returns to the current edit; apply before saving/exporting. Editing controls and Save/Export are disabled during comparison to avoid exporting a different version from the one being previewed. Font-load caption reflow does not invalidate a draft; real project/word/style changes require another analysis.

The preview retains its current output time when changing effects, colour, captions or comparison versions. When trimming makes the reel shorter than the playhead, the preview clamps to its new end. Playback pauses while the updated frame prepares.

### Ready-made photo and video reels

Open **Creative → Templates** for **30 ready-made reels** across Travel, Celebration, Business, Lifestyle, Creator and Fashion. Each arrangement includes a predefined instrumental mood, BPM, scene lengths, colour look, camera motion and timed lighting or zoom transitions. These are full media arrangements, separate from the caption recipes under Auto Edit.

Choose a template, select JPG/PNG/WebP photos and/or supported videos, arrange the file order, optionally enter a title, and click **Build reel automatically**. With no selection, it uses the original project video. Media cycles to fill the scene slots; selecting more files extends the arrangement on the same beat pattern so every file is included. A short video repeats within its slot rather than leaving blank frames. Photos use a centred 9:16 crop. **New project** and the editor dropzone also accept a photo to start a project without a source video; the normal no-audio flow opens an empty transcript.

Every template card includes a bundled **8-second sample video** and poster made with the same template arrangement, music generator and canvas effects as the editor. Hover or keyboard-focus a card for a muted preview, or select **Watch sample** for playback with music and native video controls. **Use this template** selects the recipe without editing the current project. Samples show an excerpt around the first scene change; the full reel duration remains displayed separately. Videos load only on demand, and automatic hover previews respect reduced-motion preferences. Photo inputs and credits are kept in `apps/studio/scripts/reel-preview-source`; rebuild samples with `pnpm --filter @tscaps/studio reel-previews:build`.

Music is an original deterministic synthesised instrumental loop generated locally in six moods; no external music service is required. **Listen to preset music** previews the selected mood. Uncheck music to build a silent montage, or upload a replacement under Audio. Template arrangements mute original clip sound; use Audio and Clips to restore it. New media does not receive automatic subtitles; existing captions remain available on the original project video.

Building replaces the creative arrangement in one undoable operation. Preview the result, fine-tune in Clips, Effects, Look and Audio, then **Save changes** and **Render & download**. The generated media uses the existing private/local asset repository, and all edits use the shared preview/export compositor. Build does not render or download the finished video automatically. Cloud media requires a successful upload; keep original photos/videos for future recropping or relinking.

### Motion Effects gallery

Open **Creative → Effects** in the main editor workspace to add Digital Zoom, Checklist, Phone Mockup, Headline Wall, Chart Grow, Pull-back Reveal, Cover Story or Zoom-through Cut. Effects have editable start/end times on the final reel timeline, text, accent colour and relevant intensity/position controls. Chart rows use `Label | 50` (up to six non-negative values). Phone Mockup and Pull-back Reveal frame the current reel, including captions and B-roll. Add source videos using Clips/B-roll.

Split or add a clip before adding Zoom-through Cut; it targets a real composition boundary. If later edits move the boundary outside the effect range, the gallery flags it and the transition stays inactive until its range is adjusted. Effects combine in displayed layer order, support Undo/Redo and persist through project Save/reload. Timing remains at the chosen output seconds after timeline edits. The Creative preview and both export paths share one deterministic canvas compositor; the regular caption workspace still shows the original source. Preview is lower resolution, and encoded exports may have normal compression differences.

### Gujarati transcription

Choose **ગુજરાતી · Gujarati captions** in the transcription or retranscription dialog to select Gujarati (`gu`) and original script, including when server processing is enabled. Local processing selects **Whisper Large v3 Turbo on CPU** with word timestamps (roughly 0.9 GB initial download, cached when storage permits). Groq server processing uses the full **Whisper Large v3** for explicit Gujarati even when its general default is Turbo, reserving usage at the full model's rate under the existing budget cap. Other server providers keep their configured model. Accuracy depends on recording quality, dialect and background music; review names and unclear speech. These configuration checks are not a measured Gujarati accuracy benchmark. Existing projects need **Change language / Retranscribe** to replace old captions; Undo restores the previous transcript.

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

Open a video and choose **Creative** in the main editor. The full-reel preview and both video export entry points now share one frame-based composition renderer: original captions, ordered clips, muted B-roll / picture-in-picture, color looks, motion, title and mixed audio are encoded together. No intermediate captioned video or real-time screen recording is needed.

- **Save and reopen:** Creative settings, clip trims/order, B-roll placement, music references and timing are part of the project and undo/redo history. Use **Save creative changes** or the main **Save**. Closing the studio and rendering also save. Uploaded music and additional clips are stored before their references enter the project; local projects use IndexedDB, and cloud media uses the existing private owner-scoped Supabase bucket. Failed uploads are shown as errors. Missing media can be replaced from its clip, B-roll or music control.
- **Clips:** Add videos, trim each clip, reorder, adjust volume, remove, and split at the playhead (or at the midpoint when the playhead is elsewhere). Original-video fragments retain their editable captions through cuts, reordering and speed changes. Added video clips retain their own audio but do not automatically receive a new transcript. B-roll is muted and placed on the edited output timeline, with source offset, start/end, size and position controls.
- **Audio:** Mix looping music with a start offset; use speech-level ducking, optional 90 Hz rumble filtering and a downward noise gate, and bounded peak normalization. Preview uses the same processed audio as export. Cleanup is conventional signal processing, not AI voice isolation; it cannot remove every kind of overlapping background noise. Speed changes also change pitch.
- **Resolution:** Portrait canvas exports at **1080 × 1920**. Original-ratio output caps the **short** side at 1080, preserving native vertical FHD; small sources are not upscaled unless the portrait canvas is explicitly selected. Mismatched clips are fitted with black letterboxing. Main Export offers smaller resolution presets for the composed canvas.
- **Export:** Frame-by-frame MP4 (H.264/AAC) or WebM (VP9/VP8 + Opus), 30 fps, with progress and Creative Studio cancellation. A browser without the selected encoder gets an actionable format error. A hidden tab no longer cancels an export, though browser suspension can delay it. AAC may add a short trailing padding interval to the container duration.

The caption workspace continues to show the original source; Creative Studio is the full edited-reel preview. Subtitle-file downloads retain the original caption timeline. Browser mixing currently accepts an edited reel up to 10 minutes and individual media up to 30 minutes. Cloud media uses the existing private bucket policy; no schema migration is needed for these additive project fields. A `.tscaps` metadata export does not embed added media; local-only media must be relinked on another device. Clearing browser storage removes local media. Cloud authentication and storage must be available for cloud uploads.

## Roman Hinglish captions

New transcription defaults to **Roman Hinglish — Hindi + English**, using multilingual Whisper **Small** with automatic GPU acceleration and CPU fallback. The Start dialog offers **Fast · Small**, **Best accuracy · Large v3 Turbo**, **Balanced · Small** and **Accuracy · Medium**, and remembers the selection. Medium needs a larger model download, more memory, and more processing time. Existing legacy Base preferences migrate to Small; explicit model choices made with the new caption-style setting are preserved.

Hinglish mode requests Hindi transcription with Whisper's existing `transcribe` task, then romanizes Hindi-script words into readable Latin captions. English text, word IDs, timestamps, and speaker information are preserved. Common caption spellings and English loanwords are normalized; other Hindi words use Sanscript with conservative Hindi schwa handling. This is a model configuration and spelling-conversion upgrade, not a fine-tuned Hinglish model or a guarantee of speech accuracy. Review names and uncommon words in the Transcript editor.

Choose **Original script / other languages** to use the normal language picker. Imported subtitle files retain their original text. Existing Hindi captions can be converted with **Transcript → Convert Hindi to Roman Hinglish**; Undo restores the original script. Roman captions are stored in the project and included in video and subtitle exports.

For deployments without SMTP, the owner can explicitly enable Supabase email autoconfirm for immediate password signup. This does **not** verify email ownership. Keep runtime `AUTH_EMAIL_ENABLED=false` so the app hides email password recovery. After SMTP is configured, turn verification back on and set `AUTH_EMAIL_ENABLED=true`.

### Transcription speed and accuracy

New transcription defaults to multilingual Whisper Small with automatic GPU acceleration and CPU fallback, with Roman Hinglish output. **Fast · Small** applies this configuration to existing preferences without changing the speech language or script. GPU setup failures in Auto mode retry once on CPU; explicit GPU mode remains strict. Existing explicit preferences are preserved. In new-project and retranscription dialogs, **Best accuracy · Large v3 Turbo** applies the model and CPU backend while retaining the selected language and script. Select the actual spoken language for original-script captions; Roman Hinglish requests Hindi. The first CPU download is about 0.9 GB and processing requires more memory/time than Small. Accuracy still depends on audio quality.

When a long window degenerates, recovery tries each affected region once in slices of at most 10 seconds, retaining the language choice. Repeated failures remain flagged as untranscribed. A result containing no words and only failed regions is rejected so it cannot replace an existing transcript. Existing saved captions require retranscription to benefit from these changes.

### Optional server processing and smoother Creative preview

[Coolify processing setup](services/transcription/README.md) adds audio-only transcription with a warm faster-whisper model and an optional separate server export service. Both verify the caller's Supabase identity; server export also checks project ownership. They stay disabled until their public runtime `TRANSCRIPTION_URL` / `RENDER_URL` settings are supplied. No server secret is embedded in the web app. Deployment and real audio/export benchmarks are required before enabling them for users.

Creative preview reuses an available low-resolution proxy while keeping audio from the original source. Device export explicitly discards the proxy and renders from original media. Server exports render the saved cloud project with the same compositor; MP4 conversion adds a second encode. Upload throughput remains bounded by the network and storage service, and processing speed depends on the chosen hardware.
