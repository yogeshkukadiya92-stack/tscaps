---
name: reelstudio-project
description: "Develop and debug the ReelStudio/Tscaps repository, including its editor, rendering engine, Creative Studio, Hinglish transcription, and private cloud projects. Use for changes to this codebase."
---

# ReelStudio project work
Locate the checkout from the current workspace: its root package.json is named reelstudio, with apps/studio, packages/engine, and templates. If absent, ask for the checkout path. Read applicable AGENTS.md and the current README before changes; this plugin contains guidance, not a bundled copy of the app.

## Code map
- apps/studio/src/core: domain, actions, transcription, projects, and export.
- apps/studio/src/presentation: editor controllers and services.
- apps/studio/src/ui: React interface.
- packages/engine: framework-independent caption rendering; read its README for the document model.
- apps/studio/src/ui/pages/editor/features/creative/CreativeStudio.tsx and creativeModel.ts: Creative Studio UI, cuts, audio, and canvas rendering.
- apps/studio/src/core/transcription/services/HinglishRomanizer.ts: Hindi-to-Roman spelling conversion.
- apps/studio/src/core/projects/infrastructure/repositories: local IndexedDB and Supabase storage.

Inspect nearby code and actual package scripts before changing a feature. Preserve word IDs, timings, speaker metadata, and undo behavior when editing captions. Creative preview and export must use equivalent rendering. Preserve account ownership checks and private video access in cloud project changes; public runtime config must never contain service-role credentials.

Use the pinned pnpm version in package.json. Validate affected behavior with existing focused tests, then appropriate typecheck/build checks. Root scripts include pnpm typecheck, pnpm lint, pnpm build; studio tests use pnpm --filter @tscaps/studio test. For template changes use the caption-template skill. For editing a supplied video use the video-edit skill. Report checks actually run and any remaining limitation. Deployment requires the user's deployment request; ordinary code work does not imply deployment.
