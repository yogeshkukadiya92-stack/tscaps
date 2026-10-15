import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { TranscriberOptions } from '@tscaps/engine';
import { AppDialog, AppDialogActions } from '@ui/_shared/components/Dialog/AppDialog';
import { AppErrorMessage, getAppErrorTitle } from '@ui/_shared/components/AppErrorMessage/AppErrorMessage';
import { AsyncButton } from '@ui/_shared/components/AsyncButton/AsyncButton';
import { Loader2 } from 'lucide-react';
import { BTN_PRIMARY_SM, BTN_SECONDARY_SM } from '@ui/_shared/styles/buttons';
import type { AppError } from '@core/errors/domain/AppError';
import { WHISPER_SUPPORTED_LANGUAGES, type SupportedLanguage } from '@shared/transcription-languages';
import type { TranscribePreference } from '@core/transcription/domain/TranscribePreference';
import type { PreprocessVideoOptions, PreprocessVideoAction } from '@core/preprocessing/actions/PreprocessVideoAction';
import type { UpdateTranscribePreferenceAction } from '@core/transcription/actions/UpdateTranscribePreferenceAction';
import {
  LanguagePicker,
  AUTO_DETECT_LANGUAGE_VALUE,
} from '@ui/_shared/components/LanguagePicker/LanguagePicker';
import { AdvancedSection } from '@ui/pages/editor/features/preprocessing/components/AdvancedSection';
import { SubtitleFileField } from '@ui/pages/editor/features/preprocessing/components/SubtitleFileField';
import type { SubtitleFile } from '@core/transcription/domain/SubtitleFile';

const DEFAULT_DESCRIPTION = 'Pick a language. Transcription runs in your browser.';
const SUBTITLE_FILE_DESCRIPTION = 'Your captions come from the file. Nothing is transcribed.';

// Far above any subtitle file; what it stops is a video picked by mistake
// being read whole into memory as text.
const MAX_SUBTITLE_FILE_BYTES = 10 * 1024 * 1024;

const SOURCE_TOGGLE_CLS =
  'mr-auto self-center text-xs text-fg-muted cursor-pointer bg-transparent border-0 p-0 ' +
  'transition-colors duration-quick ease-standard ' +
  'hover:text-fg-secondary focus-visible:outline-none focus-visible:text-fg-secondary';

interface StartDialogProps {
  readonly open: boolean;
  readonly title?: string;
  readonly initialLanguage?: string;
  readonly onStart?: (options: PreprocessVideoOptions) => Promise<void>;
  readonly preference: TranscribePreference;
  readonly isMobileDevice: boolean;
  readonly error: AppError | null;
  readonly preprocessVideo: PreprocessVideoAction;
  readonly updatePreference: UpdateTranscribePreferenceAction;
  readonly onCancel: () => void;
  /** Disables the default Start action while the loaded video is not accepted yet. */
  readonly startDisabled?: boolean;
  /** Draws a spinner on the default Start action while the flow is still deciding. */
  readonly startPending?: boolean;
  readonly description?: string;
  readonly extraFields?: ReactNode;
  readonly extraNotices?: ReactNode;
  /** Notices about transcribing the audio, left out while captions come from a subtitle file. */
  readonly transcriptionNotices?: ReactNode;
  readonly renderActions?: (start: () => Promise<void>) => ReactNode;
  /**
   * Whether the transcriber runs in the browser. Only then is a subtitle
   * file offered in place of transcribing.
   */
  readonly inBrowserTranscription?: boolean;
  /**
   * Languages offered by the transcriber this dialog is starting. Defaults
   * to the Whisper list, matching the default in-browser transcriber.
   */
  readonly languages?: readonly SupportedLanguage[];
  /**
   * Adds an "Auto-detect" first row to the language picker and uses it as
   * the initial value. Off by default: the in-browser Whisper transcriber
   * silently falls back to English when nothing is picked, so we require
   * an explicit choice there. Callers whose transcriber can detect the
   * language from the audio turn this on.
   */
  readonly allowAutoDetect?: boolean;
  /**
   * Surface code of the user's most-picked language across sessions.
   * The matching entry in `languages` gets a "Most used" hint (or
   * only "Last used" when it coincides with `lastUsedCode`). Callers
   * are expected to have moved this language to the top of the list.
   */
  readonly mostUsedCode?: string | null;
  /**
   * Surface code of the user's last-picked language. The matching
   * entry gets a "Last used" hint. Callers are expected to have moved
   * this language near the top of the list.
   */
  readonly lastUsedCode?: string | null;
  /**
   * Fires when the user commits an explicit language (not auto-detect,
   * not empty) via Start. Receives the full catalog entry so the
   * caller can persist a usage signal keyed by whichever identity it
   * prefers without exposing the storage layer to this component.
   */
  readonly onLanguagePicked?: (language: SupportedLanguage) => void;
}

/**
 * Shared "Start your video" dialog. Holds the language and advanced
 * panel state internally; the optional slots let callers extend the
 * form with extra fields (e.g. a multi-speaker toggle), extra notices
 * (e.g. a duration cap warning), or a custom action row.
 */
export function StartDialog({
  open,
  title = "Start your video",
  initialLanguage,
  onStart,
  preference,
  isMobileDevice,
  error,
  preprocessVideo,
  updatePreference,
  onCancel,
  startDisabled = false,
  startPending = false,
  description,
  extraFields,
  extraNotices,
  transcriptionNotices,
  renderActions,
  inBrowserTranscription = true,
  languages = WHISPER_SUPPORTED_LANGUAGES,
  allowAutoDetect = false,
  mostUsedCode = null,
  lastUsedCode = null,
  onLanguagePicked,
}: StartDialogProps) {
  const [language, setLanguage] = useState<string>(initialLanguage ?? (allowAutoDetect ? AUTO_DETECT_LANGUAGE_VALUE : ''));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<SubtitleFile | null>(null);
  const [subtitleFileError, setSubtitleFileError] = useState<string | null>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const fromSubtitleFile = inBrowserTranscription && subtitleFile !== null;
  const romanHinglish = inBrowserTranscription && preference.captionStyle === 'roman-hinglish';

  const pickSubtitleFile = () => subtitleInputRef.current?.click();

  const handleSubtitleFilePicked = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    if (picked.size > MAX_SUBTITLE_FILE_BYTES) {
      setSubtitleFileError('That file is too large to be a subtitle file.');
      return;
    }
    try {
      setSubtitleFile({ name: picked.name, text: await picked.text() });
      setSubtitleFileError(null);
    } catch {
      setSubtitleFileError("Couldn't open that file. Try picking it again.");
    }
  };

  const handleLanguageChange = (next: string) => {
    setLanguage(next);
    if (languageError !== null) setLanguageError(null);
  };

  const handleStart = async (): Promise<void> => {
    if (fromSubtitleFile) {
      return (onStart ?? ((options) => preprocessVideo.execute(options)))({ transcriber: {}, multipleSpeakers: false, subtitleFile });
    }
    if (!romanHinglish && !allowAutoDetect && language === '') {
      setLanguageError('Please pick a language.');
      document.getElementById('td-language')?.focus();
      return;
    }
    const selectedLanguage = romanHinglish ? 'hi' : language;
    const isExplicit = selectedLanguage !== '' && selectedLanguage !== AUTO_DETECT_LANGUAGE_VALUE;
    const transcriber: TranscriberOptions = isExplicit ? { language: selectedLanguage } : {};
    const picked = isExplicit ? languages.find((l) => l.code === selectedLanguage) : undefined;
    if (picked !== undefined) onLanguagePicked?.(picked);
    return (onStart ?? ((options) => preprocessVideo.execute(options)))({
      transcriber,
      multipleSpeakers: false,
      ...(picked ? { language: picked } : {}),
    });
  };

  return (
    <AppDialog
      open={open}
      onClose={onCancel}
      closeOnOutsideClick={false}
      size="md"
      title={title}
      description={fromSubtitleFile ? SUBTITLE_FILE_DESCRIPTION : description ?? DEFAULT_DESCRIPTION}
    >
      {inBrowserTranscription && (
        <input
          ref={subtitleInputRef}
          type="file"
          accept=".srt,.vtt,application/x-subrip,text/vtt"
          className="hidden"
          onChange={(event) => void handleSubtitleFilePicked(event)}
          data-testid="subtitle-file-input"
        />
      )}

      {subtitleFile && fromSubtitleFile ? (
        <SubtitleFileField file={subtitleFile} onChange={pickSubtitleFile} />
      ) : (
        <>
          {inBrowserTranscription && <div className="flex flex-col gap-2">
            <button type="button" className={BTN_SECONDARY_SM} onClick={() => {
              updatePreference.execute({ ...preference, model: 'large-v3-turbo', captionStyle: 'original' });
              handleLanguageChange('gu');
              setAdvancedOpen(true);
            }}>ગુજરાતી · High accuracy</button>
            <p className="text-xs text-fg-muted m-0">Gujarati speech → ગુજરાતી captions with Whisper Large v3 Turbo. Large download; needs more memory and time. Review names and unclear speech.</p>
          </div>}
          {inBrowserTranscription && <label className="flex flex-col gap-1.5 text-xs text-fg-secondary">
            Caption language & script
            <select aria-label="Caption language & script" className="bg-surface-1 border border-edge-medium rounded-sm p-2 text-sm text-fg-primary"
              value={preference.captionStyle ?? 'original'} onChange={event => {
                updatePreference.execute({ ...preference, captionStyle: event.target.value as 'roman-hinglish' | 'original' });
                setLanguageError(null);
              }}>
              <option value="roman-hinglish">Roman Hinglish — Hindi + English</option>
              <option value="original">Original script / other languages</option>
            </select>
          </label>}
          {romanHinglish ? <div className="flex flex-col gap-2">
            <p className="text-xs text-fg-secondary m-0">Hindi + English speech → Roman captions. Example: “aaj hum video edit karenge”. English words stay in English.</p>
            <p className="text-xs text-fg-muted m-0">Hindi words are romanized after transcription. Review names and spellings in the Transcript editor.</p>
            <div className="flex gap-2">
              <button type="button" className={preference.model === 'small' ? BTN_PRIMARY_SM : BTN_SECONDARY_SM} aria-pressed={preference.model === 'small'}
                onClick={() => updatePreference.execute({ ...preference, model: 'small' })}>Balanced · Small</button>
              <button type="button" className={preference.model === 'medium' ? BTN_PRIMARY_SM : BTN_SECONDARY_SM} aria-pressed={preference.model === 'medium'}
                onClick={() => updatePreference.execute({ ...preference, model: 'medium' })}>Accuracy · Medium</button>
            </div>
            <p className="text-2xs text-fg-muted m-0">{preference.model === 'medium' ? 'Medium has a larger first download and needs more memory and processing time.' : 'Small is the default balance of model size and transcription quality.'}</p>
          </div> : <LanguagePicker
            id="td-language"
            label="Language"
            languages={languages}
            value={language}
            onChange={handleLanguageChange}
            allowAutoDetect={allowAutoDetect}
            mostUsedCode={mostUsedCode}
            lastUsedCode={lastUsedCode}
            placeholder="Select a language"
            errorMessage={languageError ?? undefined}
          />}

          {extraFields}
        </>
      )}

      {subtitleFileError && (
        <p className="text-xs text-danger m-0" role="alert">{subtitleFileError}</p>
      )}

      {inBrowserTranscription && !fromSubtitleFile && (
        <AdvancedSection
          open={advancedOpen}
          onToggle={() => setAdvancedOpen((v) => !v)}
          preference={preference}
          onPreferenceChange={(pref) => updatePreference.execute(pref)}
        />
      )}

      {inBrowserTranscription && !fromSubtitleFile && isMobileDevice && (
        <p className="text-2xs text-fg-faint m-0 leading-snug">
          In-browser transcription runs on your device — on mobile it can be slow or fail.
        </p>
      )}

      {!fromSubtitleFile && transcriptionNotices}

      {extraNotices}

      {error && (
        <div
          role="alert"
          className="text-sm text-danger bg-danger/10 border border-danger/40 rounded-xs px-3 py-2 space-y-1"
        >
          <p className="font-semibold m-0">{getAppErrorTitle(error)}</p>
          <div className="text-fg-secondary">
            <AppErrorMessage error={error} isMobile={isMobileDevice} />
          </div>
        </div>
      )}

      <AppDialogActions>
        {inBrowserTranscription && (
          <button
            type="button"
            className={SOURCE_TOGGLE_CLS}
            onClick={fromSubtitleFile ? () => setSubtitleFile(null) : pickSubtitleFile}
            data-testid="caption-source-toggle"
          >
            {fromSubtitleFile ? 'Transcribe instead' : 'Use subtitle file instead'}
          </button>
        )}
        {renderActions
          ? renderActions(handleStart)
          : (
            <>
              <button type="button" className={BTN_SECONDARY_SM} onClick={onCancel}>Cancel</button>
              <AsyncButton
                data-testid="start-flow-primary"
                className={BTN_PRIMARY_SM}
                onClick={handleStart}
                disabled={startDisabled}
                autoFocus
              >
                {startPending && <Loader2 size={12} className="animate-spin" />}
                Start
              </AsyncButton>
            </>
          )}
      </AppDialogActions>
    </AppDialog>
  );
}
