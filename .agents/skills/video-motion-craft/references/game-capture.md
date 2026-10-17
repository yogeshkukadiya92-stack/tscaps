# game-capture — getting material out of a game or app

How to capture frames and recordings from a running game so they are usable in a
trailer and on a store page. Every item here cost a re-shoot.

## 1. Clean plate: capture the game WITHOUT its interface, composite it back later

**Rule.** Gameplay is captured clean — no HUD, no menu, no control hints. Everything
that needs to appear on top (captions, numbers, logo, interface elements) goes on as
separate layers in the edit.

**Why this is not taste:**

- **Localisation.** A video is usually needed in several languages. With the interface
  baked into the recording, every language demands a RE-SHOOT, and the game plays
  differently each run, so the versions stop matching frame for frame. With a clean
  plate, language is a text layer: one recording, any number of localisations, all of
  them frame-identical.
- **Legibility.** A game HUD was designed for the game, not for a trailer: it is small,
  it sits in the corners, and it fights your typography for the same parts of the
  frame. Your own layer goes where you need it, at a size you choose.
- **Re-editing.** Change the timing or the order of cuts and the captions move by
  editing numbers, not by shooting again.
- **Reframing.** A clean plate can be cropped and zoomed freely. A frame with a HUD
  around the edges loses part of the interface at any zoom and looks broken.

**How to get a clean plate when the game has no such mode.** You do not need to touch
the game's code: hide the interface for the duration of the capture by injecting CSS.

```js
await page.addStyleTag({
  content: `
    [data-testid="hud-camera"], [class*="hud"], [class*="controlsHint"] { opacity: 0 !important; }
  `,
})
```

Find the selectors in the markup rather than guessing: projects usually already have
`data-testid`, and it survives the bundler's class-name hashing.

**Hide visibility only — never `pointer-events: none`.** Precedent: the same rule that
hid the camera-mode button also blocked the click that toggles it, and the entire take
was shot in one camera mode. Input goes through the keyboard, so there is nothing to
misclick.

Use `opacity`, not `display: none`: the layout must stay identical, or the play area
shifts and the recording no longer matches the framing of the screenshots.

**When the HUD does belong in frame.** For store screenshots, almost always: the rule
there is "show real gameplay", the interface is part of it, and on-screen buttons prove
the game is playable on a phone. The clean plate is a TRAILER technique, not a
screenshot technique. Decide per deliverable.

**Self-check.** How many recordings would have to be re-shot if a third language were
added tomorrow? The correct answer is zero.

## 2. One language per video, but one recording for all of them

**Rule.** Localised videos are built from ONE clean-plate recording and differ only in
their text layers. Parameterise the composition by locale instead of copying it.

```tsx
const COPY = {
  en: { hook: ['TANK BATTLES', 'ARE BACK'], cta: 'Play in your browser' },
  ru: { hook: ['ТАНКОВЫЕ БИТВЫ', 'ВЕРНУЛИСЬ'], cta: 'Играй в браузере' },
} as const
```

Check the display face covers every alphabet the copy needs. A font that looks right
and lacks Cyrillic or diacritics silently falls back to a system font for exactly the
language you did not test. Some languages also set 20–30% longer than English: verify
size and wrapping against the LONGEST language, not the shortest.

## 3. Headed mode is mandatory

**Rule.** A WebGL browser game is captured in headed mode only.

**Precedent.** The first attempt captured headless: the scene never came up, the
screenshot was a flat fill, and there were no console errors at all. An hour went into
hunting a loading bug that did not exist.

**Self-check.** Does the frame contain a `canvas` with content, rather than an even
background?

## 4. Viewport width is chosen by LAYOUT, not by output resolution

**Rule.** First pick the CSS width at which the game shows the layout you want, then
pick the device pixel ratio that produces the required file size.

**Precedent.** A store needed 1920×1080 frames. Capturing at a 960×540 viewport with a
scale factor of 2 produces exactly 1920×1080 — and a completely different layout: the
game switched to its compact mode, the arena took a quarter of the frame, and the
platform's "gameplay must fill at least 70% of the image" requirement failed. At
1600 CSS px the layout is the desktop one; a scale factor of 1.6 gives the same
required pixels.

**Self-check.** Is the layout in frame the one a real player sees on that device?

## 5. Animated buttons refuse to be clicked

**Rule.** Click live game elements with `click({ force: true })` and blur immediately
afterwards.

**Precedent.** Playwright waits for an element to stop moving. A menu button breathing
on a sine wave never becomes "stable", and the click timed out. After a successful
click, the focus ring stayed on the button and landed in a store frame as a selected
interface element.

```js
await button.click({ force: true })
await page.evaluate(() => document.activeElement && document.activeElement.blur())
```

## 6. Verify the game actually started

**Rule.** Capture does not begin until a probe confirms the gameplay screen. Silently
recording a menu instead of a match is not acceptable.

**Precedent.** A vertical recording spent 30 seconds filming the main menu: the click
did not take at that viewport, and the script did not notice — it happily produced a file.

```js
const inBattle = async () => /STAGE\s+\d|LEVEL\s+\d/i.test((await probe()).text)
for (let attempt = 1; attempt <= 3 && !(await inBattle()); attempt += 1) { … }
if (!(await inBattle())) throw new Error('the match never started — the recording is worthless')
```

The same probe catches the loading screen. A loading gate may say "DEPLOYING 96%" in
one language and something entirely different in another, and the readiness detector
has to know every wording, or it releases the scene half-loaded.

## 7. Play for the camera, do not just press keys

**Rule.** A capture script is a take, not a test. The character moves continuously and
fires on the move; static pauses in the recording are unusable later.

If the game has camera modes (wide view / camera on the hero), switch several times per
take. One pass then yields material that DIFFERS visually, and the edit does not read
as one long shot.

**Precedent.** The first take ran entirely in wide view: cutting it read as one frame
chopped into pieces. A take with three camera switches gave both the recognisable
composition and the close-up.

## 8. The hero's death and the game-over screen do not go in the take

**Rule.** Record more than you need and edit from the stretch where the hero is alive.
A defeat screen never appears in promotional material.

**Precedent.** The first landscape recording ended on "DEFEAT" at 41 seconds, and half
the material was unusable.

## 9. The edit window is chosen from a contact sheet, not from guessed timecodes

**Rule.** Immediately after recording, build a contact sheet at 2–3 second intervals and
look at it. Loading, menus, the intro card and the end screens eat far more than you think.

```bash
ffmpeg -v error -i raw.webm -vf "fps=1/3,scale=280:-1" probe/%02d.png
magick montage probe/*.png -tile 7x3 -geometry +3+3 -label '%f' contact.png
```

**Precedent.** A 110-second recording contained less than a third of clean gameplay:
the loading screen alone held for 18 seconds. Without the contact sheet the window
would have been picked blind.

## 10. Screen recording carries no audio

**Rule.** Video captured from a browser arrives silent — that is a limitation of the
capture, not an oversight. Either synthesise the sound and place it in the edit, or
ship deliberately silent and write the reason into the project documentation.

Dropping an unrelated music track under someone's gameplay is a risk both for rights
and for hitting the action. A kit generated by `gen-sfx.mjs` raises neither question.

## Order of work

1. Decide what is being captured: a trailer (clean plate) or store screenshots (with interface).
2. Pick the CSS viewport by layout, then the pixel ratio by required resolution.
3. Headed browser, wait for readiness, verify the match actually started.
4. Record a take with margin: camera switches, continuous movement, no death.
5. Contact sheet → choose the windows by eye.
6. Edit: clean plate underneath, interface and text as separate layers, one layer set per language.
