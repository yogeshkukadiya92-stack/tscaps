# review-checklist — acceptance before delivery

Run **before** showing anyone. The author's eye is tired; the first review is never
handed to the client (motion-laws P1).

Report format: `code ✓` or `code ✗ (frame 615)`. Every ✗ carries a frame number or an
attached screenshot. "Looks fine overall" without frame numbers is not a review, and
neither is a report where every box is ticked for tidiness.

Ideally the acceptance goes to a separate agent with a clean context that took no part in
production, and is given no rationale, no edit history and no expected conclusion. Where
that is not possible, do it yourself — but strictly by the list, with frames in hand.

## Inputs

The finished file; key frames of every shot; the list of what the video must show; the
agreed visual direction and palette; the storyboard (order, durations, captions,
transitions, SFX); the names of the chosen techniques; the data-handling policy.

If something is missing, mark the item **"cannot verify"** rather than assuming.

---

## D — motion and rhythm

- [ ] **D1** No linear easing anywhere; every `interpolate` has both clamps
- [ ] **D2** Every entrance animates 2–3 properties; no lone fades
- [ ] **D3** Everything enters with a 3–6 frame offset; nothing enters simultaneously
- [ ] **D4** Exits are animated and faster than entrances
- [ ] **D5** At least three moments of complete stillness (R5)
- [ ] **D6** The wordmark holds ≥1s; a mass entrance ends with a pause ≥0.5s (R1, R2)
- [ ] **D7** No uniform straight-line motion; mass entrances accelerate (R2)
- [ ] **D8** The opening arc is ≥3s; interaction sections run at human speed (R3)
- [ ] **D9** Full-frame/camera hits ≤3 per video, ≥16 beats apart (R4)
- [ ] **D10** A new visual element at least every 90 frames
- [ ] **D11** Anything on screen >2s breathes; fast motion has motion blur

## V — visual quality

- [ ] **V1** The five-layer stack is present: mesh → assets → graphics → grade → grain+vignette
- [ ] **V2** Every still has Ken Burns; video only through `<OffthreadVideo>`
- [ ] **V3** One accent colour, at most one accented/glowing element per frame (T2)
- [ ] **V4** Display face ≥600 weight on headlines; no system font in heroes (T3)
- [ ] **V5** Gaps between large text blocks in px, not em
- [ ] **V6** Text inside the safe zone, nothing touching the frame edges (T4)
- [ ] **V7** Measure the **real** text height on a frame: captions ≥56px (≥5.2% of frame
      height), auxiliary ≥32px (≥3%). Not `fontSize` in the code (T1)
- [ ] **V8** No text in the middle state of "meant to be read but illegible"
- [ ] **V9** The closing URL/CTA is not the smallest line in the video
- [ ] **V10** Text sharpness on push-ins: crop and magnify a letter edge — no pixel
      blocks; source resolution ≥2× the displayed size (Q2)
- [ ] **V11** No camera shake without a narrative reason (Q3)
- [ ] **V12** Glints are not broadcast; each is clipped by its carrier's rounding (Q4)
- [ ] **V13** Landed elements sit in real layout slots; nothing hovers (Q9)
- [ ] **V14** Transition seams are clean: no flicker, no tear, no background showing through
- [ ] **V15** No emoji used as icons (or every one verified on frames)
- [ ] **V16** Every alphabet the copy uses is actually covered by the display face — no
      silent fallback to a system font in one language

## C — content

- [ ] **C1** Every "must show" item has its own distinguishable shot
- [ ] **C2** Every shot gives new information; no repeated shots or taglines (P4)
- [ ] **C3** No technique leads twice in the same video (P4)
- [ ] **C4** Every line matches its shot; no mute animation longer than 3s (C1)
- [ ] **C5** Taglines are concrete — a feature name or a benefit, not metaphor alone (C2)
- [ ] **C6** The video claims nothing the product does not have
- [ ] **C7** The finale is the highest energy point, with a representative of every feature (Q8)

## S — sound

- [ ] **S1** Listen to the track alone: a product announcement, not a mobile game
- [ ] **S2** Every SFX is pinned to a specific frame and commented with its action
- [ ] **S3** Cues are pinned relative to the shot start; no bare numbers
- [ ] **S4** Every recognisable action (typing, click, landing) has its own sound
- [ ] **S5** Nothing plays after its action ended; long samples are explicitly trimmed
- [ ] **S6** Every cue is audible **in the render**, not only in the preview
- [ ] **S7** Series sound like a countable rhythm, not repetition
- [ ] **S8** UI sounds are real-object foley, not synthetic feedback tones
- [ ] **S9** The post-render peak is not at zero (no clipping): `volumedetect`
- [ ] **S10** A video with BGM ships in **two versions** — with music and without (SFX
      kept), both from the same timeline and frame-identical in picture

## B — beat (music-synced videos only)

- [ ] **B1** The grid passed acceptance before the storyboard: match ≥98%, mean error <10ms
- [ ] **B2** The timeline is written in beats (`beatF(n)`), not frame numbers
- [ ] **B3** Sparse accents are pinned to real attacks, not to grid points
- [ ] **B4** Measured back from the finished file: every cut within 3 frames
- [ ] **B5** No systematic one-directional offset in the error table
- [ ] **B6** The output track offset is measured and lives in its own constant; the source
      `SOURCE_BEAT0` is uncontaminated

## T — technical

- [ ] **T1** The render is deterministic: no `Date.now()`, no `Math.random()`
- [ ] **T2** Composition `durationInFrames` matches the content — no dead air
- [ ] **T3** You inspected the fresh file (`--overwrite` was not forgotten)
- [ ] **T4** Render settings match the purpose (`--crf 16` for a master)
- [ ] **T5** On-screen data matches the agreed policy; no customer, personal, internal
      data or keys in frame
- [ ] **T6** Page screenshots are fully loaded: fonts, images, dynamic content in place

## Report structure

Three sections by severity:

1. **Must fix** — with frame numbers.
2. **Worth improving**.
3. **Cannot verify** — naming the missing input.

Deliberate breaks of `motion-laws.md` are listed separately, with a reason, and mirrored
into the project README (motion-laws P5).
