# shot-vocabulary — the vocabulary of techniques

A named set of motions to build a storyboard from. The point of the vocabulary is to
stop the whole video collapsing into three techniques, and to say out loud in advance
what each shot will live on.

**Selection rule (motion-laws P4): one technique is the hero of exactly one shot per
video.** If two shots in the storyboard rest on the same technique, one of them is
reworked or cut.

The technique is chosen **before** the code: every shot in the storyboard carries a
name from this list. "I will make something nice" at implementation time turns into a
linear fade.

---

## opening

`brand-ink-open` · `crane-rise-reveal` · `dataviz-landscape-open` · `fracture` ·
`icon-field-colorize` · `letterspace-materialize` · `magician-card-flourish` ·
`orbit-ring-title-open` · `spotlight-hero-card` · `stroke-segment-build` · `text-as-mask`

An opening obeys Q5: one hero, one complete arc (spotlight → push in → hover → rim
light → settle), at least 3 seconds (R3).

## camera

`basic-3d-scene` · `crash-zoom-punch` · `cursor-flyover` · `depth-layer-moves` ·
`graze-face-tour` · `overhead-camera-moves` · `space-camera-moves` ·
`steep-tilt-glide` · `tension-camera-moves` · `terminal-3d`

The angle is chosen shot by shot and serves legibility (Q6). No handheld shake in a
bright product video (Q3). Full-frame hits ≤3 per video (R4).

## typography

`blur-slide` · `brace-expand` · `cel-flash-stomp` · `countdown-arc-scatter` ·
`document-typewriter-reveal` · `flying-words` · `glitch-cycle` · `gradient-word-sweep` ·
`lead-word-zoom-assemble` · `marker-underline-title` · `outline-word-fill` ·
`paper-title-card` · `pill-slot-cycle` · `scramble` · `split-flap-title` ·
`text-column-converge` · `title-demote-to-label` · `type-assembly-moves` ·
`type-entrance-moves` · `type-rhythm-sync` · `typewriter-moves` · `typing-code-block` ·
`vertical-word-roll-blur-cycle` · `word-relay-filmstrip` · `word-relay-geometry`

Sizes and text states: motion-laws T1/T3. One word per headline gets the highlight.

## ui-entrance

`avatar-bracket-carousel` · `bezier-source-converge-merge` · `card-stack` ·
`carousel-3d` · `cloner-depth-echo` · `deck-deal-flyin` · `doc-park-left-pill-deal` ·
`draw-svg-trace` · `element-body-moves` · `floating-glossy-label-pills` ·
`integration-hub-map` · `list-reveal` · `list-stack-press` · `morph-from-primitive` ·
`neon-frame-forerun` · `neon-frame-orbit-drop` · `page-waterfall-wall` ·
`paper-craft-moves` · `platform-hinge-rise` · `product-card-progressive-assemble` ·
`radial-wave` · `research-card-stack-scroll` · `row-embed` · `runway-ground-skim` ·
`skeleton-reveal` · `svg-shape-morph` · `value-stagger-gradient` · `wall-reveal-moves`

A mass entrance rides on acceleration and a physical metaphor, not on lighting up each
element (R2, Q4). Landing goes into a real slot in the layout (Q9).

## interaction

`ai-stream-response` · `autolayout-gap-dial` · `canvas-materialize-moves` ·
`chip-grid-single-select-blackout` · `chip-lift-to-user-pill` · `collab-cursor-moves` ·
`command-palette-summon` · `glass-pill-dictation-typing` · `hashtag-to-pill-materialize` ·
`input-trigger-moves` · `picker-carousel-feature-cycle` · `segmented-thumb-hero` ·
`theme-switch-moves` · `type-and-filter` · `voice-waveform-live`

At the speed of a live human: the viewer must be able to follow along (R3). Every
recognisable action gets its own sound (sound-design §3).

## data

`avatar-grid-radial-build-colorize` · `before-after-slider-scrub` · `chart-live-moves` ·
`counter-confetti` · `cycle-glass-node-morph` · `gauge-readout-moves` · `hatch-depth` ·
`odometer-digit-roll` · `particle-celebrate-hits` · `particle-sand-fill` ·
`ring-diagram-annotation-reveal` · `scroll-brake-moves` · `timeline-travel`

Counters use `tabular-nums` (remotion-patterns §9). Once a number lands: a pause ≥1s (R1).

## effects

`assemble-then-type-flyin` · `aurora-bloom-bg-flip` · `brand-frame-snap` ·
`dashboard-glow-highlight-pill` · `fui-hud-moves` · `glow-flyline-moves` ·
`icon-performance-moves` · `impact-feedback` · `light-play-moves` · `line-boil` ·
`radial-ripple-phone-chips` · `riso-print-hits` · `scan-bracket-sweep` ·
`scanline-annotate-focus` · `scanline-assemble-flyin` · `slam-entrance-moves` ·
`spotlight-sweep-moves`

Glow only on the accent element, at most one per frame (T2), clipped by its carrier's
rounding (Q4). Never broadcast.

## rhythm

`beat-cut-moves` · `beat-step-list-theme-cycle` · `montage-rhythm-moves` ·
`panel-grid-moves` · `quad-split-parallel-scenes` · `rhythm-interrupt-moves` ·
`sakuga-timing-shift` · `smear-multiples` · `spectrum-morph-ui` · `speed-ramp-freeze` ·
`trailer-grammar-moves`

R4 limits apply: full-frame hits ≤3 per video, ≥16 beats apart, a pump series once.
Anchoring details: `beat-sync.md` §4.

## transition

`bottom-push-stack-wipe` · `bubble-swarm-takeover` · `card-flip-reveal` ·
`card-flock-tumble` · `circle-match-iris` · `color-block-step-wipe` · `cube-navigation` ·
`gradient-transition` · `line-carry-transition` · `mosaic-reframe` ·
`page-turn-transitions` · `paper-plane-messenger` · `print-texture-transitions` ·
`shot-transitions` · `tear-streak-transitions` · `transition-hidden-cut` ·
`transition-travel` · `white-flash-logo-simplify-cut` · `wipe-transitions`

8–14 frames long. Implementations in remotion-patterns §14. One `transition-soft` per
scene change in the sound (sound-design §4.6).

## outro

`edit-hook-moves` · `grain-dissolve` · `logo-shrink-wordmark-lockup` ·
`neon-triple-marquee` · `outro-group-photo-launch` · `ui-strip-away-outro` ·
`ui-to-brand-morph`

The finale is the energy peak (Q8), with a representative of every shown feature. The
wordmark holds a full second (R1). Sound phrase riser → impact → sparkle
(sound-design §4.6). The closing URL is the largest line, not the smallest (T1).

---

## How to use it

1. Write the shot list, each shot carrying a name from the vocabulary.
2. Verify no technique appears twice as the lead.
3. Check the energy curve against R6 (hook → context → body → payoff → CTA); for a
   video cut to music, press it against the track's structure (`beat-sync.md` §2b).
4. Only then write code.

Live video examples of every technique are in the original project's gallery:
https://vincentwei1021.github.io/video-shotcraft/library.html — useful to show a client
and let them pick the techniques themselves.
