---
name: reelstudio-video-edit
description: "Edit a supplied video in ReelStudio: trim, remove silence, apply color and motion, mix music, add animated or Roman Hinglish captions, and export a reviewed file."
---

# Edit a video with ReelStudio
Use the user's ReelStudio browser session or local checkout. This skill supplies workflow guidance; it does not provide a video-rendering MCP server. Use available browser/computer tools for the editor, or existing project tools when applicable. If the source video or application is missing, ask for the needed file or location. Do not claim to have processed media without an actual export.

Read the checkout README for current supported workflows. With a local checkout, start the studio using its package script (pnpm --filter @tscaps/studio dev), and use the address reported by the server. Prefer an existing session when supplied. Keep the source file intact and give outputs new names.

## Creative editing
Open a video, then Creative → Open Creative Studio. The current implementation offers six looks, brightness/contrast/saturation, push/pulse/shake/flash motion, trim, 0.5–2× speed, silence removal, manual-BPM beat cuts, title text, and music mixing. Inspect the actual UI before using controls; settings may change with the app version. Silence detection uses audio energy, and beat cuts use a supplied BPM rather than automatic musical beat detection. Preview speech boundaries after cuts and check music does not mask speech.

Creative settings and uploaded music are session-only. Export and download before closing. Creative exports currently run in real time up to 1080p/30 fps; keep the tab visible. The recorder selects MP4 when supported, otherwise WebM. Do not label WebM as MP4. To caption the edited timeline, choose Add captions in a new project after the Creative export.

## Captions
Use Roman Hinglish — Hindi + English when requested. This uses multilingual Whisper Small by default; Medium is the accuracy option with greater download/memory cost. Hindi transcription is romanized afterward; this is not a fine-tuned Hinglish model. Review names, uncommon words, English loanwords, and timing. Original script / other languages uses the normal language picker. Existing Hindi captions can be converted through Transcript → Convert Hindi to Roman Hinglish with Undo support. Imported subtitles retain their text.

Choose a gallery template and tune font, position, contrast, active-word emphasis, and animation. Inspect caption readability against bright/dark frames and verify the exported captions match preview. Review the beginning, end, cut boundaries, caption timing, audio, dimensions, duration, and playable output. Deliver the actual exported file with a clickable path and briefly describe the edit. If export or review is blocked, report exactly what remains instead of presenting an edit plan as a completed video.
