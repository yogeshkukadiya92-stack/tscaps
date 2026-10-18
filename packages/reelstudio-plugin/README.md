# ReelStudio Desktop plugin — v0.1.0

A real local MCP server for **Claude Code and Codex local desktop sessions**. It operates ReelStudio in its own Chrome window using the same editing controls and compositor as the site. Existing projects remain manually editable. It does not use the upstream Tscaps API.

## What works

- `list_templates`: browse/filter all 31 current Auto Edit recipes, without a browser.
- `open_project`: open the project dashboard or a specific existing project; sign in yourself.
- `auto_edit`: apply a recipe/intensity and save the normal editable project.
- `open_preview`: bring the project preview to the foreground, optionally play it.
- `export_reel`: render and download an actual MP4/WebM file locally.
- `get_job`: follow edit/export completion or a concrete error.

This first version needs a **desktop**, **Node.js 22+**, **Google Chrome**, the ReelStudio site, and an existing project with accessible source media. Transcribe/import footage in the plugin browser before Auto Edit. No hosted render queue, API keys, subscription enforcement, public directory approval or sales system is included. Cloud-only chats and claude.ai connector installations are not supported by this local server.

## Setup once, then install

From the checkout root:

```sh
pnpm --filter @reelstudio/desktop-plugin build
node packages/reelstudio-plugin/scripts/setup.mjs
```

The explicit setup installs pinned Playwright 1.63.0 into `~/.reelstudio-plugin` using npm with lifecycle scripts disabled. It uses installed Chrome. The browser profile and session stay on this computer; passwords are entered only in the browser, never through MCP. Browser/session files should be treated as private. The protocol server is bundled; no package installation occurs on ordinary tool startup.

Claude Code:

```sh
claude plugin marketplace add /absolute/path/to/tscaps-main
claude plugin install reelstudio-desktop@reelstudio-desktop-plugins
```

Codex:

```sh
codex plugin marketplace add /absolute/path/to/tscaps-main
codex plugin add reelstudio-desktop@reelstudio-desktop-plugins
```

Restart the host or reload plugins so the six MCP tools appear. The new `reelstudio-desktop` plugin is separate from the existing developer guidance plugin `reelstudio@reelstudio-local`.

For a ZIP release, extract the matching platform ZIP to a stable folder, run `node scripts/setup.mjs` there once, then load/import that plugin folder in the host. Claude Code supports `claude --plugin-dir /absolute/path/to/extracted-folder`. For Codex manual MCP registration if your client does not load local plugin MCP configurations:

```sh
codex mcp add reelstudio -- node /absolute/path/to/extracted-folder/dist/index.mjs
```

The fallback registers the tools only; also follow the included skill workflow. Marketplace distribution avoids needing this fallback. Local testing/installing is separate from public directory approval; nothing here publishes a listing.

## First reel

1. Ask: “Show me ReelStudio templates for an educational reel.”
2. Ask the plugin to open ReelStudio. Sign in in the dedicated Chrome window and open/import/transcribe a project.
3. Give its `/project/UUID` URL or UUID: “Auto Edit this project with Study Notes.”
4. Wait for its job to succeed. Ask to open the preview; manually adjust it there if needed.
5. Ask: “Export it as MP4.” Wait for job success; open the returned actual file.

Auto Edit and export save your project. Auto Edit preserves manual changes according to the editor's ownership tracking; customized captions can keep their current look. One edit/export runs at a time. Jobs are in memory; after a restart inspect the project before repeating an operation. Project URLs do not include video bytes or grant access: cloud projects need the same account; local projects live in this dedicated profile. Keep the window open during rendering and save manual edits before ending the host session. Switching to a different project requires a new plugin session so unsaved work is not discarded by navigation.

## Optional configuration

Set before starting the host/server (no values are secret by default):

- `REELSTUDIO_URL`: HTTPS site origin; default is the current ReelStudio deployment. HTTP is permitted only for localhost during development.
- `REELSTUDIO_PLUGIN_DATA`: absolute private directory for runtime, Chrome profile and exports; default `~/.reelstudio-plugin`. Run setup again for a different directory.
- `REELSTUDIO_BROWSER_CHANNEL`: default `chrome`; an installed compatible Chromium channel may be selected.

Completed exports are under `<data>/exports`, with unique filenames. Two hosts cannot open the same Chrome profile concurrently. Close the other session or use different data directories. The tools deliberately cannot browse arbitrary URLs, extract cookies, read arbitrary local files, overwrite a chosen output path, or switch projects mid-session.

## Build, verify and package

```sh
pnpm --filter @reelstudio/desktop-plugin build
pnpm --filter @reelstudio/desktop-plugin test
claude plugin validate packages/reelstudio-plugin
pnpm --filter @reelstudio/desktop-plugin pack:plugins
```

The build regenerates `server/catalog.json` from the app's recipe catalog and bundles the MCP SDK and validation dependencies. Platform ZIPs include the executable bundle, setup helper, skill and manifests; no user profile, exports, node_modules or credentials. Browser integration tests live at `apps/studio/tests/e2e/reelstudio-plugin.spec.ts`.

The current site must expose the Creative/Auto Edit UI from commit `5f1403b` or newer. UI changes can require a plugin update. Existing access/billing checks stay in the normal site flow.

## Licensing

This new plugin code is MIT (see LICENSE). Its bundled dependencies retain their own licenses in THIRD_PARTY_NOTICES.txt. The separate editor app remains AGPL-3.0, while engine/templates remain MIT. Plugin packaging does not change those licenses or include the editor implementation.
