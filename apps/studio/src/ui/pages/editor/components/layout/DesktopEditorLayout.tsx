import { UiText, useTranslation } from '@ui/i18n/Locale';
import { useRef, useState, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle, type ImperativePanelGroupHandle } from 'react-resizable-panels';
import { MonitorPlay, FolderOpen, SlidersHorizontal, AudioWaveform, Maximize2, Minimize2, Minus } from 'lucide-react';
import { BTN_SECONDARY_SM } from '@ui/_shared/styles/buttons';
import { useObservedHeightPx } from '@ui/_shared/hooks/useObservedHeightPx';

interface DesktopEditorLayoutProps {
  videoBox: ReactNode;
  playbackControls: ReactNode;
  sidebar: ReactNode;
  library: ReactNode;
  timeline: ReactNode;
}

const panelClass = 'editor-surface h-full min-h-0 min-w-0 flex flex-col overflow-hidden rounded-2xl border border-edge-subtle bg-surface-1';
const headingClass = 'flex shrink-0 items-center gap-2 px-4 py-3 text-xs font-semibold text-fg-secondary';

function ResizeHandle({ vertical = false }: { vertical?: boolean }) {
  const { t } = useTranslation();
  return <PanelResizeHandle aria-label={vertical ? t('Resize timeline') : t('Resize workspace panels')} className={`group flex items-center justify-center ${vertical ? 'h-3 cursor-row-resize' : 'w-4 cursor-col-resize'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}>
    <span className={`${vertical ? 'h-0.5 w-10' : 'w-0.5 h-10'} rounded-full bg-edge-subtle group-hover:bg-accent group-data-[resize-handle-state=drag]:bg-accent`} />
  </PanelResizeHandle>;
}

/** Styles and timeline on the left; the reel stays visible on the right. */
export function DesktopEditorLayout({ videoBox, playbackControls, sidebar, library, timeline }: DesktopEditorLayoutProps) {
  const { t } = useTranslation();
  const previewRef = useRef<ImperativePanelHandle>(null);
  const [previewMinimized, setPreviewMinimized] = useState(false);
  const [timelineMinimized, setTimelineMinimized] = useState(false);
  const rowsRef = useRef<ImperativePanelGroupHandle>(null);
  const previousRows = useRef<number[]>([64, 36]);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const rowsHost = useRef<HTMLDivElement>(null);
  const workspaceHeight = useObservedHeightPx(rowsHost);
  // Keep a complete timeline row available even on short laptop screens.
  const timelineMinimum = Math.min(55, Math.max(24, 220 / Math.max(1, (workspaceHeight || 700) - 12) * 100));
  const controlsHeight = useObservedHeightPx(controlsRef);
  function toggleTimeline() {
    if (timelineExpanded) rowsRef.current?.setLayout(previousRows.current);
    else {
      previousRows.current = rowsRef.current?.getLayout() ?? [64, 36];
      rowsRef.current?.setLayout([0, 100]);
    }
  }
  return (
    <div className="reference-editor flex flex-col flex-1 min-h-0 w-full">
      {(previewMinimized || timelineExpanded || timelineMinimized) && <div className="flex flex-wrap gap-2 pb-2" aria-label={t("Minimized panels")}>
        {previewMinimized && <button type="button" className={BTN_SECONDARY_SM} onClick={() => previewRef.current?.expand()}><UiText text="Restore Preview" /></button>}
        {timelineExpanded && <button type="button" className={BTN_SECONDARY_SM} onClick={toggleTimeline}><UiText text="Restore Design & captions" /></button>}
        {timelineMinimized && <button type="button" className={BTN_SECONDARY_SM} onClick={() => rowsRef.current?.setLayout(previousRows.current)}><UiText text="Restore Caption timeline" /></button>}
      </div>}
      <PanelGroup direction="horizontal" autoSaveId="reelstudio:preview-right-v1" className="w-full flex-1 min-h-0">
        <Panel defaultSize={68} minSize={48}>
          <div ref={rowsHost} className="h-full min-h-0" aria-label={t("Caption workspace panels")}>
            <PanelGroup ref={rowsRef} direction="vertical" autoSaveId="reelstudio:reference-rows-v1" onLayout={sizes => { setTimelineExpanded(sizes[0] === 0); setTimelineMinimized(sizes[1] === 0); }} className="w-full h-full min-h-0">
              <Panel defaultSize={64} minSize={35} collapsible collapsedSize={0}>
                <section aria-label={t("Design settings")} className={panelClass}>
                  <div className={headingClass}>
                    <h2 className="m-0 flex items-center gap-2 text-sm"><SlidersHorizontal size={16} className="text-accent" /><UiText text="Caption style" /></h2>
                    <details className="relative ml-auto">
                      <summary className="cursor-pointer flex items-center gap-1 text-fg-muted"><FolderOpen size={14} /><UiText text="Project info" /></summary>
                      <div className="absolute right-0 top-7 z-50 w-72 max-h-80 overflow-y-auto rounded-lg border border-edge-subtle bg-surface-1 p-3 shadow-lg">{library}</div>
                    </details>
                    <button type="button" className={BTN_SECONDARY_SM} aria-label={t("Minimize Design & captions")} onClick={() => { previousRows.current = timelineMinimized ? previousRows.current : rowsRef.current?.getLayout() ?? [64, 36]; rowsRef.current?.setLayout([0, 100]); }}><Minus size={14} /></button>
                  </div>
                  <div className="flex-1 min-h-0 px-3 pb-3">{sidebar}</div>
                </section>
              </Panel>
              <ResizeHandle vertical />
              <Panel defaultSize={36} minSize={timelineMinimum} maxSize={100} collapsible collapsedSize={0}>
                <section aria-label={t("Project timeline")} className={`${panelClass} editor-caption-timeline`}>
                  <div className={headingClass}>
                    <h2 className="m-0 flex items-center gap-2 text-xs"><AudioWaveform size={15} /><UiText text="Caption timeline" /></h2>
                    <button type="button" className={`${BTN_SECONDARY_SM} ml-auto`} aria-label={t("Minimize Caption timeline")} onClick={() => { previousRows.current = timelineExpanded ? previousRows.current : rowsRef.current?.getLayout() ?? [64, 36]; rowsRef.current?.setLayout([100, 0]); }}><Minus size={14} /></button>
                    <button type="button" className={BTN_SECONDARY_SM} aria-label={timelineExpanded ? t('Restore editor layout') : t('Expand caption timeline')} aria-pressed={timelineExpanded} onClick={toggleTimeline}>
                      {timelineExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">{timeline}</div>
                </section>
              </Panel>
            </PanelGroup>
          </div>
        </Panel>
        <ResizeHandle />
        <Panel ref={previewRef} defaultSize={32} minSize={26} maxSize={52} collapsible collapsedSize={0} onCollapse={() => setPreviewMinimized(true)} onExpand={() => setPreviewMinimized(false)}>
          <section aria-label={t("Video preview")} className={`${panelClass} editor-reel-preview`}>
            <div className={headingClass}>
              <h2 className="m-0 flex items-center gap-2 text-xs"><MonitorPlay size={15} /><UiText text="Your reel" /></h2>
              <button type="button" className={`${BTN_SECONDARY_SM} ml-auto`} aria-label={t("Minimize Preview")} onClick={() => previewRef.current?.collapse()}><Minus size={14} /></button>
            </div>
            <div className="flex-1 min-h-0 px-3 pb-3">
              <div className="h-full flex flex-col items-center justify-center min-h-0 gap-3 [container-type:size]" style={{ ['--playback-controls-h' as string]: `${controlsHeight}px` }}>
                {videoBox}
                <div ref={controlsRef} className="w-full shrink-0">{playbackControls}</div>
              </div>
            </div>
          </section>
        </Panel>
      </PanelGroup>
    </div>
  );
}
