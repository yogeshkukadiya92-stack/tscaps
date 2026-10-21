import { UiText, useTranslation } from '@ui/i18n/Locale';
import { useEffect, useState } from 'react';
import { AppDialog, AppDialogActions } from '@ui/_shared/components/Dialog/AppDialog';
import { BTN_PRIMARY_SM } from '@ui/_shared/styles/buttons';
import { UNTRANSCRIBED_PLACEHOLDER_TEXT } from '@core/transcription/domain/UntranscribedPlaceholder';
import type { UntranscribedRegionsNotice, UntranscribedRegionsStore } from '@core/transcription/store/UntranscribedRegionsStore';
import type { TranscribeModel } from '@core/transcription/domain/TranscribePreference';
import { useTranscription } from '@ui/_shared/contexts/modules/TranscriptionContext';

const MODEL_LABELS: Record<TranscribeModel, string> = {
  tiny: 'Tiny',
  base: 'Base',
  small: 'Small',
  medium: 'Medium',
  'large-v3-turbo': 'Large v3 Turbo',
};

const BODY = 'text-sm text-fg-secondary leading-normal m-0';
const EMPHASIS = 'text-fg-primary font-medium';
const PLACEHOLDER_CHIP =
  'rounded-xs border border-edge-subtle bg-surface-3 px-1 py-px ' +
  'font-mono text-[0.9em] text-fg-primary whitespace-nowrap';

const RANGES_PANEL = 'rounded-xs border border-edge-subtle bg-surface-3 px-3 py-2';
const RANGES_LABEL = 'font-mono text-2xs uppercase tracking-[0.08em] text-fg-faint m-0';
const RANGES_VALUE = 'mt-1 text-sm text-fg-primary font-medium tabular-nums m-0';


function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatRanges(notice: UntranscribedRegionsNotice): string {
  return notice.regions
    .map((region) => `${formatTimestamp(region.startSeconds)}–${formatTimestamp(region.endSeconds)}`)
    .join(' · ');
}

function useNotice(store: UntranscribedRegionsStore): UntranscribedRegionsNotice | null {
  const [notice, setNotice] = useState<UntranscribedRegionsNotice | null>(() => store.notice);
  useEffect(() => {
    const update = (): void => setNotice(store.notice);
    store.addEventListener('change', update);
    update();
    return () => store.removeEventListener('change', update);
  }, [store]);
  return notice;
}

/**
 * Post-transcription notice for audio the local run could not
 * transcribe. Renders nothing while no notice is pending — the notice
 * store is only ever populated by the local transcriber, so surfaces
 * that transcribe remotely never show this. Dismissing clears the
 * notice.
 */
export function UntranscribedRegionsDialog() {
  const store = useTranscription().untranscribedRegionsStore;
  const notice = useNotice(store);
  if (!notice) return null;
  return <PendingNoticeDialog notice={notice} onClose={() => store.clear()} />;
}

function PendingNoticeDialog({ notice, onClose }: { notice: UntranscribedRegionsNotice; onClose: () => void }) {
  const { t } = useTranslation();
  const rangeLabel = notice.regions.length === 1 ? 'Untranscribed range' : 'Untranscribed ranges';
  return (
    <AppDialog
      open
      onClose={onClose}
      size="md"
      title={t("Parts of your audio couldn't be transcribed")}
    >
      <p className={BODY}><UiText text="The in-browser " /><span className={EMPHASIS}>{MODEL_LABELS[notice.model]}</span><UiText text=" model produced unusable output for parts of your video. Those parts are marked" />{' '}
        <span className={PLACEHOLDER_CHIP}>{UNTRANSCRIBED_PLACEHOLDER_TEXT}</span><UiText text=" in the captions. Edit or delete them like any other caption." /></p>

      <div className={RANGES_PANEL}>
        <p className={RANGES_LABEL}>{rangeLabel}</p>
        <p className={RANGES_VALUE}>{formatRanges(notice)}</p>
      </div>

      <p className={BODY}>
        {notice.model === 'large-v3-turbo'
          ? t('Check the selected speech language and try cleaner audio with less background music. Unclear speech can still be missed by this model.')
          : <><UiText text="Try " /><span className={EMPHASIS}><UiText text="ગુજરાતી · Gujarati captions" /></span><UiText text=" for Gujarati, or choose Large v3 Turbo in " /><span className={EMPHASIS}><UiText text="Advanced settings" /></span><UiText text=". Larger models need more memory and processing time." /></>}
      </p>


      <AppDialogActions>
        <button type="button" className={BTN_PRIMARY_SM} onClick={onClose}><UiText text="Got it" /></button>
      </AppDialogActions>
    </AppDialog>
  );
}
