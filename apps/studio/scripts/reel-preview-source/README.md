# Reel sample media

These photos are inputs for the bundled 8-second reel examples. The sample videos
are rendered from `REEL_TEMPLATES`, `assembleReelTemplate`, `paintFrame`,
`paintMotionEffects`, and `createTemplateMusic`, at the original template tempo.
They show an excerpt starting two seconds before the first scene change, rather
than speeding up the full arrangement. Template names are supplied as editable
titles. Each sample includes the matching preset instrumental and displays the
complete vertical frame. Users replace these photos with their own media.

Photo sources are recorded individually in `photos.json`. Photos were downloaded
from Unsplash's image CDN on 2026-10-19 under the [Unsplash license](https://unsplash.com/license),
which permits downloading, modifying, and distributing images for commercial and
non-commercial use. The original sample photos are kept here for reproducible
builds, rather than requiring runtime third-party image requests. No Unsplash+
assets or third-party music recordings are used. Sample media is illustrative;
people shown are not presented as users or endorsers of ReelStudio.

From `apps/studio`, run `pnpm reel-previews:build` to regenerate all MP4s, posters,
and the manifest in `public/reel-previews`. Requires Playwright Chromium and a
local FFmpeg with H.264 and AAC encoding. Pass template IDs to regenerate a subset:
`pnpm reel-previews:build travel-postcard city-lights`.

The output is 360 × 640, 24 fps H.264/AAC with progressive loading. Gallery cards
load posters first and fetch a muted video on hover/focus; Watch sample opens a
native player with music. The application itself needs no FFmpeg installation.
