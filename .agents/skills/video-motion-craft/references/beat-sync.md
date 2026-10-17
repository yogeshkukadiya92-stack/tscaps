# beat-sync — cutting to the beat

When a video has a track with a strong pulse, **every cut and every key accent must
land on a beat**. This is the reproducible path from "here is the track" to "cut error
≤3 frames". Measured: a 70-second, 18-shot promo at 131.97 BPM built this way came out
with every cut within 2.2 frames after render (perceptual threshold ≈3).

## 0. When this applies

At stage zero, check whether the music is already chosen.

- **Chosen** → this document: analyse the rhythm first, then storyboard, with every cut
  anchored to a beat number.
- **Not chosen** → BGM selection moves to the sound stage, the timeline is built from
  the content's own rhythm, and beat sync is not forced.

**Iron rule: music first.** No storyboard exists until the grid passes acceptance. If
the running time does not fit, the timings change — not the client's copy.

Every moment in the analysis is stored as **floating-point seconds**. Conversion to
frames happens exactly once, at the entrance to Remotion. Rounding earlier accumulates
error through the whole pipeline.

## 1. Determining the grid (do not trust the scalar tempo from beat_track)

```bash
uv run --with librosa --with scipy --python 3.11 analyze.py
```

```python
import numpy as np, librosa

y, sr = librosa.load("bgm.mp3", sr=None, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, tightness=400, units="time")

# The key step: least-squares fit of an evenly spaced grid to the beat sequence.
# beat_track's scalar tempo can be off by 2%+ (measured: 129.2 against a true 131.97),
# but the sequence of moments it returns is good — fit t_i = t0 + i*T to all of it:
i = np.arange(len(beats))
A = np.vstack([i, np.ones_like(i)]).T
(T, t0), *_ = np.linalg.lstsq(A, beats, rcond=None)
bpm = 60.0 / T
residual = beats - (t0 + i * T)
print(f"BPM={bpm:.2f}  t0={t0:.4f}s  T={T:.5f}s  residual ±{np.abs(residual).max()*1000:.0f}ms")
```

**Acceptance.** A residual ≤ ±15ms (half a frame) means a machine-programmed beat and a
trustworthy grid. Larger means a tempo change somewhere, and a piecewise fit is needed.

**Always check for the half/double error.** Detectors routinely jump between 2× and
0.5× (70 BPM reported as 140). The judge is not your ear, it is the data in §2: on the
correct grid, kicks mostly land on integer beats. If half the kicks are on integers and
half on halves, the grid is twice too fast. Run 0.5×/1×/2× candidates through the
metrics in §3 and take the best coverage.

**Complex arrangements: separate the drums first.** Dense vocals and bass bury the
attacks and the detector drifts. Light option: `librosa.effects.hpss` and work on the
percussive component. Heavy option: Demucs.

```bash
uvx --from demucs demucs --two-stems=drums -n htdemucs bgm.mp3 -o analysis/
```

After that, all of §1–§2 runs on `drums.wav`, not on the full mix.

## 2. Classifying hits and the energy structure

### 2a. Three bands

Different drums drive different kinds of motion — measure each band separately:

| Class | Band | What it drives |
|---|---|---|
| kick | 40–160 Hz | Impact / slam / snap — the beat where the picture "gets hit" |
| snare | 150–500 Hz (body) + 1–3 kHz (crack) — both needed | Replacement / flash cut / composition change — the "switch subject" beat |
| hihat | 6–14 kHz | Micro-motion density: dense hats allow dense detail, sparse hats demand restraint |

```python
from scipy.signal import butter, sosfilt
def band_env(y, sr, lo, hi):
    sos = butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    env = librosa.onset.onset_strength(y=sosfilt(sos, y), sr=sr)
    return env, librosa.times_like(env, sr=sr)

kick_env, times = band_env(y, sr, 40, 160)
for n in range(int((times[-1]-t0)/T)):
    t = t0 + n*T
    e = kick_env[np.argmin(np.abs(times - t))]
    # collect (beat n, energy e); the top by energy are the big-hit candidates
```

Hits are archived as a list of `{t: seconds, s: strength, k: class}`.

**The hit table is a candidate pool, not a trigger.** Every detected kick is not a
picture hit. In tech-house there is a kick on nearly every beat, and executing it
per-beat produces exactly the "camera jitters to the beat" complaint (motion-laws R4).
The kick→hit mapping exists only to pick the 2–3 strongest hits from the pool; the rest
serve as **timing** references for cuts and element-level motion, never as amplitude.

### 2b. The energy curve and the structure table

`librosa.feature.rms` gives the energy curve; combined with hit density it segments the
track. Two things go into the spec:

- **A structure table**: which beat the energy plateaus at, where the breakdown and
  silence are. The storyboard's energy curve presses against it (a breakdown is the
  natural place for a brand breath; the dense section can carry several parallel motion
  layers, the sparse one only one or two).
- **A strongest-hit list**: the 2–3 biggest slams of the video (statement, climax,
  finale) are pinned to exactly those beats.

**A typical mistake (actually made).** The main hit was pinned to beat 52.5 (between
beats) while the strongest kick was on integer beat 52 — a +5.75 frame miss after
render. In dense-kick tracks the accents are almost always on integer beats; a half-beat
anchor must be supported by envelope data, not by ear.

## 3. Grid acceptance — before the storyboard

Align every candidate (including 0.5×/2×) to the nearest real attacks and compute:

| Metric | Meaning | Threshold |
|---|---|---|
| match | Share of grid beats hitting a real attack | ≥98% |
| mean_abs_ms | Mean absolute alignment error | <10ms |
| drift | Slope of the residual regression over time | accumulated <5ms |
| First-beat validity | Grid beat zero sits on a real attack | required |

The winner is chosen by the metrics. Doubts can be resolved by ear — synthesise a click
track and lay it over the original — but the table decides, not the feeling.

Analysis artefacts are kept with the project: this is the audit trail for every cut.

```text
analysis/
  beat_data.json    # bpm, t0, T, beats[], hits[{t,s,k}], rms[], sections[]
  grid_drift.json   # metrics for all candidates and the reason for the choice
  click_*.wav       # candidate click tracks (optional)
```

Times in `beat_data.json` are always float seconds, never pre-rounded.

## 4. The timeline is written in beats, not frames

```ts
export const FPS = 30
export const SOURCE_BEAT0 = 0.2244   // t0 from the source analysis, seconds
export const BEAT_INT = 0.45465      // T, seconds
export const OUTPUT_AUDIO_OFFSET_SEC = 0 // output track offset, measured per §5b

export const beatT = (n: number) => SOURCE_BEAT0 + OUTPUT_AUDIO_OFFSET_SEC + n * BEAT_INT
export const beatF = (n: number) => Math.round(beatT(n) * FPS)

export const SHOTS = {
  s0_open: { from: 0,        to: beatF(8) },
  s1_slam: { from: beatF(8), to: beatF(16) },
}
export const localBeat = (shot: {from: number}, n: number) => beatF(n) - shot.from
```

Change the track or the section and two constants rebuild the whole video. The SFX table
is written in the same `beatF(n)` and shares one source of truth with the picture.

**Separate books.** `SOURCE_BEAT0` is the audit truth of the source music and never gets
render offset mixed into it; the offset lives only in `OUTPUT_AUDIO_OFFSET_SEC`. Mixing
them produces double compensation the next time the codec changes.

**Anchoring rules:**

- Dense regular cuts (every beat / every two) → `beatF(n)` from the grid.
- Sparse accents and isolated freeze frames → **anchor to the real attack**, not to an
  interpolated grid point: the grid's micro-drift over a sparse stretch magnifies a
  single accent into a visible miss.
- The final freeze → the last real attack + an RMS silence confirmation (so it does not
  land on a reverb tail).
- Video inserts and SFX align **by their internal peak**, not by the file start:
  `material start = beat moment − (peak moment − trim offset)`.

**Layout rules:**

- Shot lengths are measured in beats (4 or 8 per shot); an accelerating section can use
  a converging ladder in halves and quarters (`CUT_BEATS = [48, 49.5, 50.5, 51, 51.25]`).
- Step shots ("one action per beat" — walking a list, filling a mosaic) map beat numbers
  directly.
- If the BGM's kick is already dense, keep SFX restrained: voice only what the music does
  not have; 2–3 big hits, the rest left to the track's drums.
- **Hard limit on full-frame hits** (whole-frame scale pump, shake, flash, negative
  frame): ≤3 per video, each matching the strongest-hit list from §2b, ≥16 beats apart.
  A pump series is at most 4 beats and happens once, followed by a full hold. The unit
  of counting is one use of a technique.
- **Beat-synced motion lives on the element layer by default** (card, headline, number);
  the whole frame and the camera do not take part in sub-beat movement. "One action per
  beat" means a content step, not an amplitude pulse.
- Structural motion (deformation, camera moves, poses) uses continuous frame functions;
  impact events (appear, replace, flash, snap) switch on a chosen frame. Several layers
  landing on one frame is the accent; offsetting them is allowed by 1–2 frames and only
  as intent, never as a consequence of rounding.

## 5. Measuring back after render — mandatory

### 5a. Two errors, reported separately

- **Audio truth error**: distance between the designed cut moment and the real attack.
  Validates the analysis pipeline. Thresholds: mean <5ms, all within ±33ms, 90% within ±15ms.
- **Quantisation error**: rounding seconds to the nearest frame. Validates whether the
  frame rate is enough. The limit is set by fps: 30fps → ±16.7ms, 60fps → ±8.3ms,
  120fps → ±4.2ms.

**Do not claim <5ms visual precision at 30fps.** If the quantisation table exceeds
tolerance, raise the frame rate — do not "fix" the audio analysis.

### 5b. Measuring from the finished file

```bash
ffmpeg -i out/promo.mp4 -vn -acodec pcm_s16le /tmp/render-audio.wav
```

Run the §1 grid fit on that track — measure from the video, not from the source, so the
encode and alignment are verified too — and compare the designed cut frames against the
nearest measured beats.

| Verdict | Error |
|---|---|
| Acceptable | ≤3 frames (perceptual threshold) |
| Ideal | ≤1.5 frames |
| Must fix | any cut >3 frames |

**A systematic one-directional offset is never fixed point by point.** If the whole
table has moved by the same number of frames, the cause is almost always the output
audio track offset (AAC encoder priming and the rest of the encode/container chain;
≈1.28 frames is typical at 48kHz), not an analysis error. Diagnosis: normalised
cross-correlation between the source BGM and the render's track. Fix: one constant,
`OUTPUT_AUDIO_OFFSET_SEC` — **never written back into `SOURCE_BEAT0`**.

The danger of this desync is not just "inaccurate": a 2–3 frame miss on an impact frame
means the viewer does not hear the connection to the drum, and a deliberate beat-synced
move reads as pointless jitter.

## 6. Tooling notes

- librosa not in the system python: `uv run --with librosa --with scipy --python 3.11 script.py`
- BPM will not settle — second and third opinions: madmom (RNN+DBN) and Essentia
  (`RhythmExtractor2013`). If all three disagree, go back to §3 and vote on attack
  coverage; do not guess.
- Variable-tempo tracks (DJ transitions, accelerando): a local tempogram estimate
  (~5s window) finds the change point, then fit piecewise with its own t0/T per segment.
