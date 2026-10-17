# ffmpeg-editing — editing real footage

For when the video already exists and needs processing rather than building from code.
Pure bash + FFmpeg + Whisper, no GUI and no cloud services.

## Requirements

Homebrew is not needed — the binaries come from npm:

```bash
npm install -g ffmpeg-static ffprobe-static
BIN="$(npm prefix -g)/bin"; ROOT="$(npm root -g)"
ln -sf "$ROOT/ffmpeg-static/ffmpeg" "$BIN/ffmpeg"
ln -sf "$ROOT/ffprobe-static/bin/darwin/arm64/ffprobe" "$BIN/ffprobe"
```

Check before starting: `command -v ffmpeg ffprobe`.

Two caveats about this route. The packaged `ffprobe` is built for x86_64 and runs
through Rosetta on Apple Silicon — it works, but slower; without Rosetta you need
`brew install ffmpeg`. And the symlinks live in a specific Node version's directory:
after switching versions with nvm they must be recreated (or put the binaries in a
permanent directory on `PATH`).

Captions additionally need Whisper (`pipx install openai-whisper` or
`brew install whisper-cpp`) — only for `transcribe.sh`; nothing else uses it.

## Reconnaissance first

Never start editing without knowing the source parameters:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames \
  -show_entries format=duration,size,bit_rate \
  -of default=noprint_wrappers=1 input.mp4
```

Frame rate and duration matter most — every timing depends on them, and they are what
you need if the footage later becomes a layer inside Remotion.

## Scripts

They live in this skill's `scripts/`. All accept `--output`; by default they write next
to the source with a suffix.

| Script | What it does |
|---|---|
| `edit.sh` | Orchestrator: chains operations in the correct order |
| `trim.sh` | Trim by timecodes |
| `jumpcut.sh` | Auto-remove silence through `silencedetect` |
| `transcribe.sh` | Whisper → SRT |
| `caption.sh` | Burn an SRT into the video with a style |
| `overlay-text.sh` | Positioned text overlay over an interval |

`trim.sh` and `jumpcut.sh` additionally accept `--precise` (re-encode instead of stream
copy) — see the keyframe section below.

### Trimming

```bash
scripts/trim.sh video.mp4 --start 00:01:30 --end 00:05:00
```

### Jump cut (silence removal)

```bash
scripts/jumpcut.sh video.mp4 --threshold -30 --duration 0.5 --padding 0.1
```

- `--threshold` — silence threshold in dB. Noisy recordings want `-35` or `-40`.
- `--duration` — the minimum silence length to cut.
- `--padding` — how much to keep around speech. **Never below 0.1s** — word onsets get
  clipped and the speech sounds chopped.

At the end it prints how many seconds and what percentage were removed.

### Keyframes: why `trim.sh` and `jumpcut.sh` have `--precise`

The fast path is `-c copy`: no re-encoding, nearly instant, but cuts are only possible on
keyframes. Two consequences:

- Cut accuracy is limited by the GOP length (usually 1–2 seconds).
- If the requested range contains **no keyframe at all**, ffmpeg silently produces a file
  with **no video track**. Audio only, and no error.

Both scripts verify the result with `ffprobe` and, on losing the video, switch to
re-encoding (`libx264 -crf 18 -preset veryfast`) themselves, saying so in the output.
`--precise` re-encodes from the start — use it when you need frame-accurate cuts.

Verify it yourself anyway:

```bash
ffprobe -v error -show_entries stream=codec_type,nb_frames -of csv=p=0 out.mp4
```

No `video,...` line means the video is gone.

### Captions

```bash
scripts/transcribe.sh video.mp4 --model base --language en
scripts/caption.sh video.mp4 video.srt --style hormozi
```

Whisper models: `base` is fast, `medium`/`large` for long or noisy recordings. For
languages other than English, `base` is noticeably weaker — start at `medium`.

| Style | Look |
|---|---|
| `hormozi` | Large bold centred captions, word by word — for vertical reels |
| `standard` | Classic bottom subtitles on a semi-transparent plate |
| `minimal` | Small lower third, unobtrusive |

If you already have an SRT, pass it to `edit.sh` through `--caption-srt` and transcription
is skipped.

The font-size requirements from motion-laws T1 apply here too: captions for phone viewing
need an effective height ≥5% of the frame height.

### Text overlays

```bash
scripts/overlay-text.sh video.mp4 --text "Subscribe" \
  --start 00:01:00 --end 00:01:05 --position bottom-right
```

Positions: `center`, `top`, `bottom`, `top-left`, `top-right`, `bottom-left`, `bottom-right`.

### The full pipeline

```bash
scripts/edit.sh video.mp4 \
  --trim-start 00:00:10 --trim-end 00:10:00 \
  --jumpcut \
  --caption --caption-style hormozi \
  --speed 1.25 \
  --overlay-text "Like & Subscribe" --overlay-start 00:01:00 \
  --output final.mp4
```

**The order is fixed and it matters:** trim → jump cut → speed → captions → overlay.
Captions come after the speed change or the SRT timings drift. The overlay comes last so
it is not sped up along with the video.

## Direct FFmpeg commands you will keep needing

Speed change with pitch preserved (`atempo` works in 0.5–2.0; chain it beyond that):

```bash
ffmpeg -i in.mp4 -filter:v "setpts=PTS/1.25" -filter:a "atempo=1.25" -c:v libx264 -crf 18 out.mp4
ffmpeg -i in.mp4 -filter:v "setpts=PTS/4"    -filter:a "atempo=2.0,atempo=2.0" out.mp4
```

A frame for inspection (`-ss` before `-i` seeks fast; after `-i` seeks exactly):

```bash
ffmpeg -v error -ss 1.5 -i out.mp4 -frames:v 1 check.png
```

A contact sheet to scan the whole video quickly:

```bash
ffmpeg -i out.mp4 -vf "fps=1,scale=320:-1,tile=6x5" -frames:v 1 contact.png
```

A vertical crop for a reel from landscape (centred):

```bash
ffmpeg -i in.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920" -c:a copy out.mp4
```

Extract the audio track (for beat measurement or analysis):

```bash
ffmpeg -i out.mp4 -vn -acodec pcm_s16le audio.wav
```

Check the peak level:

```bash
ffmpeg -hide_banner -i out.mp4 -af volumedetect -f null /dev/null 2>&1 | grep max_volume
```

Concatenate clips without re-encoding (identical codec/size/fps):

```bash
printf "file '%s'\n" clip1.mp4 clip2.mp4 > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4
```

With differing parameters, `-c copy` produces desync or a broken file; bring them to a
common denominator with `-filter_complex concat` and re-encoding.

A decent GIF (through a palette, otherwise it is mud):

```bash
ffmpeg -i in.mp4 -vf "fps=15,scale=640:-1:flags=lanczos,palettegen" palette.png
ffmpeg -i in.mp4 -i palette.png -lavfi "fps=15,scale=640:-1:flags=lanczos [x]; [x][1:v] paletteuse" out.gif
```

## Acceptance

The rules in `motion-laws.md` apply to edited footage too. At minimum:

- Extract frames at every jump-cut seam and look: clipped words, exposure jumps, cut-off
  gestures.
- Measure the real caption height in pixels on a frame, not in the config.
- Listen to the seams: `-c copy` sometimes leaves a click at a segment boundary.
- Confirm the video track survived: `ffprobe` output contains `video`.
- Check the final duration matches expectations (`ffprobe`).
