# Interface languages and content-format persistence

ReelStudio supports English (`en`), Hindi (`hi`) and Gujarati (`gu`) through `LocaleProvider` in the application shell. The language selector is available on public pages and in the signed-in/local workspace. The preference is stored in this browser under `reelstudio.ui-language`, synchronizes across tabs, and sets the document language and page title. A blocked browser storage API does not prevent switching languages for the current session.

## Interface copy

Use `UiText` for authored text nodes and `useTranslation().t()` for string properties, accessible names and interpolated messages. Add both Hindi and Gujarati translations to `apps/studio/src/ui/i18n/translations.ts` in the same change. Literal-key coverage and placeholder checks run with the studio unit suite. Unknown messages fall back to the original text; external service messages are not automatically machine-translated.

Translate interface copy at render time. Do not translate project names, filenames, transcripts, user-authored card text, font family names, song titles or stored enum values. Template names remain identifiers, with localized descriptions and categories. Keep structural CSS and automation selectors independent of translated text; use stable `data-ui` identifiers instead of English ARIA labels.

UI language and content language are distinct. An untouched content builder initially uses the UI language for examples. Once a content language or draft is selected, changing the interface language does not rewrite it or the resulting video. The content-language selector controls sample text and exported scene labels; the app-language selector controls forms and navigation.

## Saved content formats

`CreativeProject.contentFormat` is optional, so version-1 projects remain compatible. It includes the selected format/language, per-language topics, and independent per-format/per-language drafts with scene timings. Edits use the existing project store and save/undo path. Drafts can be incomplete without preventing a project save; applying cards still validates the script and timing.

On loading older projects, an original content-card sequence with recognizable localized labels and contiguous timings is recovered into its matching form. Existing effects are preserved. Manually renamed, reordered, overlapping or unrelated cards are not guessed into a recipe. Unapplied drafts that were never saved by the earlier version cannot be recovered.

The desktop plugin uses stable editor identifiers, so its edit/save/preview/export actions work regardless of interface language.

## Validation

- Unit coverage: locale validation, both translation catalogs, interpolation parameters, literal UI-key coverage, independent draft round trips, invalid metadata, all 18 legacy recipe migrations, and preservation of manually edited cards.
- Browser coverage: language switching and persistence, unchanged authored text, save/reopen of Gujarati drafts and timings, real card rendering/download, mobile public pages, desktop panels, and plugin automation while the UI is Gujarati.
- The wider browser suite uses mocked accounts/services. It does not charge a live account or verify a production deployment.
