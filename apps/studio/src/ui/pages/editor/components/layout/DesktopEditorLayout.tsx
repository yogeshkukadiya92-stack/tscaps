import { useRef, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { MonitorPlay, FolderOpen, SlidersHorizontal, AudioWaveform } from 'lucide-react';
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

/** A persistent three-pane workspace above a full-width, resizable timeline. */
export function DesktopEditorLayout({ videoBox, playbackControls, sidebar, library, timeline }: DesktopEditorLayoutProps) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const controlsHeight = useObservedHeightPx(controlsRef);
  return (
    <PanelGroup direction="vertical" autoSaveId="reelstudio:studio-rows-v1" className="w-full flex-1 min-h-0">
      <Panel defaultSize={67} minSize={40}>
        <PanelGroup direction="horizontal" autoSaveId="reelstudio:studio-columns-v1">
          <Panel defaultSize={20} minSize={17} maxSize={30}>
            <section aria-label="Project library" className={panelClass}>
              <h2 className={headingClass}><FolderOpen size={15} />Project</h2>
              <div className="flex-1 min-h-0 overflow-y-auto p-3">{library}</div>
            </section>
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={53} minSize={30}>
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
          <Panel defaultSize={27} minSize={23} maxSize={40}>
            <section aria-label="Design settings" className={panelClass}>
              <h2 className={headingClass}><SlidersHorizontal size={15} />Design & captions</h2>
              <div className="flex-1 min-h-0 p-2">{sidebar}</div>
            </section>
          </Panel>
        </PanelGroup>
      </Panel>
      <ResizeHandle vertical />
      <Panel defaultSize={33} minSize={22} maxSize={55}>
        <section aria-label="Project timeline" className={panelClass}>
          <h2 className={headingClass}><AudioWaveform size={15} />Timeline<span className="ml-auto font-normal text-fg-muted">Select a caption to adjust its timing</span></h2>
          <div className="flex-1 min-h-0">{timeline}</div>
        </section>
      </Panel>
    </PanelGroup>
  );
}
