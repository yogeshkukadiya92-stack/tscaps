# Ready editing skills

Creative → Auto Edit now starts with eight no-prompt recipes: Complete reel,
Cinematic, Studio lighting, Energetic reel, Teaching / tutorial, Creator reveal,
Quiet pause cuts, and Gentle zooms. Clicking a recipe analyzes local audio when
needed and prepares an editable draft; Apply commits it through existing undo.
No AI request, uploaded project, paid quote, or prompt is needed for these recipes.

The recipes use ReelStudio's existing AutoEdit planner, caption templates and
motion effects. They do not execute downloaded shell scripts or Remotion code.
The optional paid prompt editor remains available for custom instructions.
Each run replaces unchanged auto-generated edits rather than stacking recipes;
manual changes, transcribed words and source media retain existing protection.
Missing transcripts prevent automatic cuts. Timed manual layers may prevent cuts.
Cinematic means the listed amber lighting/motion/cover recipe, not AI scene analysis.

## GitHub reference skill

Installed in `.agents/skills/video-motion-craft` using Codex skill-installer from
https://github.com/vibegameengine/video-motion-craft (main, retrieved 2026-10-18;
HEAD observed: c17ab30ee376379c84d84315b886ae4282d7a96c).
The upstream files, MIT license, Apache license and third-party notices are retained.
The bundle covers FFmpeg cuts, captions, motion, sound design and review guidance.
It is an agent reference for future editing work, not a browser runtime dependency.
Its footage guidance supports the existing order: measured cuts before output-clock
motion/captions, breathing room around speech, and review before final output.
The app recipes are our typed mappings to existing supported operations; importing
this bundle does not make all of its 157 motion techniques available in the app.

Validation: TypeScript check, production build, AutoEdit regression tests and a
mobile browser test for cinematic preview/apply, switching/discarding and zero paid
AI requests. This source change still needs normal deployment to appear on the site.
