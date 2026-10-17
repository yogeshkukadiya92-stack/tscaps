# remotion-patterns — component library

Working implementations, copied as-is. Everything assumes `theme` from `src/theme.ts`
(template: this skill's `assets/theme.ts`) and the `useCurrentFrame()` /
`useVideoConfig()` hooks from `remotion`.

Contents: 1 premium entrance · 2 stagger · 3 word-by-word text · 4 background mesh ·
5 grade · 6 grain · 7 vignette · 8 Ken Burns · 9 counter · 10 ray mark · 11 exits ·
12 breathing · 13 parallax · 14 transitions · 15 motion blur · 16 SFX ·
17 word-synced captions · 18 deterministic randomness

---

## 1. Premium entrance (fade + rise + scale)

The workhorse. Everything that appears, appears like this.

```tsx
const Entrance: React.FC<{delay?: number; children: React.ReactNode}> =
({ delay = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  return (
    <div style={{
      opacity: p,
      transform: `translateY(${interpolate(p, [0, 1], [40, 0])}px)
                  scale(${interpolate(p, [0, 1], [0.94, 1])})`,
    }}>{children}</div>
  );
};
```

Bezier instead of a spring (controlled slides) — **always both clamps**:

```tsx
const x = interpolate(frame, [0, 25], [60, 0], {
  easing: theme.ease.out,
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
```

## 2. Staggered children

```tsx
{items.map((item, i) => <Entrance key={i} delay={start + i * 4}>{item}</Entrance>)}
```

Offsets: words 3 frames, cards and list items 4–5, large blocks 6.

## 3. Word-by-word text reveal

```tsx
const WordReveal: React.FC<{text: string; delay?: number; per?: number;
  style?: React.CSSProperties}> = ({ text, delay = 0, per = 3, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.26em", ...style }}>
      {text.split(" ").map((word, i) => {
        const p = spring({ frame: frame - delay - i * per, fps,
          config: theme.spring.snappy });
        return (
          <span key={i} style={{
            display: "inline-block", opacity: p,
            transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
          }}>{word}</span>
        );
      })}
    </div>
  );
};
```

**Gotcha.** Two large text blocks side by side in a flex row: set `gap` in pixels
(`gap: 42`), not in `em`. `em` resolves against the parent's font-size (usually 16px),
so next to a 150px face the gap comes out near zero.

## 4. Background mesh (flat fills do not exist)

```tsx
const BgMesh: React.FC = () => {
  const frame = useCurrentFrame();
  const d1 = Math.sin(frame / 55) * 50, d2 = Math.cos(frame / 70) * 40;
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <div style={{ position: "absolute", width: 1200, height: 1200,
        borderRadius: "50%", top: -450, left: -300 + d1, filter: "blur(50px)",
        background: `radial-gradient(circle, ${theme.colors.primary}33, transparent 62%)` }}/>
      <div style={{ position: "absolute", width: 900, height: 900,
        borderRadius: "50%", bottom: -400, right: -250 - d2, filter: "blur(70px)",
        background: `radial-gradient(circle, ${theme.colors.accent}22, transparent 65%)` }}/>
    </AbsoluteFill>
  );
};
```

## 5. Colour grade (above the content, below the grain)

Unifies mismatched assets (AI stills + footage + screenshots) into one look.

```tsx
const Grade: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill style={{ backgroundColor: theme.colors.primary,
      mixBlendMode: "soft-light", opacity: 0.18 }}/>
    <AbsoluteFill style={{ background:
      "linear-gradient(180deg, rgba(0,0,0,0.10), transparent 28%, transparent 72%, rgba(0,0,0,0.2))" }}/>
  </AbsoluteFill>
);
```

Opacity 0.10–0.15 for light themes, 0.18–0.25 for dark. If one clip still stands out,
correct it locally: `filter: "saturate(1.1) contrast(1.08)"`.

## 6. Procedural grain (no asset files)

```tsx
const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const noise = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;
  return <AbsoluteFill style={{ pointerEvents: "none",
    backgroundImage: noise, backgroundSize: "220px",
    backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`, // film flicker
    opacity: 0.05, mixBlendMode: "multiply" }}/>; // "overlay" on dark themes
};
```

## 7. Vignette (topmost layer)

```tsx
const Vignette: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none", background:
    "radial-gradient(ellipse at center, transparent 56%, rgba(0,0,0,0.22) 100%)" }}/>
);
```

## 8. Ken Burns — every still, no exceptions

```tsx
const KenBurns: React.FC<{src: string; zoomTo?: number}> = ({ src, zoomTo = 1.1 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, zoomTo],
    { easing: theme.ease.inOut });
  const pan = interpolate(frame, [0, durationInFrames], [0, -25]);
  return <Img src={staticFile(src)} style={{ width: "100%", height: "100%",
    objectFit: "cover", transform: `scale(${scale}) translateX(${pan}px)` }}/>;
};
```

Alternate zoom-in and zoom-out between consecutive shots. Mask into rounded cards:
`borderRadius: 32, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)",
boxShadow: "0 40px 80px -20px rgba(0,0,0,0.6)"`.

## 9. Animated counter

```tsx
const value = interpolate(
  spring({ frame: frame - delay, fps, config: { damping: 30, stiffness: 60 } }),
  [0, 1], [0, target]);
<span style={{ fontVariantNumeric: "tabular-nums" }}>{value.toFixed(1)}%</span>
```

`tabular-nums` is mandatory — without it the layout jitters as digits change.

Fade the counter in together with the count. A number frozen at `0.0` on screen reads
as a bug, not as the start of an animation.

## 10. Ray mark / logo spark

```tsx
const rays = 12;
{Array.from({ length: rays }).map((_, i) => {
  const p = spring({ frame: frame - delay - i * 1.2, fps,
    config: theme.spring.snappy });
  return <div key={i} style={{ position: "absolute", left: "50%", top: "50%",
    width: size * 0.085, height: size * 0.46 * p, background: theme.colors.primary,
    borderRadius: size, transformOrigin: "50% 0%",
    transform: `translateX(-50%) rotate(${(360 / rays) * i}deg) translateY(${size * 0.07}px)` }}/>;
})}
```

Wrap in a container with a bouncy spring on scale and a smooth one on rotation from
−120°, plus `filter: drop-shadow(0 0 ${size*0.25}px ${theme.colors.glow})`.

## 11. Exits — faster than entrances

```tsx
const exitY = interpolate(frame, [durationInFrames - 12, durationInFrames - 2],
  [0, -42], { easing: theme.ease.in,
  extrapolateLeft: "clamp", extrapolateRight: "clamp" });
const exitO = interpolate(frame, [durationInFrames - 12, durationInFrames - 2],
  [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
```

Apply to every visible element, or to a scene wrapper.

**Inside a `<Sequence>`, `useVideoConfig()` returns the composition's config, not the
sequence length.** Pass the shot length in explicitly.

## 12. Breathing (anything on screen >2s)

```tsx
const breathe = 1 + Math.sin(frame / 22) * 0.015;          // scale
const float   = Math.sin(frame / 30) * 3;                   // translateY, px
const drift   = interpolate(frame, [0, 300], [0, -20]);     // slow parallax
```

## 13. Parallax — depth in three layers

```tsx
const x = interpolate(frame, [0, 90], [0, -120], { easing: theme.ease.inOut });
<Bg  style={{ transform: `translateX(${x * 0.3}px)` }}/>
<Mid style={{ transform: `translateX(${x * 0.6}px)` }}/>
<Fg  style={{ transform: `translateX(${x}px)` }}/>
```

## 14. Transitions

Library (`npm i @remotion/transitions`):

```tsx
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={90}><A/></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={slide({ direction: "from-right" })}
    timing={linearTiming({ durationInFrames: 12 })}/>
  <TransitionSeries.Sequence durationInFrames={150}><B/></TransitionSeries.Sequence>
</TransitionSeries>
```

Hand-rolled, 8–14 frames each:
- **Whip pan**: the background travels 1500px in 6 frames with `filter: blur(8px)`
  during the move; the cut hides mid-whip.
- **Scale-through**: A scales to 1.3 and fades, B grows 0.8→1 underneath.
- **Mask wipe**: a brand-coloured shape sweeps across, the cut hidden behind it.

**Do not cross-fade whole scenes.** Measured on a real edit: fading the outgoing scene
out and the incoming one in leaves a dark gap between them; overlapping them instead
puts two headlines and two captions on top of each other. The technique that works is
an **opaque incoming scene that pushes the previous one out** — no gap, no doubled text,
and the transition becomes a technique rather than a patch.

## 15. Motion blur (anything moving faster than 30px/frame)

```tsx
import { Trail } from "@remotion/motion-blur";
<Trail layers={4} lagInFrames={0.4}><FastThing/></Trail>
```

## 16. Audio and SFX

```tsx
import { Audio, Sequence, staticFile } from "remotion";
<Audio src={staticFile("sfx/music.mp3")} volume={0.25}/>
<Sequence from={SHOTS.hero.from + 24 - 3}> {/* SFX 2–3 frames BEFORE the visual */}
  <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.7}/>
</Sequence>
```

Early reads as synchronised; late reads as broken. Pin cues relative to the shot start,
never as bare numbers. Details: `references/sound-design.md`.

## 17. Word-synced captions over footage

For speech: get word timestamps (Whisper or `@remotion/install-whisper-cpp`), then lay
them out in `<Sequence>`s through `@remotion/captions`:

```tsx
import { createTikTokStyleCaptions } from "@remotion/captions";
const { pages } = createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 1200 });
// each page in a <Sequence from={msToFrame(page.startMs)}>,
// highlight the active token by comparing currentTime to the token timestamps
```

Style: heavy display weight, 2–4 words per page, the active word in
`theme.colors.primary`, positioned at ~65% height (inside the 9:16 safe zone).

## 18. Deterministic randomness

`Math.random()` breaks frame reproducibility — such a render cannot be verified.

```ts
export const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// the seed derives from the element index, never from time:
const rnd = mulberry32(i * 9973);
```

---

## Working with existing footage inside Remotion

To improve a finished mp4 (captions, grade, intro/outro) rather than build from scratch:
put the file in `public/`, render it as the asset layer through
`<OffthreadVideo src={staticFile("clip.mp4")} />`, take the composition duration from the
clip length, and stack graphics + grade + grain on top.

Get the clip's duration and fps **before** configuring the composition:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate,width,height,nb_frames \
  -show_entries format=duration -of default=noprint_wrappers=1 clip.mp4
```

`defaultProps` on a `<Composition>` are serialised to JSON. **A function passed there
does not survive** and fails at render time — pass data and build the value inside the
component.

## Rendering

- Master for upload: `--codec h264 --crf 16` (platforms re-compress; leave headroom).
- Heavy transparency and blur stacks: add `--image-format png`.
- Inspect suspicious motion in Remotion Studio at 0.25× — easing flaws invisible at
  normal speed are obvious there.

Remotion needs a Chromium binary. If the automatic download fails (sandbox, offline CI):

```bash
which chromium chromium-browser google-chrome 2>/dev/null
ls /opt/pw-browsers 2>/dev/null   # Playwright installs here
npx remotion render ... --browser-executable=<path>
```

Full Chrome failing with "Old Headless mode has been removed" means you need
`headless_shell` (Playwright ships one as
`chromium_headless_shell-*/chrome-linux/headless_shell`).
