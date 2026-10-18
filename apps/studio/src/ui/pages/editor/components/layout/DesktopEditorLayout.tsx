import { useRef, useState, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelGroupHandle } from 'react-resizable-panels';
import { MonitorPlay, FolderOpen, SlidersHorizontal, AudioWaveform, Maximize2, Minimize2 } from 'lucide-react';
import { BTN_SECONDARY_SM } from '@ui/_shared/styles/buttons';
import { useObservedHeightPx } from '@ui/_shared/hooks/useObservedHeightPx';

interface DesktopEditorLayoutProps {
  videoBox: ReactNode;
  playbackControls: ReactNode;
  sidebar: ReactNode;
  library: ReactNode;
  timeline: ReactNode;
}

const panelClass = 'h-full min-h-0 min-w-0 flex flex-col overflow-hidden rounded-xl border border-edge-subtle bg-surface-1';
const headingClass = 'flex shrink-0 items-center gap-2 border-b border-edge-subtle px-3 py-2.5 text-xs font-semibold text-fg-secondary';

function ResizeHandle({ vertical = false }: { vertical?: boolean }) {
  return <PanelResizeHandle aria-label={vertical ? 'Resize timeline' : 'Resize workspace panels'} className={`group flex items-center justify-center ${vertical ? 'h-2 cursor-row-resize' : 'w-2 cursor-col-resize'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}>
    <span className={`${vertical ? 'h-0.5 w-10' : 'w-0.5 h-10'} rounded-full bg-edge-subtle group-hover:bg-accent group-data-[resize-handle-state=drag]:bg-accent`} />
  </PanelResizeHandle>;
}

/** Keep the preview visible beside the design controls and caption timeline. */
export function DesktopEditorLayout({ videoBox, playbackControls, sidebar, library, timeline }: DesktopEditorLayoutProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workspaceHeight = useObservedHeightPx(workspaceRef);
  // Reserve pixels for the heading, toolbar, ruler and a complete caption row.
  const timelineMinPercent = workspaceHeight > 0 ? Math.min(70, Math.ceil(220 / Math.max(1, workspaceHeight - 8) * 100)) : 40;
  const rowsRef = useRef<ImperativePanelGroupHandle>(null);
  const previousRows = useRef<number[]>([60, 40]);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  function toggleTimeline() {
    if (timelineExpanded) rowsRef.current?.setLayout(previousRows.current);
    else {
      previousRows.current = rowsRef.current?.getLayout() ?? [60, 40];
      rowsRef.current?.setLayout([0, 100]);
    }
  }
  const controlsRef = useRef<HTMLDivElement>(null);
  const controlsHeight = useObservedHeightPx(controlsRef);
  return (
    <PanelGroup direction="horizontal" autoSaveId="reelstudio:side-preview-v1" className="w-full flex-1 min-h-0">
      <Panel defaultSize={30} minSize={24} maxSize={45}>
        <section aria-label="Video preview" className={panelClass}>
          <h2 className={headingClass}><MonitorPlay size={15} />Preview<span className="ml-auto text-fg-muted font-normal">Click video to play</span></h2>
          <div className="flex-1 min-h-0 p-3">
            <div className="h-full flex flex-col items-center justify-center min-h-0 gap-3 [container-type:size]" style={{ ['--playback-controls-h' as string]: `${controlsHeight}px` }}>
              {videoBox}
              <div ref={controlsRef} className="w-full shrink-0">{playbackControls}</div>
            </div>
          </div>
        </section>
      </Panel>
      <ResizeHandle />
      <Panel defaultSize={70} minSize={55}>
        <div ref={workspaceRef} className="h-full min-h-0">
        <PanelGroup ref={rowsRef} direction="vertical" autoSaveId="reelstudio:caption-workspace-v3" onLayout={sizes => setTimelineExpanded(sizes[0] === 0)} className="w-full flex-1 min-h-0">
          <Panel defaultSize={60} minSize={25} collapsible collapsedSize={0}>
            <section aria-label="Design settings" className={panelClass}>
              <div className={headingClass}>
                <h2 className="m-0 flex items-center gap-2 text-xs"><SlidersHorizontal size={15} />Design & captions</h2>
                <details className="relative ml-auto">
                  <summary className="cursor-pointer flex items-center gap-1"><FolderOpen size={14} />Project info</summary>
                  <div className="absolute right-0 top-7 z-50 w-72 max-h-80 overflow-y-auto rounded-lg border border-edge-subtle bg-surface-1 p-3 shadow-lg">{library}</div>
                </details>
              </div>
              <div className="flex-1 min-h-0 p-2">{sidebar}</div>
            </section>
          </Panel>
          <ResizeHandle vertical />
          <Panel defaultSize={40} minSize={timelineMinPercent} maxSize={100}>
            <section aria-label="Project timeline" className={panelClass}>
              <div className={headingClass}>
                <h2 className="m-0 flex items-center gap-2 text-xs font-semibold"><AudioWaveform size={15} />Caption timeline</h2>
                <button type="button" className={`${BTN_SECONDARY_SM} ml-auto shrink-0`} aria-pressed={timelineExpanded} onClick={toggleTimeline}>
                  {timelineExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  {timelineExpanded ? 'Restore editor layout' : 'Expand caption timeline'}
                </button>
              </div>
              <div className="flex-1 min-h-0">{timeline}</div>
            </section>
          </Panel>
        </PanelGroup>
        </div>
      </Panel>
    </PanelGroup>
  );
}
