# Third-party notices

Original parts of this repository are under [MIT](LICENSE). The borrowings listed below
remain under their own licences; the Apache 2.0 text is in
[LICENSE-APACHE-2.0.txt](LICENSE-APACHE-2.0.txt).

This skill is assembled from four open projects. Below: what came from where, under which
licence, and what was changed. Ordered by volume borrowed.

---

## video-shotcraft

**Source:** https://github.com/Vincentwei1021/video-shotcraft
**Author:** Vincent Wei ([@VincentWei93](https://x.com/VincentWei93))
**Licence:** Apache License 2.0 — full text in [LICENSE-APACHE-2.0.txt](LICENSE-APACHE-2.0.txt)

**What was taken.** The case law — the most valuable part of that project. Its aesthetic
rules are derived from real video redos rather than from general principle.

- `references/motion-laws.md` — the body of rules on rhythm, camera, composition, copy and
  process.
- `references/beat-sync.md` — the method for anchoring an edit to beats: least-squares grid
  fitting, three-band hit classification, grid acceptance, measuring back from the render.
- `references/sound-design.md` — order of work with sound, the SFX vocabulary, the defence
  against machine-gun series, the riser → impact → sparkle phrase, the two offset
  compensations.
- `references/shot-vocabulary.md` — the taxonomy of 157 techniques across 10 categories.
- `references/review-checklist.md` — part of the acceptance items.

**What was changed** (Apache 2.0 §4 requires this to be stated):

- Everything was translated from Chinese and restructured (this repository is in English;
  an intermediate Russian version existed during development).
- References to the source project's own tooling were removed (the card gallery, the Ink
  Press template, the CapCut export, the workbench).
- Rules were reformatted into a single "rule + precedent + self-check" shape.
- Thresholds and numeric values were kept as they are: they were measured, not chosen.
- The technique vocabulary was reduced to names and categories; the original cards with
  parameters and demo code remain in the source project — go there for them.

Live gallery of techniques with video examples:
https://vincentwei1021.github.io/video-shotcraft/library.html

---

## claude-remotion-skill

**Source:** https://github.com/haidrrrry/claude-remotion-skill
**Licence:** MIT — `Copyright (c) 2025 haidrrrry`

**Taken verbatim:**

- `assets/theme.ts` — the project theme template (palette, curves, spring presets).
- `scripts/gen-sfx.mjs` — synthesis of a minimal SFX kit as WAVs with zero downloads.

**Taken and reworked:**

- `references/remotion-patterns.md` — the component library: premium entrance, stagger,
  WordReveal, background mesh, grade, grain, vignette, Ken Burns, counter, rays, exits,
  breathing, parallax, transitions, motion blur, SFX sync, word-synced captions.
- Non-negotiable rules 1–10 in `SKILL.md` and the pre-delivery checklist.

**Changes:** translated; `gen-sfx.mjs` gained an output directory as its first argument
(the original wrote to a fixed path relative to itself); the patterns gained deterministic
randomness, a section on working with existing footage inside Remotion, and the finding
that cross-fading whole scenes produces gaps and doubled text.

---

## video-editing-skill

**Source:** https://github.com/6missedcalls/video-editing-skill
**Licence:** MIT — `Copyright (c) 2025 Ian Perez`

**Taken verbatim:** all the editing bash scripts — `scripts/edit.sh`, `trim.sh`,
`jumpcut.sh`, `caption.sh`, `overlay-text.sh`, `transcribe.sh`.

**Changes.** `trim.sh` and `jumpcut.sh` were fixed for a defect reproducible on any
ffmpeg: with `-c copy` the cut happens on keyframes, and if the requested range contains
no keyframe, ffmpeg silently returns a file **with no video track** — audio only, no
error. Added: result verification through `ffprobe`, an automatic fallback to re-encoding,
and a `--precise` flag.

`onboard.sh`, an installer specific to OpenClaw, was excluded.

---

## claude-code-video-toolkit

**Source:** https://github.com/digitalsamba/claude-code-video-toolkit
**Licence:** MIT — `Copyright (c) 2024 Digital Samba`

**What was taken:** the production pipeline structure — the split into stages (framing →
storyboard → build → sound → render → acceptance) and the idea of routing between
programmatic video and real-footage editing.

No code or assets were borrowed from this project.

---

## Original parts

Written for this skill and distributed under MIT:

- `references/game-capture.md` — capturing material from a game or app: the clean plate
  without interface, localisation as layers, headed mode, choosing the viewport by layout,
  verifying the scene actually started, contact sheets.
- `references/ffmpeg-editing.md` — the footage editing reference, installing ffmpeg
  through npm, the keyframe section.
- Rules 11 and 12 in `SKILL.md`, the routing table, the failure-mode sections.
