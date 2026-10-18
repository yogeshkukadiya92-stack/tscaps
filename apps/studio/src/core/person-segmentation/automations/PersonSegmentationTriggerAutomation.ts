import type { EditorState } from '@core/editor/domain/EditorState';
import type { EditorStore } from '@core/editor/store/EditorStore';
import type { RefreshDocumentAction } from '@core/editor/actions/RefreshDocumentAction';
import type { StartBehindActorAnalysisAction } from '@core/person-segmentation/actions/StartBehindActorAnalysisAction';
import type { CaptionedRangeCollector } from '@core/person-segmentation/services/CaptionedRangeCollector';
import type { PersonSegmentationResultReader } from '@core/person-segmentation/services/PersonSegmentationResultReader';
import type { BehindActorPreviewSupportChecker } from '@core/person-segmentation/services/BehindActorPreviewSupportChecker';
import type { PersonSegmentationFlowStore } from '@core/person-segmentation/store/PersonSegmentationFlowStore';
import type { Sheet } from '@core/sheets/domain/Sheet';
import type { ElementStyles } from '@core/elements/domain/ElementStyles';
import type { BehindActorSegmentOverrideRegistry } from '@core/person-segmentation/domain/BehindActorSegmentOverrideRegistry';

interface RevertSnapshot {
  readonly sheets: Sheet[];
  readonly activeSheetId: string | null;
  readonly elementStyles: ElementStyles;
  readonly behindActorOverrides: BehindActorSegmentOverrideRegistry;
}

/**
 * Prepares text-behind-person templates in the background, once per project.
 * Style selection remains available while the playback gate covers unmeasured
 * frames. Existing analysis is reused across template changes and reloads.
 */
export class PersonSegmentationTriggerAutomation {
  private evaluationRevision = 0;
  private lastEvaluatedProjectId: string | null | undefined;
  private lastEvaluatedTemplateId: string | null = null;
  private lastEvaluatedActiveSheetId: string | null = null;
  private lastEvaluatedSnapshot: RevertSnapshot | null = null;
  private pendingRevert: RevertSnapshot | null = null;
  private readonly acceptedProjectIds = new Set<string>();
  private acceptedInMemory = false;

  constructor(
    private readonly editorStore: EditorStore,
    private readonly captionedRanges: CaptionedRangeCollector,
    private readonly resultReader: PersonSegmentationResultReader,
    private readonly startAnalysis: StartBehindActorAnalysisAction,
    private readonly flowStore: PersonSegmentationFlowStore,
    private readonly refresh: RefreshDocumentAction,
    private readonly previewSupportChecker: BehindActorPreviewSupportChecker,
  ) {}

  start(): void {
    this.editorStore.addEventListener('change', this.onStoreChange);
    void this.evaluate();
  }

  stop(): void {
    this.editorStore.removeEventListener('change', this.onStoreChange);
  }

  /**
   * Restores the sheets, elementStyles and behindActorOverrides that
   * were live before the template swap that opened the last confirm.
   * No-op when the dialog was opened by anything other than a swap on
   * the current active sheet.
   */
  revertPending(): void {
    const revert = this.pendingRevert;
    this.pendingRevert = null;
    if (revert === null) return;
    this.editorStore.patch({
      sheets: revert.sheets,
      activeSheetId: revert.activeSheetId,
      elementStyles: revert.elementStyles,
      behindActorOverrides: revert.behindActorOverrides,
    });
    this.refresh.execute();
  }

  /**
   * Notes that the user has opted into scanning for the loaded project
   * and drops the pending revert. Called after the scan starts. The
   * note lives for the session; the persisted signal is that a run
   * left `analyzedRanges` on the record, which future evaluations
   * check as well.
   */
  noteAcceptance(): void {
    this.pendingRevert = null;
    const projectId = this.editorStore.snapshot().projectId;
    if (projectId === null) this.acceptedInMemory = true;
    else this.acceptedProjectIds.add(projectId);
  }

  private readonly onStoreChange = (): void => {
    void this.evaluate();
  };

  private async evaluate(): Promise<void> {
    const snap = this.editorStore.snapshot();
    const activeSheet = this.editorStore.activeSheet();
    const templateId = activeSheet?.template.metadata.id ?? null;
    const activeSheetId = snap.activeSheetId;

    const templateChanged = templateId !== this.lastEvaluatedTemplateId;
    const activeSheetChanged = activeSheetId !== this.lastEvaluatedActiveSheetId;
    const projectChanged = snap.projectId !== this.lastEvaluatedProjectId;
    if (!templateChanged && !activeSheetChanged && !projectChanged) return;
    this.lastEvaluatedProjectId = snap.projectId;
    const revision = ++this.evaluationRevision;

    // A dialog already up owns the pending revert; do not disturb it.
    if (this.flowStore.status.mode !== 'closed') {
      this.rememberSnapshot(snap);
      this.lastEvaluatedTemplateId = templateId;
      this.lastEvaluatedActiveSheetId = activeSheetId;
      return;
    }

    const isTemplateSwapOnSameActiveSheet =
      !activeSheetChanged && templateChanged && activeSheetId !== null;
    const previousSnapshot = this.lastEvaluatedSnapshot;

    this.lastEvaluatedTemplateId = templateId;
    this.lastEvaluatedActiveSheetId = activeSheetId;
    this.rememberSnapshot(snap);

    if (activeSheet === null) return;
    if (!activeSheet.template.behindActor.required) return;
    // A session playing the original has no canvas to composite on, so
    // the scan would spend minutes decoding for an effect that cannot
    // paint. The gallery already hides these templates; this covers
    // whatever route still arrives with one applied.
    if (!this.previewSupportChecker.isSupported()) return;

    // Nothing on screen means nothing the effect could composite, so
    // there is no scan to offer and no gap to report.
    if (this.captionedRanges.collect(snap.document, snap.sheets).isEmpty()) return;

    if (await this.userAlreadyOptedIn(snap.projectId)) return;
    // A slow cache read must not start work for an obsolete style or project.
    if (revision !== this.evaluationRevision || this.editorStore.snapshot().projectId !== snap.projectId) return;

    if (isTemplateSwapOnSameActiveSheet) {
      this.prepareSelectedTemplate(previousSnapshot);
      return;
    }
    this.startScanningSilently();
  }

  /** Keep style selection non-blocking, including the first actor template. */
  private prepareSelectedTemplate(previousSnapshot: RevertSnapshot | null): void {
    this.pendingRevert = previousSnapshot;
    this.startScanningSilently();
  }

  /**
   * Starts the scan without asking. Reached when the template was
   * already in place — a saved project loading, or an active-sheet
   * switch onto a behind-actor sheet — where a cancel would only
   * leave the template stuck without the analysis it needs.
   *
   * Acceptance is noted before the call so re-evaluations firing
   * during the head start's pending publish do not fire a second
   * start; the analyzer's own deduplication would swallow it, but
   * the automation should not lean on that.
   */
  private startScanningSilently(): void {
    this.noteAcceptance();
    void this.startAnalysis.execute().catch((error) => {
      console.error('[behind-actor] failed to start the scan for a template already in place', error);
    });
  }

  /**
   * Whether the user has already opted into scanning this project.
   *
   * Two independent signals answer the same question. This session's
   * acceptance flag stands for "the user just said yes and the
   * analyzer is on it", so a chunk still queued does not reopen the
   * dialog while the drain is running — the reported failure mode.
   * Any `analyzedRanges` on the persisted result stands for "a run
   * happened at some point", which survives a reload and covers the
   * case where the drain ran fully in a previous session. Mask
   * backfills leave `analyzedRanges` empty, so they never count.
   */
  private async userAlreadyOptedIn(projectId: string | null): Promise<boolean> {
    if (projectId === null ? this.acceptedInMemory : this.acceptedProjectIds.has(projectId)) return true;
    const known = await this.resultReader.read(projectId);
    return known !== null && !known.analyzedRanges.isEmpty();
  }

  private rememberSnapshot(snap: EditorState): void {
    this.lastEvaluatedSnapshot = {
      sheets: snap.sheets,
      activeSheetId: snap.activeSheetId,
      elementStyles: snap.elementStyles,
      behindActorOverrides: snap.behindActorOverrides,
    };
  }
}
