# Caption reference review — 21 October 2026

## Scope

Compared the supplied WhiteStair screenshot and the signed-in template gallery with ReelStudio's existing 58 premium presets. The gallery had two missing standard names, Handwritten and Shadow 3D. Added both and eight separately named Dynamic presets: Estate, Classic, Creator, Simple, Doctor, Luxe, Script Mix and Scribble.

Refined 17 existing presets: Boxed, Crazy, Crazy 2, Creator 2/3/4, Cursive, Discipline, Gamer, Perfect, Punch, Simple, Smooth, Smooth Fusion, Spark, Spotlight and Story. Mixed-type treatments register their secondary font stacks so Hindi and Gujarati resolve to bundled script-specific faces in preview and export. Red Wipe's secondary-font fallback was also corrected.

These are independently authored approximations of observed visual treatments, not copies of the site's source code, fonts or video assets. Exact font identity, timing and frame-for-frame visual parity have not been established. Dynamic variants change layout with the stable phrase index; they do not reproduce the reference's automatic person cutouts or footage editing.

## Verification

- Production build and TypeScript checks passed.
- Template contract: all 208 registered templates passed.
- Existing studio unit suite: 162 files / 1,235 tests passed before the additional Dynamic loader test. Final targeted template loader suite: 3 tests passed.
- 60 premium MP4 exports passed, each containing English, Hindi and Gujarati speech-timed captions.
- 8 Dynamic MP4 exports passed using the same multilingual fixture.
- Language preview/browser check passed, including Hindi/Gujarati hover motion and mobile layout.
- Export checks decoded every frame, verified 720×1280 video, four-second duration, audio preservation, nonempty caption pixels in all three language intervals, and no caption pixels touching the frame boundary. No Caption intentionally remains empty.
- Inspected English, Hindi and Gujarati contact sheets extracted from actual MP4 outputs; selected style examples are retained under `output/caption-reference-review/`.

The synthetic fixture changes language mid-document, so a caption spanning that boundary can contain two scripts. This deliberately exercises mixed-script font loading.

## Motion craft scope

This work edits transparent subtitle treatments in the existing narration-driven engine. Full-scene background layers, camera movement and added sound effects are not applied: those would alter the user's footage rather than the requested caption presets. Existing narration timing drives entrances, seeking and export deterministically.

## Delivery state

Changes are in the local workspace. No deployment or remote push was performed. Existing saved project overrides remain user-owned; selecting the refreshed preset applies its current defaults.
