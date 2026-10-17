# sound-design — sound

Sound is roughly half of perceived quality. A silent video is not delivered unless
silence was asked for.

## 1. Order of work

**Sound is done after the picture is locked.** Any change to a shot's duration or order
means the final action of that edit is rebuilding the entire SFX table. Audio/picture
desync is a mandatory pre-delivery check.

The cost of breaking this (real accounting from one video, the table was re-pinned three
times):

| # | Cause | Nature |
|---|---|---|
| 1 | Wrong timbre direction (game sound pack → cinematic vocabulary) | Sound's own redo, unavoidable |
| 2 | Timeline changed (1020 → 1085 frames), every `from` shifted | **The price of not locking the picture** |
| 3 | Animation added to one section, its SFX rewritten | Same, locally |

A separate anti-pattern: a BGM swap and a picture rebuild in one commit — the picture
changed again afterwards and the sound was pinned for nothing.

## 2. Choosing the music

- Product video: a dense kick, a strong pulse, an electronic bed (tech-house and
  neighbours). A candidate **must be laid under the finished video and listened to** —
  the character of a track cannot be judged apart from the picture.
- Free sources: Mixkit, Pixabay, freesound.org.
- Choose the music **before** laying out when possible: `framesPerBeat = fps * 60 / BPM`,
  cuts on multiples. Full method: `beat-sync.md`.
- If voice-over sits under the BGM, duck the music further.

## 3. The SFX vocabulary

For a product video: **whoosh** (camera movement) · **impact** (landing) · **riser**
(build) · **sparkle** (glow) · **transition** (scene change).

**The ban is on timbre, not on actions.** What is banned is the texture of a game sound
pack — synth plucks and bloops, cartoon bounces, "game over" scales. That does **not**
mean "do not voice clicks". If a click, a switch, or a shatter genuinely happens on
screen, it needs its own foley.

The separating question: **does it sound like the noise a real object makes** (a shutter,
a mechanical switch, glass, paper), **or like a game engine's feedback tone?** Take the
first, discard the second. A real camera-shutter sound can be the loudest SFX in the
whole video — that is fine.

Be especially careful with the "UI" category: it mixes genuine object foley (a light
switch) with synthetic feedback (`confirm-bleep`, `notify-tech`, `success-soft`). The
latter is exactly what is banned, unless the video has a narrative reason for "the system
is speaking". Audition every file; never clear a whole directory.

No assets at all is not a reason to ship silence: `node scripts/gen-sfx.mjs` synthesises
a minimal 16-bit WAV kit (whoosh, pop, tick, bass, pad) into `<cwd>/public/sfx/` (or the
directory given as the first argument), with zero downloads and fully deterministically.

A ready-made kit of 10 files covers almost everything: 2 whooshes, 2 clicks, a riser, a
bass hit, a shimmer, a tick, a pop, a reverse swoosh.

## 4. Pinning cues to frames

### 4.1 A declarative registry

```ts
// one table, next to the shot table — they are edited together
export const SFX = [
  { from: SHOTS.hero.from + 21, src: "sfx/whoosh.wav", volume: 0.5 },  // camera push in
  { from: SHOTS.hero.from + 48, src: "sfx/impact.wav", volume: 0.6 },  // card lands
] as const
// the render layer just walks the array, each entry inside <Sequence from={s.from}>
```

Every line is commented with the on-screen action. "Placing them by feel" does not work.

### 4.2 Pin relative to the shot start — hard rule

Absolute frame numbers are convenient for shifting a whole table in one diff, but they
mean zero reuse: change one shot's duration and every later entry is invalid.

Write `SHOTS.<shot>.from + offset` (for beat-synced videos, `beatF(n)`). Then, as long as
the shot's internal rhythm is unchanged, editing earlier shot durations updates one line
in the shot table and the SFX follow. Bare numbers do not appear in a new project at all.

### 4.3 Long samples are trimmed by `Sequence`, not in an audio editor

`durationInFrames` is given explicitly to anything longer than ~5 seconds — otherwise the
sound keeps playing after the action has ended. Audio length matches action length exactly.

By type:
- **Beds and loops** (ambience, hum, projector) stretch to the shot length.
- **Actions** (typing, page turns, assembly) are cut to the action length.
- **Impacts with a long reverb tail** are allowed to decay naturally; a hard cut sounds dry.

### 4.4 Volume is layering, not a number

- BGM ~0.25–0.34 as a bed; SFX working range 0.2–0.6.
- Volume expresses the importance of the beat: a click confirmation at 0.6 is the loudest,
  the tail of a series at 0.25 the quietest.

**But 0.2–0.6 only holds if the sample peaks near 0dB.** `volume` is a multiplier, not a
target level: a file peaking at −24.6dB stays at −24.6dB with `volume={1}`, while a BGM
peaking near zero at 0.34 sits around −9.4dB — so a quiet sample at maximum is still 15dB
under the drums. "Cap the volume at one" is useless advice.

Measure the peak before use:

```bash
ffmpeg -hide_banner -i sfx.mp3 -af volumedetect -f null /dev/null 2>&1 | grep max_volume
```

Three ways out, in order:

1. **Replace the sample** (best). Raising the gain on a quiet recording raises its noise
   floor with it.
2. **Pre-normalise**, if that exact timbre is required:
   ```bash
   ffmpeg -i in.mp3 -af "loudnorm=I=-16:TP=-1.5" out.mp3
   ```
3. **Give `volume` above 1.** Remotion allows it and genuinely amplifies (measured:
   `volume={4}` → −12.7dB, `{16}` → −0.7dB, i.e. 4× ≈ +12dB). Two conditions: **the
   preview clamps to 1.0** (the finished file will be louder than the studio suggests —
   judge from the render only), and gain lifts noise and can clip. Check the peak after
   rendering; `max_volume` near zero means back off.

### 4.5 Series: not a machine gun

Identical sounds in a row, untreated, read as mechanical repetition. Three devices
together (pitch shifting is **not** used):

1. **Alternate two samples** — two near-identical sounds taking turns.
2. **A descending volume ladder** along the sequence: 0.40 / 0.37 / 0.34 / 0.31 / 0.28 / 0.25.
3. **Interval compression along the animation curve** — the gap shrinks with the picture's
   acceleration (8 → 3 frames). When it gets truly dense, let the sound merge into a single
   swoosh rather than voicing each element: the ear, like the eye, cannot resolve individuals
   in a smear.

The target: a series that sounds like a countable rhythm.

### 4.6 The shot-closing phrase: riser → impact → sparkle

A fixed construction for big shots, especially the finale:

```
riser (assembly/build begins)
  → ≈35 frames → impact (the hero object lands; loudness peak of the whole video)
  → ≈25 frames → sparkle (afterglow)
```

Build, point, aftertaste. Smaller stable phrases: a scene change is one `transition-soft`;
a title card exit is a single `swoosh-quick`; a click confirmation is a camera shutter
(the loudest SFX of the video).

### 4.7 SFX lands 2–3 frames before the visual

Early reads as synchronised. Late reads as broken.

### 4.8 Two offset compensations — hard rule

Between the intention "the sound's peak lands on the target frame" and the finished file
sit two offsets. Uncompensated, they add up: the worst measured case was a hit 0.27s late,
which reads as obvious desync. In a beat-synced video, 2–3 frames is enough to make a
deliberate hit look like pointless jitter.

The formula (compute in float, round at the last step):

```
Sequence.from = target peak frame − sample peak lag − output track offset
```

- **Output track offset** — the constant delay of the whole audio track in the finished
  file. The cause is in the encode/packaging chain (AAC encoder priming: 2048 samples at
  48kHz ≈ 1.28 frames at 30fps), not in `<Audio>`/`Sequence.from` behaviour. Measure it
  **for your specific pipeline** (Remotion version + codec + sample rate + container):
  extract the track from a render, take 2–3 sharp SFX, run a normalised cross-correlation
  against the sources; a consistent residual means the measurement is sound. The constant
  does not transfer between pipelines: one measured ≈1.27–1.29 frames, another 4 frames.
- **The sample's own peak lag** (the peak is not at the start of the file) is measured
  per file.

The compensation is subtracted **in one place in the render formula**, never spread across
individual frame numbers. Record the measurement: pipeline version, what you measured with,
which signal, the date.

## 5. Sound acceptance before delivery

- Close your eyes and listen to the track alone: does it sound like a product announcement
  or like a mobile game?
- Is every SFX pinned to a specific frame and commented with its action?
- Do series sound like a countable rhythm rather than repetition?
- Is every cue audible **in the render** (the preview clamps volume)?
- Does anything keep playing after its action ended?
- Does every recognisable action (typing, click, landing) have its own sound?
- A video with BGM ships in **two versions** — with music and without (SFX kept), both
  from the same timeline and frame-identical in picture. The user may want their own track.
