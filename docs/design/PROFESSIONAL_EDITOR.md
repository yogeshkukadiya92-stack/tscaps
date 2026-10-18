# ReelStudio professional editor design

Figma: https://www.figma.com/design/TsJyjv9qnTdLJEQlK5zmgM
Desktop frame: 1:265 (1440 × 960)
Mobile frame: 4:18 (390 × 1000)

Created 2026-10-18. Implemented in the Creative workspace; deployment follows the main-branch release workflow.
The monitor artwork and timeline contents are illustrative, not user video edits.

Direction: dark charcoal studio, restrained periwinkle actions, compact Inter type,
consistent borders, dedicated monitor, tool library, inspector and track timeline.
Desktop: project bar → tools/library/monitor/inspector → video/captions/audio tracks.
Mobile: project controls → portrait preview → playback → compact timeline → tools
and selected recipe. Keep export visible and primary touch controls at least 42px.

Use existing editing operations, media persistence, audio analysis, preview/apply,
undo and export. No new AI capability is implied by this design. Show actual save
status and only show After when a real draft exists. Replace all illustrative track
labels and durations with project data. Template search and category filters reuse
existing gallery filtering. Keep custom prompt editing as a secondary disclosure.

Figma palette variables cover base, panel, raised, border, text, muted, accent,
green and purple. Button instances reuse Simple Design System; product-specific
panels and tracks are editable auto-layout frames. UI uses the existing Inter font.
Desktop and mobile were inspected visually; text and UI are editable layers, with
no rasterized whole-screen image used as the deliverable.

## Implementation and validation

The Creative workspace uses scoped dark tokens, a tool rail, searchable skill library,
real video monitor, inspector disclosures, and a seekable output-time timeline.
The existing project header, caption workspace and export dialogs are retained.
Library actions reveal the Auto Edit inspector even when another tool is selected.
On mobile the preview and compact timeline precede tools and recipe controls.
The sample artwork is replaced by the real video canvas. Timeline rows use actual
composition spans and transcript intervals; no synthetic waveform is presented.
The Figma Simple Design System Button has no installed source component in this
repository; existing canonical BTN_PRIMARY/BTN_SECONDARY components/styles are reused.

Validated: production build/typecheck; 53 core AutoEdit and preview/export tests;
7 browser tests including paid AI, local recipe apply, search, split, tool switching,
320px/390px layout, and rendering/downloading/decoding a real WebM reel.
