# Premium captions

The `premium-captions` family contains 58 independently authored presets, with
stable `premium-*` IDs and a tile preview. It is registered separately from the
existing families and preserves Mira as the default for new sheets.

Reference catalogue: https://whitestair.com/templates (reviewed 2026-10-16).
The catalogue includes No Caption, so this collection has 57 visible styles and
one intentionally hidden overlay preset. These are original interpretations of
the publicly visible styles, not imported vendor templates or pixel-identical
reproductions. No vendor source, fonts, footage or paid assets were copied.

Each preset supplies its own typography, word grouping, colours and narration
motion through the existing template pipeline. Most have Original, Ice and Rose
accent variants. Hindi uses bundled Devanagari glyphs. Gujarati is a managed script in every
font stack, with bundled Noto Sans Gujarati and Noto Serif Gujarati faces.
The Templates panel has English, Hindi and Gujarati sample switches; changing
the sample language does not translate or modify the transcript. Localized
previews apply each preset’s segment and line splitters and narration clock,
with whole words to preserve Indic shaping. Hover plays the motion.

## Practical differences

- Cook uses the engine's video-backed difference blend. It does not reproduce
  the reference's footage-inside-letter mask.
- Ransom presets arrange words on paper tiles, preserving joining scripts;
  they do not split Indic words into independently moving letters.
- Notification has a generic social badge rather than a copied platform logo.
- Estate presets use caption typography and shadows, without a separate 3D
  scene, camera animation or automatic subject segmentation.
- No Caption hides the overlay while retaining transcript data.

## Validation

Run `pnpm templates:build`, `pnpm templates:contract`, and the studio tests.
`PremiumTemplates.test.ts` (under presentation/editor/services) loads all 58 authored configurations with their real
built CSS and registries, checks font-stack IDs and gallery grouping. Release QC exports all 58 presets at 720×1280, 24 fps, with a four-second
English/Hindi/Gujarati caption sequence and AAC audio. Every encoded frame is decoded;
boundary pixels, missing captions, missing audio and decode failures are checked.
Estate 2/3 hero sizing was reduced after this check caught animation overshoot
at the left/right edge. Triple leaves line widths to the measured splitter so
wide Gujarati lines remain centred. All 58 files passed after that fix. Contact sheets were
visually reviewed for all three scripts. This is a synthetic release sample, not a
promise for every custom font/size or reference-style parity.

The opt-in export suite requires FFmpeg/ffprobe on PATH and generates its own
synthetic source. MP4s and preview PNGs go outside the checkout:

```sh
PREMIUM_EXPORT_QC=1 pnpm --filter ./apps/studio exec playwright test premium-export.spec.ts
```

The default output directory is `/tmp/reelstudio-premium-export-qc`; override it
with `PREMIUM_EXPORT_QC_DIR`. Build the studio before running the suite.
