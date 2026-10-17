# motion-laws — the laws of motion

A body of case law. Each entry is a **rule** (one executable sentence) + a
**precedent** (where it came from, usually a redo after client feedback) + a
**self-check** (the question to answer while looking at frames).

Numbering: **R** rhythm · **Q** quality/camera/composition · **T** typography and
colour · **C** copy · **P** process. Numbers are never reused; new entries are
appended.

At acceptance, walk the whole body and report lines like `R1 ✓` / `Q4 ✗ (frame 615)`.
A deliberate break is allowed — but it goes into the project README with a reason.

---

## Rhythm (R)

### R1. After key information lands, the frame must breathe; a wordmark holds a full second
**Rule.** An element carrying information (a title card, a number, an assembled
grid) stands still for ≥1s after it lands, and only then does the cut come. Give
the pause to the brand memory point, not to an ordinary card.

**Precedent.** Client: "after the first headline comes in, hold for a second", then
clarified: "not the first title card, I mean the logo animation at the start and the
end". The wrong object was held first, reverted, redone: two wordmarks (open and
close) at a full second each.

**Self-check.** Does every frame the viewer is meant to remember have a moment of
complete stillness? Is the pause given to the brand or to a random element?

### R2. Speed comes from acceleration, not from uniform "fast"
**Rule.** Fly-ins and scrolls get non-linear easing plus a non-uniform spread.
Uniform motion reads as a cheap slide deck. A mass entrance of similar elements
goes faster and faster, ideally tied to a physical metaphor (dealing cards from a
deck). Once the board is full: 0.5s of complete stillness, then the next beat.

**Precedent.** "The cards should pile in faster and faster, and the scroll speeds up
too, then a 0.5 second pause at the end." An abstract "flood" failed to converge
over five iterations; swapping in the card-dealing metaphor passed first try.

**Self-check.** Is any element moving at a constant speed in a straight line? Does
the mass entrance accelerate, and is there a still breath at the end?

### R3. Slower beats faster: the first version is always one notch too fast
**Rule.** The opening hero action (focus → push in → hover → settle, one complete
arc) is at least 3 seconds. Simulated real interaction (typing, filtering, clicking)
runs at the speed of a live human: the viewer should be able to follow along. Budget
frames for holds when laying out the timeline.

**Precedent.** Six independent rounds of feedback on one video, all six saying
"slower / hold longer". Not once the reverse.

**Self-check.** Watch each shot as if for the first time: where did you fail to read
it? In the interaction section, could you follow along and do it yourself?

### R4. Beat sync controls timing, not amplitude: full-frame hits ≤3 per video
**Rule.** "Cuts on the beat" does not mean "punch the picture every beat". Anything
acting on the whole frame or the camera layer (a full-frame scale pump, a shake, a
flash, a negative frame) counts as a big hit: **≤3 per video**, each pinned to the
strongest-hit list (beat-sync §2b), ≥16 beats apart. Other beats move the hero
element layer only. A pump series is at most 4 beats long and happens once per video.
The kick detection table is a candidate pool, not a trigger.

The unit of counting is **one use of a technique**, not the number of internal
flashes: a triple paparazzi flash, a strobe string, a three-blade trailer cut — each
is one slot.

**Precedent.** "If you add music the camera starts jittering to the beat, it is
unpleasant to watch." Cause: the kick→hit mapping was executed on every beat. In a
track with a dense kick there is one on almost every beat, and per-beat hits on the
camera layer produce shaking at the frequency of the beat.

**Self-check.** Take 8 consecutive beats from the high-energy section and step
through: is the whole-frame scale/offset pulsing every beat? Count all full-frame
hits: more than three? Does each one match a strongest hit?

### R5. A pause is a tool, not dead air
**Rule.** Fast move → complete stop → next move. Constant motion reads amateur;
contrast reads expensive. At least three genuine moments of stillness per video.

**Self-check.** Are there at least three moments where nothing at all is moving?

### R6. Structure of a 30-second reel
```
0.0–1.5s  HOOK     boldest visual + claim. Movement within the first 15 frames.
1.5–3.0s  CONTEXT  one line, one visual, still moving.
3–22s     BODY     3–4 beats. Each: HIT → hold 15–20 frames → build.
22–27s    PAYOFF   the result/number/demo. Biggest animation of the video.
27–30s    CTA      one action, calm, glow on the key word.
```
A new visual element at least every 90 frames.
A 5-second logo sting: mark (0–0.8s) → wordmark (0.6–1.8s) → detail/tagline
(2–3.5s) → breathe → exit (last 0.5s).

---

## Quality, camera, composition (Q)

### Q1. An existing page is reproduced with a real screenshot, never hand-drawn
**Rule.** Any shot showing an existing interface starts with a headless browser: a
2x full-page screenshot + element-level cutouts + a JSON coordinate table. Hand-built
UI is allowed only where it reproduces nothing (an abstract opening, a brand block,
a standalone showcase component) — and only if quality and clarity meet Q10;
otherwise, back to screenshots.

Data is handled by risk: public demo data is kept only after explicit confirmation;
customer, personal, internal, key and live data is fictionalised or masked **before**
capture.

**Precedent.** "I want the real page, with animation added on top", "do not use real
data, make up a fake set, no customer names." Half a day of hand-drawn replica went
in the bin.

**Self-check.** For every piece of UI: is it reproducing an existing page? Then it
must be a screenshot. Does the source data match the agreed policy?

### Q2. UI textures in 3D are rasterised at native size and scaled down; blur is resolution, not camera
**Rule.** Rasterise a UI texture inside 3D at 2–4× the displayed size and scale it
down in 3D. Do the enlargement with the CSS **`zoom`** property (layout-level
scaling), not `transform: scale()`. When text is blurry, inspect the resolution
chain, not the camera and depth of field.

**Cause.** Chromium rasterises 3D layers at the 1920 layout width and then stretches
them on the GPU — the content is downsampled first and enlarged after. It has nothing
to do with camera parameters.

**Supporting.** Whole page at 2x (`deviceScaleFactor: 2`), hero elements captured
separately at 4x, a 6-frame cross-fade over the low-resolution layer during the push
in (longer and the two layers visibly disagree). Recompute coordinates as
`Tx = 960/zoom − cx`, or the focus drifts.

**Precedent.** Three rounds: "the card is obviously blurry now", "still not HD, there
are pixel blocks", "the text sharpness in the first shot is still not solved." Depth
of field never helped.

**Self-check.** On a push-in frame, crop and magnify a letter edge: pixel blocks? Is
the source resolution ≥2× the displayed size?

### Q3. The camera stays steady: no handheld shake in a bright product video
**Rule.** Handheld shake is banned in bright UI videos. Camera noise belongs only in
dark, atmospheric shots with a deliberate documentary intent, at a minimal value,
verified on rendered frames.

**Precedent.** "The angle is bad, and there is some small shake, I do not know where
it is from." Complaints stopped after the shake was removed; a dark atmospheric video
kept shake=0.02 without complaint — that is where the boundary sits.

**Self-check.** Frame by frame: is there any camera movement without a narrative reason?

### Q4. Glints and sweeps: none beats many — never broadcast them
**Rule.** Glint/flare sweeps are not applied in bulk — a mass entrance rides on the
motion itself, not on lighting up each element. A surviving glint must be clipped by
its carrier's `border-radius`/`overflow`: light spilling past a rounded corner is a
signature source of cheapness. One glint, on the hero, well made, is fine.

**Precedent.** Two rejections: "I do not need every card to blink", "remove the flare
sweep when the card appears, it is not nice." Later clarified: the rejection was of
that implementation, not of the technique — the no-broadcast and clipping rules stand,
but a quality sheen may be attempted again.

**Self-check.** Count glints/sweeps in the video — more than one, on the hero? Is each
clipped by the rounding? At normal speed, did you watch it yourself and like it?

### Q5. The opening has one hero: a single subject with a complete action arc
**Rule.** An opening is minimum information and maximum focus: one hero element, one
complete arc (spotlight → push in → hover → rim light → settle). A group dance of
several elements cannot carry a first impression.

**Precedent.** "The first shot only needs to focus on one card, and make it richer."
The opening was rebuilt six times in a night; once the single-card structure settled,
it was never touched again.

**Self-check.** How many things in the opening are meant to be looked at? Is the
hero's arc complete (setup — development — landing)?

### Q6. The angle serves legibility
**Rule.** A stylised angle is decided **shot by shot**. Narrative and emotional shots
can tilt; dense informational shots (lists, stacks) stay frontal. A close-up of a card
with text is shot from the side, horizontally — a strong low or high angle destroys
legibility. Applying one style globally is banned.

**Precedent.** A global tilt across all shots was rejected ("this is done badly… it
also ruined the list page, roll it back"), and the list was returned to frontal.
Separately: "focus on the card — shot from the left, not from below."

**Self-check.** For every tilted shot: why the tilt? Is the text legible at that angle?

### Q7. An object close-up needs four things at once
**Rule.** A side-on tilted angle + a perceptible stack height + the camera orbiting
the subject + a contrasting dark textured background (brushed metal). Exit back to
the scene with a synchronised pull-back.

**Precedent.** "The camera should shoot from the side at an angle, the stack should
have height, the camera orbits it. The whole scene is dark metal. Then pull back and
the dashboard appears."

**Self-check.** Does the close-up subject have volume and environmental contrast? Is
the camera locked off, or orbiting/pulling back?

### Q8. The finale is a group photo: everything converges on the wordmark at peak energy
**Rule.** The finale of a multi-feature product assembles as a group shot: one
representative element per shown feature, flying in from different directions and
freezing. The staging level is the energy peak of the whole video (crane, stage light,
particles). The first version of a finale is almost always too modest: budget one
notch higher.

**Precedent.** "The key elements of the pages fly in from different directions and
form something like a group photo", "add more effects, animation, camera movement…
make it like a product launch."

**Self-check.** Is the finale the highest energy point? Does the group photo include a
representative of every shown feature?

### Q9. A fly-in ends in a real slot in the layout
**Rule.** An element that flies in **embeds** into the page — it takes a real position
in the grid and extends the scroll flow. An element left hovering above the page reads
as fake.

**Precedent.** "The question list should fly in from the air and embed into the
dashboard", "do not leave ten cards hovering on top — let the page keep scrolling and
have them settle below, without overlap."

**Self-check.** Does every landed element have real coordinates in the layout? Is
anything hovering above the page permanently?

### Q10. Mock document content is publication-grade
**Rule.** In document and report shots the viewer reads every word. The mock uses the
product's **native layout**, filled with fake text at real density, with the full
layout furniture (sidebar, comment panel) in frame. "Image plus a slogan" means the
shot is redone from scratch.

**Precedent.** "The report text should be in the same layout and style, only the
content mocked, the text filled out, and show the whole left sidebar and the right
comment panel." The first version was rebuilt entirely.

**Self-check.** Pause on any document frame: does the content read as real? Is the
layout (columns, comments, header) complete in frame?

---

## Typography and colour (T)

### T1. Minimum working height for readable text
**Rule.** Legibility is calibrated for phone viewing and small embedded windows. At
1080p: **narrative captions have an effective height ≥56px (≥5.2% of frame height,
recommended step 60px)**; subtitles, statistics and URLs are **≥32px (≥3%)**.

Effective height = fontSize × every ancestor scale × perspective compression (in 3D,
roughly `cos(rotY)`). Measure real pixels on a rendered frame, not `fontSize` in code.

Text exists in **exactly two states**: "texture" (small type inside a screenshot —
it must be visibly blurred or dimmed so nobody tries to read it) or "readable"
(size at spec, sufficient contrast, a scrim or shadow over light backgrounds). The
state "re-laid out but still illegible" does not exist — unreadable text is better
deleted. The closing URL / call to action is the last line that should ever be small.

**Precedent.** "In several shots the captions are very small… you simply cannot see
them." The audit found captions at 38–40px (≈3.5% of frame), a subtitle at 30px, a
closing URL at 25px; the worst case was a subtitle "re-laid out for legibility" at
19px. After moving to the 60/40/34px steps it passed.

**Self-check.** Take a captioned frame and scale it to 480px wide (phone simulation):
is the line readable? Measure the real pixel height. Is any text in the middle state
of "meant to be read but illegible"?

### T2. One base, one accent
**Rule.** One dark (or light) base + **ONE** accent colour + one secondary + neutrals.
Ratio 60/30/10: 60% base, 30% secondary surfaces, 10% accent. The accent appears on
**at most one element per frame** — it directs the eye.

Proven palettes (adapt to the brand):
- Dark tech: base `#0A0A0F`, accent `#7C3AED`, secondary `#22D3EE`, text `#F4F4F5`
- Warm editorial: base `#FAF7F2`, accent `#D97757`, ink `#1F1E1B`
- Warm premium: base `#1A120B`, accent `#E8A33D`, secondary `#F4E9DA`
- Clean light: base `#F7F5F2`, ink `#1A1A1A` + one saturated accent

Glow only on the accent element:
`boxShadow: 0 0 60px ${hero}66, 0 0 120px ${hero}33` (for text, `textShadow`).
More than one glowing element per frame is Vegas.

### T3. Typography
- Headline: a display face (Clash Display, Cabinet Grotesk, General Sans, Satoshi —
  free on Fontshare; or a Google variable font through `@remotion/google-fonts`).
  Weight 600–800, `letterSpacing: -0.03em`, `lineHeight: 1.05`.
- Headline size: reel 80–140px at 1080 wide; landscape 100–160px at 1920.
- Body and captions: a clean grotesque (Inter/system) at 400–500, dimmed.
- Highlight **one** word per headline: accent colour, an animated underline, or a pill
  growing behind it 5 frames after the word lands.
- Numbers: animated counters with `tabular-nums`, or the layout jitters.
- **Check the alphabet the copy needs.** A face that looks right and lacks Cyrillic,
  Greek or diacritics will silently fall back to a system font for exactly the
  languages you did not test.

### T4. The 9:16 safe zone
Critical text lives in the middle ~75% vertically. Platform UI covers the top and
bottom. Nothing touches the frame edges.

### T5. Annotations inside a 3D shot live in the same 3D
**Rule.** A caption attached to a subject in a 3D scene must live in that scene: the
page coordinate system, the same camera perspective, `translateZ` with a cast shadow.
A flat title over 3D detaches from the scene. Style: large serif + a marker highlight
on the key word.

**Precedent.** "Text on the left, larger, with a highlight, and the text angle is 3D
too, floating and shot at an angle" — the first, flat version was rejected.

**Self-check.** For every text block in a 3D shot: does it move with the scene camera,
or is it glued to the screen glass?

---

## Copy (C)

### C1. Copy is rewritten after the picture is locked
**Rule.** Draft copy is a placeholder. Once the picture is approved, rewrite it shot
by shot against what is actually in frame. Pure animation shots get a short
explanatory caption — no "mute" passages longer than 3 seconds (a clean brand finale
excepted).

**Precedent.** "Rewrite the copy for the finished video, right now it does not match
the picture very well; and maybe add some narration in the animated parts too?"

**Self-check.** Does every line match its shot? Is there animation longer than 3s
without explanation?

### C2. A tagline is "team + feature name + concrete benefit"
**Rule.** Be concrete and name the feature instead of leaning on abstract metaphors.
Put a lead-in title card before an important feature appears.

**Precedent.** Word-by-word client edits: "'All your research, one board' becomes
'All team's research, one place to go'", "'The morning reading' becomes 'Paper Radar,
tailored for your morning reading'"; "before the document page there should be another
text frame."

**Self-check.** Does every tagline contain a feature name or a concrete benefit? Are
there lines held up by metaphor alone?

---

## Process (P)

### P1. The first review is never handed to the client
**Rule.** After every iteration, render the key frames yourself and inspect them:
composition, shake, text sharpness, artefacts. When in doubt, use pixel tools (crop
and magnify, diff two frames). Only then show anyone.

**Precedent.** The client's very first viewing: "did you check the quality with
screenshots yourself? The angle is bad, and there is some shake." Crop/diff/measure
scripts and a per-version still archive entered the pipeline that day.

**Self-check.** Which frames did I look at before sending this? Are there screenshots
of the key shots as evidence?

### P2. A reference is broken down into a list of techniques, not applied wholesale
**Rule.** With a reference video, do a motion breakdown first: how every effect and
transition is made, into the spec. Then decide **shot by shot** where it applies. A
reference image describes the feel of one kind of shot, not a style order for the
whole video.

**Precedent.** Success: "pull as many frames as you can from the original, reproduce
and adapt them, do not force what does not fit." Failure: three reference images were
applied as a global tilt on every shot — rejected and rolled back.

**Self-check.** Does every technique from the reference have an explicit take/leave
decision? Did one image turn into a style order for the whole video?

### P3. Ambiguous feedback: confirm the object first; a wrong hit is reverted whole
**Rule.** Phrasing like "the first headline" is clarified before any work starts. Hit
the wrong object and you revert the whole commit rather than patch the wrong version.
Every change is its own commit.

**Precedent.** "Not the first title card, I mean the logo animation at the start and
the end." The mistake was reverted in 8 minutes and redone on the right object.

**Self-check.** Am I sure what this feedback refers to? Can the current commit
granularity roll back in one command?

### P4. List the features first, map them to shots; one technique is hero once
**Rule.** Before shooting, list what must be shown and map it to shots: a missing key
feature means a redo. One technique (fly-in / stacking / page turn) plays the lead
**once per video**. The editing filter is "what new information does this shot give?"
— the same material or claim appears once; a repeat is cut.

**Precedent.** "The animations are samey. The site's capabilities are not fully
shown", "great, but where is the reports section?" — feature shots were added.
"The second-to-last shot repeats the cards, it can go" — the repeat was cut.

**Self-check.** Does every item on the list have its own shot? Are there two shots
where the same technique leads, or that say the same thing?

### P5. A deliberate break is written down
Any conscious departure from this body goes into the project README: which item, why,
and what was gained. An unwritten break turns into a bug report at the next acceptance.
