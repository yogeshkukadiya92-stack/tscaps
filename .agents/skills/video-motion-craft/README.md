# video-motion-craft

A [Claude Code](https://claude.com/claude-code) skill for making and editing video with
cinematic motion. Remotion for motion graphics, reels, intros, promos and game trailers;
FFmpeg and Whisper for editing real footage.

## Why it exists

The bottleneck in generated video is **not the code, it is motion design craft**. Left
uncalibrated, a model produces linear easing, opacity-only fades, simultaneous entrances,
flat fills and silence. That is the "cheap AI video" look.

This skill exists to stop that. Its value is not in the code but in the **case law**: the
rules were derived from real redos, not from general principle. The rule "go slower", for
instance, exists because one video collected six rounds of "slower, hold longer" feedback
and zero of the reverse. That is not something you reason your way to — only something
you learn from other people's mistakes.

## Install

```bash
git clone https://github.com/vibegameengine/video-motion-craft.git \
  ~/.claude/skills/video-motion-craft
```

Claude Code picks the skill up automatically. Verify with `/video-motion-craft`.

Dependencies are installed as needed; nothing is required up front:

```bash
# programmatic video
npm install remotion @remotion/cli @remotion/google-fonts react react-dom

# footage editing — no Homebrew, binaries from npm
npm install -g ffmpeg-static ffprobe-static

# captions (optional)
pipx install openai-whisper
```

## What is inside

| File | About |
|---|---|
| `SKILL.md` | Routing, 12 non-negotiable rules, the workflow from framing to acceptance |
| `references/motion-laws.md` | The case law: rhythm, camera, typography, copy, process |
| `references/remotion-patterns.md` | Copy-paste component library |
| `references/game-capture.md` | Capturing material from a game or app |
| `references/beat-sync.md` | Cutting to music: from "here is the track" to ≤3 frame error |
| `references/sound-design.md` | Sound: order of work, SFX vocabulary, offset compensation |
| `references/ffmpeg-editing.md` | Editing real footage |
| `references/shot-vocabulary.md` | 157 named techniques across 10 categories |
| `references/review-checklist.md` | Pre-delivery acceptance, with frame numbers |
| `scripts/` | FFmpeg editing scripts and an SFX kit synthesiser |
| `assets/theme.ts` | Remotion project theme template |

## What it catches

These are not abstract rules. This is what the skill caught on real videos — none of it
visible in the code, all of it visible only on extracted frames:

- **Dark gaps at scene seams.** The old scene fades out before the new one arrives: 0.4s
  of emptiness, three times in a ten-second video.
- **The mess made by the obvious fix.** Overlapping the scenes puts two kickers and a
  counter on top of each other. The technique that works is an opaque scene pushing the
  previous one out.
- **A counter frozen at `0.0`** for half a second before the animation starts: reads as a bug.
- **A headline sitting straight on the brickwork** — "written, but unreadable".
- **The video track vanishing under `-c copy`** — ffmpeg silently hands back audio only.

Hence the rule the whole workflow is built around: **render → extract frames → look at
them → fix → re-render.** An unverified render is not delivered.

## Where this came from

Assembled from four open projects. Thanks to each — links are live:

| Project | What it contributed | Licence |
|---|---|---|
| [Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | The case law: aesthetic rules, beat-sync method, sound, technique vocabulary | Apache-2.0 |
| [haidrrrry/claude-remotion-skill](https://github.com/haidrrrry/claude-remotion-skill) | Remotion pattern library, theme template, SFX synthesis, checklist | MIT |
| [6missedcalls/video-editing-skill](https://github.com/6missedcalls/video-editing-skill) | FFmpeg editing scripts | MIT |
| [digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) | Production pipeline structure | MIT |

**video-shotcraft** is worth visiting on its own: it has a live gallery of techniques with
video examples — [library.html](https://vincentwei1021.github.io/video-shotcraft/library.html) —
and full recipe cards with parameters and demo code that are not reproduced here.

Per-file detail — what was copied verbatim, what was reworked, what was changed:
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Licence

Original work: [MIT](LICENSE). Borrowed material stays under its own licence — MIT and
Apache-2.0 — with texts and attribution in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and
[LICENSE-APACHE-2.0.txt](LICENSE-APACHE-2.0.txt).
