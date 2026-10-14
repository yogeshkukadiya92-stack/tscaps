# Scene caption library

99 independently authored caption treatments, reviewed against the 99 public style pages in [Moonshot’s library](https://makemoonshot.co/caption-templates) on 2026-10-14. Together with the existing 41 templates the editor now loads 140. These are ReelStudio interpretations, not imported Moonshot templates or an affiliated integration. Names allow matching the public reference; implementations use our bundled fonts, Sass primitives and narration clock. No Moonshot code, fonts or footage is bundled.

The public site advertises 252 templates, but exposes details for 99. The other 153 were not accessible in the public library and are not claimed here.

## Supported scope

- Editable primary/accent colours, typography, placement, grouping, palette variants and narration-bound motion in preview and burned-in video export.
- Multiline templates isolate a hero word on the second line. A short phrase without a qualifying word falls back to normal readable text.
- Behind-person templates use the editor’s existing subject segmentation and valid-scene windows. The gallery offers these styles only with a prepared proxy preview, as required by the existing renderer. If scanning is canceled or a scene does not qualify, the caption stays in front. The whole caption is occluded together: separate foreground subtitles plus rear hero words are not implemented by this renderer.
- Perspective templates use fixed CSS perspective and shadow. They do not track the camera, reconstruct 3D space, curve text around a face or warp the footage.
- Studio treatments reproduce caption typography and decoration only. They do not add scene cuts, B-roll, video collage layouts, count-up statistics, head stickers or semantic cards automatically.
- Glass uses an export-safe translucent plate and rim, not true background refraction or blur. Chrome is a static metallic gradient. Inception uses outlined impact type, not inverted footage. Searchlight sweeps an accent through active words. Karaoke progressively wipes colour through the narrated word.
- Reference fonts without a bundled equivalent use existing open font stacks; Desi styles use Poppins with the catalog’s script fallbacks. Animated previews come from our own styles rather than third-party demo clips.
- Styled captions export as burned-in video. Plain SRT/VTT cannot carry fonts, colours, motion or occlusion.

## Maintenance

Each `scene-*` folder is a normal built-in template, editable without a generator. Shared treatment geometry lives in `templates/_lib/caption-treatment.scss`. All new gallery families use live caption tiles, so they never request missing sample videos. Run `pnpm templates:build`, `pnpm templates:contract` and `pnpm build` after editing.

## Reviewed references and implementation

| Style | Template ID | Gallery family | Treatment / motion | Scope | Source |
|---|---|---|---|---|---|
| Eclipse | `scene-eclipse` | behind-person | hero, pop | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-split) |
| Blackboard | `scene-blackboard` | studio-treatments | box, pop | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/chalk) |
| Marginalia | `scene-marginalia` | studio-treatments | circle, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/sketch) |
| Kraft | `scene-kraft` | studio-treatments | paper, rise | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/paper) |
| Matinee | `scene-matinee` | studio-treatments | hero, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/elevate) |
| Refract | `scene-refract` | studio-treatments | chrome, rise | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/prism) |
| Petal | `scene-petal` | studio-treatments | hero, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/bloom) |
| Boldface | `scene-boldface` | studio-treatments | box, pop | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/stack) |
| Gallery | `scene-gallery` | studio-treatments | paper, type | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/align) |
| Dossier | `scene-dossier` | studio-treatments | fill, rise | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/archive) |
| Schematic | `scene-schematic` | studio-treatments | grid, rise | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/blueprint) |
| Daydream | `scene-daydream` | studio-treatments | circle, wobble | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/zine) |
| Notes | `scene-notes` | studio-treatments | box, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/notes) |
| Darkroom | `scene-darkroom` | studio-treatments | frame, type | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/darkroom) |
| Riso | `scene-riso` | studio-treatments | duotone, pop | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/riso) |
| B-Side | `scene-b-side` | studio-treatments | paper, slide | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/vinyl) |
| Overclock | `scene-overclock` | studio-treatments | outline, slide | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/overclock) |
| Feed | `scene-feed` | studio-treatments | glass, slide | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/feed) |
| Arcade | `scene-arcade` | studio-treatments | neon, pop | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/arcade) |
| Afterglow | `scene-afterglow` | studio-treatments | neon, rise | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/afterglow) |
| Masthead | `scene-masthead` | studio-treatments | underline, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/masthead) |
| Editorial Grain | `scene-editorial-grain` | studio-treatments | paper, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/editorial-grain) |
| Pop Bold | `scene-pop-bold` | studio-treatments | pill, pop | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/pop-bold) |
| Cool Girl | `scene-cool-girl` | studio-treatments | hero, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/cool-girl) |
| Bobblehead | `scene-bobblehead` | studio-treatments | outline, wobble | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/bobblehead) |
| Slab | `scene-slab` | studio-treatments | tape, pop | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/slab) |
| Moments Glass | `scene-moments-glass` | studio-treatments | glass, rise | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/moments-glass) |
| Moments Grain | `scene-moments-grain` | studio-treatments | paper, slide | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/moments-grain) |
| Moments Pop | `scene-moments-pop` | studio-treatments | pill, pop | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/moments-pop) |
| Studio | `scene-studio` | studio-treatments | hero, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/studio) |
| Podcast Cutout | `scene-podcast-cutout` | studio-treatments | outline, pop | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/podcast-cutout) |
| Explainer | `scene-explainer` | studio-treatments | frame, type | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/explainer) |
| Grid Notes | `scene-grid-notes` | studio-treatments | grid, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/grid-notes) |
| Moodboard | `scene-moodboard` | studio-treatments | tape, wobble | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/moodboard) |
| Keepsake | `scene-keepsake` | studio-treatments | frame, fade | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/keepsake) |
| Cutout Board | `scene-cutout-board` | studio-treatments | grid, rise | Caption treatment; no automatic scene edits | [Reference](https://makemoonshot.co/caption-templates/cutout-board) |
| Agent Story | `scene-agent-story` | real-estate | hero, rise | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/agent-story) |
| Number Story | `scene-number-story` | real-estate | hero, pop | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/reach-counter) |
| Gradient Estate | `scene-gradient-estate` | real-estate | duotone, slide | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/magenta-estate) |
| Dimension Story | `scene-dimension-story` | real-estate | perspective, pop | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/dimension-story) |
| Spatial Red | `scene-spatial-red` | perspective | perspective, rise | CSS perspective / tilt; no camera tracking or lens warp | [Reference](https://makemoonshot.co/caption-templates/spatial-red) |
| Spatial Yellow | `scene-spatial-yellow` | perspective | perspective, slide | CSS perspective / tilt; no camera tracking or lens warp | [Reference](https://makemoonshot.co/caption-templates/spatial-yellow) |
| Spatial White | `scene-spatial-white` | perspective | perspective, fade | CSS perspective / tilt; no camera tracking or lens warp | [Reference](https://makemoonshot.co/caption-templates/spatial-white) |
| Gatekeep | `scene-gatekeep` | behind-person | hero, fade | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-red) |
| Retro Cut | `scene-retro-cut` | behind-person | hero, type | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-yellow) |
| Sticker | `scene-sticker` | behind-person | outline, pop | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-editorial) |
| Calligraph | `scene-calligraph` | behind-person | hero, fade | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-blue) |
| Soundwave | `scene-soundwave` | behind-person | hero, pop | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-mix) |
| Signal | `scene-signal` | behind-person | hero, rise | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-neon) |
| Kumar | `scene-kumar` | behind-person | hero, fade | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/kumar) |
| Deep Focus | `scene-deep-focus` | behind-person | perspective, zoom | CSS perspective / tilt; no camera tracking or lens warp | [Reference](https://makemoonshot.co/caption-templates/depth) |
| Sprayline | `scene-sprayline` | behind-person | hero, wobble | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-sprayline) |
| Golden Hour | `scene-golden-hour` | behind-person | hero, fade | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-golden-hour) |
| Ghostline | `scene-ghostline` | behind-person | outline, fade | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-ghostline) |
| Lime Swipe | `scene-lime-swipe` | behind-person | pill, slide | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-acid-slide) |
| Monument | `scene-monument` | behind-person | hero, rise | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-monument) |
| Sunburst | `scene-sunburst` | behind-person | hero, pop | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-sunburst) |
| Crimson | `scene-crimson` | behind-person | hero, fade | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/ca-crimson) |
| Pastel Fisheye | `scene-pastel-fisheye` | behind-person | diagonal, wobble | CSS perspective / tilt; no camera tracking or lens warp | [Reference](https://makemoonshot.co/caption-templates/pastel-lens) |
| Cutout | `scene-cutout` | playful | hero, zoom | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ca-cutout) |
| Blush Lab | `scene-blush-lab` | playful | hero, type | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/blush-lab) |
| Butter | `scene-butter` | playful | hero, pop | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/play-butter) |
| Pop Off | `scene-pop-off` | playful | hero, pop | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/play-moxie) |
| Ribbon | `scene-ribbon` | playful | diagonal, slide | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/play-curve) |
| Cursive | `scene-cursive` | playful | hero, fade | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/play-cursive) |
| Focusline | `scene-focusline` | multiline | hero, fade | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ca-focusline) |
| Fireline | `scene-fireline` | multiline | hero, rise | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ca-fireline) |
| Moonbeam | `scene-moonbeam` | multiline | hero, rise | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ml-halo) |
| Supernova | `scene-supernova` | multiline | hero, zoom | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ml-illusion) |
| Gold Centre | `scene-gold-centre` | multiline | hero, pop | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ml-masala) |
| Blue Muse | `scene-blue-muse` | multiline | hero, fade | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ml-aura) |
| Diagonal | `scene-diagonal` | multiline | diagonal, slide | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ml-swiss) |
| Red Shift | `scene-red-shift` | multiline | hero, rise | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ml-redline) |
| Margin Note | `scene-margin-note` | multiline | hero, wobble | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ml-scribble) |
| Headliner | `scene-headliner` | multiline | hero, slide | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/ml-blockbuster) |
| Inception | `scene-inception` | dynamic | outline, zoom | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/dyn-stretch) |
| Linen | `scene-linen` | dynamic | highlight, type | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/dyn-linen) |
| Quill | `scene-quill` | dynamic | hero, type | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/dyn-quill) |
| Storyline | `scene-storyline` | dynamic | hero, slide | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/dyn-storyline) |
| Glide | `scene-glide` | dynamic | hero, slide | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/dyn-glide) |
| Wiggle | `scene-wiggle` | dynamic | highlight, wobble | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/dyn-wiggle) |
| Aura | `scene-aura` | editorial | hero, fade | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/aura) |
| Delhi | `scene-delhi` | editorial | hero, fade | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/delhi) |
| Soft Script | `scene-soft-script` | editorial | hero, fade | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/soft-script) |
| Swiss | `scene-swiss` | editorial | hero, rise | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/swiss) |
| Masala | `scene-masala` | editorial | hero, pop | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/masala) |
| Chrome | `scene-chrome` | editorial | chrome, fade | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/chrome) |
| Serif Quote | `scene-serif-quote` | editorial | highlight, fade | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/serif-quote) |
| Liquid Glass | `scene-liquid-glass` | neon-fx | glass, fade | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/liquid-glass) |
| Beast Mode | `scene-beast-mode` | creators | neon, pop | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/beast-mode) |
| Karaoke | `scene-karaoke` | creators | karaoke, none | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/karaoke-bar) |
| Desi Bold | `scene-desi-bold` | desi | hero, pop | Caption with subject occlusion | [Reference](https://makemoonshot.co/caption-templates/desi-bold) |
| Tabahi | `scene-tabahi` | desi | hero, rise | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/tabahi) |
| Floodlight | `scene-floodlight` | social | box, pop | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/social-yellow) |
| Pink Neon | `scene-pink-neon` | social | neon, fade | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/social-glow) |
| Flashbulb | `scene-flashbulb` | retro | outline, pop | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/retro-pop) |
| Filmstrip | `scene-filmstrip` | retro | pill, fade | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/retro-yellow-word) |
| Dolly | `scene-dolly` | retro | hero, zoom | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/spring) |
| Searchlight | `scene-searchlight` | retro | sweep, none | Caption treatment | [Reference](https://makemoonshot.co/caption-templates/sweep) |
