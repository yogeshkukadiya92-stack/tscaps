# ReelStudio Codex plugin

A local, skills-based Codex plugin for this repository. It includes project development, caption template authoring, and browser video editing guidance. The application and media files remain separate; no API server, credentials, paid service, or renderer is bundled.

## Install

From the repository root:

```sh
codex plugin marketplace add ./codex-plugins
codex plugin add reelstudio@reelstudio-local
```

Start a new Codex chat after installation if the skills do not appear in the current chat. Open the ReelStudio checkout for development tasks; supply a video and an accessible editor for editing tasks.

## Example requests

- Use $reelstudio-project to fix the Creative Studio export issue.
- Use $reelstudio-caption-template to create a bold karaoke caption look.
- Use $reelstudio-video-edit to trim this video and add Roman Hinglish captions.

The plugin guides Codex using the tools available in the chat. It does not add dedicated video processing tools. A video is complete only after the editor produces an export.

## Refresh and remove

After updating the plugin source, refresh the local marketplace and reinstall using the supported commands shown by `codex plugin marketplace --help` and `codex plugin --help` for your installed version.

```sh
codex plugin remove reelstudio@reelstudio-local
```
