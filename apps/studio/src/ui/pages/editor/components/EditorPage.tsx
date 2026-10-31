import { useState, useCallback, useSyncExternalStore, type ReactNode, type Ref } from 'react';
import type { EditorState } from '@core/editor/domain/EditorState';
import type { SheetCreationOption } from '@core/sheets/domain/SheetCreationOption';
import type { SubtitleOverlayController } from '@presentation/editor/controllers/SubtitleOverlayController';
import type { OverlayManipulationController } from '@presentation/editor/controllers/OverlayManipulationController';
import type { OverlaySelectionController } from '@presentation/editor/controllers/OverlaySelectionController';
import type { PlaybackTimeBinder } from '@presentation/editor/controllers/PlaybackTimeBinder';
import type { AppNoticeChannel } from '@core/errors/services/AppNoticeChannel';
import type { TemplateLibraryView } from '@core/templates/store/TemplateLibraryStore';
import { useTranslation, UiText } from '@ui/i18n/Locale';
import { useSheets } from '@ui/_shared/contexts/modules/SheetsContext';
import { useVideos } from '@ui/_shared/contexts/modules/VideosContext';
import { useEditorWorkspaceStore } from '@ui/pages/editor/contexts/EditorWorkspaceContext';
import { useCaptionsTabStore } from '@ui/pages/editor/contexts/CaptionsTabContext';
import { CaptionsPanel } from '@ui/pages/editor/components/sidebar/CaptionsPanel';
import { CreativeStudio } from '@ui/pages/editor/features/creative/CreativeStudio';
import { EditorToolbar, type SaveButtonStatus } from '@ui/pages/editor/components/EditorToolbar';
import { EditorToolFinder } from '@ui/pages/editor/components/EditorToolFinder';
import { VideoDropzone } from '@ui/pages/editor/components/video/VideoDropzone';
import { Toast } from '@ui/_shared/components/Toast/Toast';
import { LinkedSheetsPropagationToast } from '@ui/pages/editor/components/LinkedSheetsPropagationToast';
import { AppNoticeToast } from '@ui/pages/editor/components/AppNoticeToast';
import '@ui/pages/editor/components/EditorWorkspace.css';

interface EditorPageProps {
  state: EditorState;
  containerRef: Ref<HTMLDivElement>;
  library: TemplateLibraryView;
  overlayController: SubtitleOverlayController;
  manipulationController: OverlayManipulationController;
  selectionController: OverlaySelectionController;
  playbackTimeBinder: PlaybackTimeBinder;
  appNoticeChannel: AppNoticeChannel;
  toastOpen: boolean;
  postExportPrompt: ReactNode | null;
  exportDisabled: boolean;
  saveStatus: SaveButtonStatus;
  canSave: boolean;
  onSave: () => void;
  onDismissToast: () => void;
  onOpenExportSettings: () => void;
  onBack: () => void;
  onRenameProject: (name: string) => void;
  videoOverlay?: ReactNode;
  /** Persistent notice about the open project, laid out above the editor chrome. */
  banner?: ReactNode;
}

export function EditorPage({ state, containerRef, library, appNoticeChannel, toastOpen, postExportPrompt,
  exportDisabled, saveStatus, canSave, onSave, onDismissToast, onOpenExportSettings,
  onBack, onRenameProject, banner }: EditorPageProps) {
  const { t } = useTranslation();
  const sheets = useSheets(), videos = useVideos();
  const workspace = useEditorWorkspaceStore(), captionTabs = useCaptionsTabStore();
  const [draftPreviewActive, setDraftPreviewActive] = useState(false);
  const creativeTool = useSyncExternalStore(useCallback(listener => {
    workspace.addEventListener('change', listener);
    return () => workspace.removeEventListener('change', listener);
  }, [workspace]), () => workspace.activeCreativeTool);
  const activeSheet = state.sheets.find(sheet => sheet.id === state.activeSheetId) ?? null;
  const sheetCreationOptions = sheets.sheetCreationOptionFinder.find(state.document, state.sheets);
  const handleSetActiveSheet = (id: string) => sheets.actions.sheets.setActive.execute(id);
  const handleCreateSheetFromOption = (option: SheetCreationOption) => {
    if (option.kind === 'role') sheets.actions.sheets.createRole.execute(option.role);
    else sheets.actions.sheets.createSpeaker.execute(option.speakerId, option.name, option.position);
  };
  const captionsPanel = (sourceTime: number | null, playing: boolean) => (
    <CaptionsPanel
      sheets={state.sheets}
      activeSheet={activeSheet}
      templates={state.availableTemplates}
      library={library}
      document={state.document}
      activeSegmentId={sourceTime === null ? null : state.document?.getSegments().find(segment => sourceTime >= segment.time.start && sourceTime < segment.time.end)?.id ?? null}
      elementStyles={state.elementStyles}
      behindActorOverrides={state.behindActorOverrides}
      frozenSegments={state.frozenSegments}
      decorationOverrides={state.decorationOverrides}
      videoDuration={state.video.duration}
      isPlaying={playing}
      onSetActiveSheet={handleSetActiveSheet}
      onCreateSheet={(name) => sheets.actions.sheets.create.execute(name)}
      sheetCreationOptions={sheetCreationOptions}
      onCreateSheetFromOption={handleCreateSheetFromOption}
      onRenameSheet={(id, name) => sheets.actions.sheets.rename.execute(id, name)}
      onDeleteSheet={(id) => sheets.actions.sheets.delete.execute(id)}
      onCopyStylesFromSheet={(targetId, sourceId) => sheets.actions.sheets.copyStylesFromSheet.execute(targetId, sourceId)}
      onLinkSheet={(targetId, sourceId) => sheets.actions.sheets.link.execute(targetId, sourceId)}
      onUnlinkSheet={(id) => sheets.actions.sheets.unlink.execute(id)}
      onResetSheetToTemplateDefaults={(id) => sheets.actions.style.resetToTemplateDefaults.execute(id)}
    />
  );

  const chooseTool = (tool: string) => {
    if (tool === 'Captions') captionTabs.setActiveTab('transcript');
    if (tool === 'Style') captionTabs.setActiveTab('templates');
    workspace.setActiveCreativeTool(tool);
  };
  return <main className="editor-studio simple-editor flex flex-col h-full min-h-0">
    {!state.video.url && !state.video.preview ? <VideoDropzone onFile={file => videos.actions.load.execute(file)} /> :
      <div className={`flex flex-col flex-1 min-h-0 w-full ${!state.document ? 'hidden' : ''}`}>
        {banner}
        <EditorToolbar canUndo={state.canUndo && !draftPreviewActive} canRedo={state.canRedo && !draftPreviewActive}
          showExport={state.document !== null && state.sheets.length > 0}
          exportDisabled={exportDisabled || draftPreviewActive} onOpenExportSettings={onOpenExportSettings}
          projectName={state.projectName} canRename={state.projectId !== null} onRenameProject={onRenameProject}
          onBack={onBack} dirty={state.dirty} saveStatus={saveStatus} canSave={canSave && !draftPreviewActive} onSave={onSave} />
        <div className="simple-workflow">
          <p><UiText text="Add video → Edit captions → Choose style → Export" /></p>
          <EditorToolFinder disabled={!state.projectId} onCaption={tab => { captionTabs.setActiveTab(tab); workspace.setActiveCreativeTool(tab === 'transcript' ? 'Captions' : 'Style'); }} onCreative={chooseTool} />
        </div>
        {state.document && <CreativeStudio activeTool={creativeTool} onToolChange={chooseTool} state={state}
          onDraftPreviewChange={setDraftPreviewActive} captionControls={captionsPanel} />}
      </div>}
    <div ref={containerRef} data-preview-engine="composite" className="sr-only" aria-hidden="true" />
    {postExportPrompt && toastOpen ? postExportPrompt : <Toast open={toastOpen} position="top-center" tone="success"
      title={t('Export complete')} description={t('Your video was saved to disk.')} onDismiss={onDismissToast} />}
    <LinkedSheetsPropagationToast /><AppNoticeToast channel={appNoticeChannel} />
  </main>;
}
