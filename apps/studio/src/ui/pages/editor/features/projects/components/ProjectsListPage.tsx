import { UiText, useTranslation } from '@ui/i18n/Locale';
import { BTN_PRIMARY, BTN_SECONDARY } from '@ui/_shared/styles/buttons';
import { memo, useRef, useState, type ReactNode } from 'react';
import { Plus, Upload, FolderOpen, Film, Search, LayoutGrid, List, ArrowUpRight, Captions, Scissors, X, Headphones, Phone, Mail } from 'lucide-react';
import type { AppError } from '@core/errors/domain/AppError';
import type { ProjectMetadata } from '@core/projects/domain/ProjectMetadata';
import type { ThemeController } from '@presentation/theme/controllers/ThemeController';
import { ThemeToggle } from '@ui/_shared/components/ThemeToggle/ThemeToggle';
import { Wordmark } from '@ui/_shared/components/Wordmark/Wordmark';
import { StatusPill } from '@ui/_shared/components/StatusPill/StatusPill';
import { AppErrorMessage, getAppErrorTitle } from '@ui/_shared/components/AppErrorMessage/AppErrorMessage';
import { ProjectCard } from '@ui/pages/editor/features/projects/components/ProjectCard';
import { ProjectsDropCatcher } from '@ui/pages/editor/features/projects/components/ProjectsDropCatcher';
import '@ui/pages/editor/features/projects/components/ProjectsWorkspace.css';
import { VIDEO_FILE_ACCEPT } from '@ui/_shared/video/videoAcceptance';

interface ProjectsListPageProps {
  projects: ProjectMetadata[] | null;
  isLoading: boolean;
  error: AppError | null;
  onRetry?: () => void;
  isMobileDevice: boolean;
  /** Destination for the wordmark click. */
  homeHref: string;
  title: string;
  subtitle: (count: number) => string;
  emptyTitle: string;
  emptyBody: string;
  /** Optional banner rendered between the page header and the project grid. */
  headerNote?: ReactNode;
  /** Optional discreet note rendered below the project grid. */
  footerNote?: ReactNode;
  /** Optional actions rendered in the top-right utility cluster, next to the theme toggle. */
  trailingChromeActions?: ReactNode;
  /**
   * Optional navigation rendered beside the page content on a wide
   * screen. Absent, the content takes the full width.
   */
  sideNav?: ReactNode;
  /** Mobile trigger for the same navigation, rendered in the app chrome. */
  mobileSideNav?: ReactNode;
  onNewProject: (file: File) => void;
  /**
   * Optional pre-flight check fired on "New project" click before the
   * file picker opens. Return `true` to indicate the click was handled
   * by the host and the picker should stay shut.
   */
  onNewProjectIntent?: () => boolean;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => Promise<void>;
  /** Optional — when present, an "Export" button on each card and an "Import .tscaps" header button appear. */
  onExportProject?: (id: string) => void;
  onImportProject?: (file: File) => void;
  theme: ThemeController;
}

const CHROME =
  'sticky top-0 z-30 bg-surface-0/85 backdrop-blur-sm border-b border-edge-subtle';
const CHROME_INNER =
  'relative max-w-[1280px] mx-auto w-full px-5 lg:px-8 h-16 flex items-center justify-between';
const UTILITY_CLUSTER = 'flex items-center gap-2';

const SHELL =
  'flex-1 max-w-[1280px] mx-auto w-full px-5 lg:px-8 py-10 lg:py-14 ' +
  'flex flex-col lg:flex-row gap-6 lg:gap-10';
const MAIN = 'flex-1 min-w-0 flex flex-col gap-8';

const PAGE_HEADER = 'flex items-end justify-between gap-4 flex-wrap';
const PAGE_TITLE = 'text-2xl lg:text-3xl font-semibold tracking-[-0.022em] text-fg-primary m-0';
const PAGE_SUBTITLE = 'text-sm text-fg-muted m-0 mt-1';

const ERROR_BANNER =
  'px-4 py-3 rounded-xs bg-danger/10 border border-danger/30 text-danger text-sm';

const EMPTY_STATE = 'flex flex-col items-center text-center py-20 lg:py-28 gap-3';
const EMPTY_TITLE =
  'text-2xl lg:text-3xl font-semibold tracking-[-0.022em] text-fg-primary m-0';
const EMPTY_SUB = 'text-sm text-fg-muted m-0 max-w-[42ch]';

/**
 * The shared "your projects" page. Renderer-only: it owns no
 * application state and emits no side effects beyond the file-input
 * click bridge and the page-wide drop listeners. Orchestration (which
 * list to fetch, which CTAs to expose, what banner to render) lives in
 * its host.
 *
 * A video dropped anywhere on the page takes the same route as the
 * "New project" button, `onNewProjectIntent` included. Hosts that pass
 * `onImportProject` also take a dropped `.tscaps` file.
 */
export const ProjectsListPage = memo(function ProjectsListPage({
  projects,
  isLoading,
  error,
  onRetry,
  isMobileDevice,
  homeHref,
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  headerNote,
  footerNote,
  trailingChromeActions,
  sideNav,
  mobileSideNav,
  onNewProject,
  onNewProjectIntent,
  onOpenProject,
  onDeleteProject,
  onExportProject,
  onImportProject,
  theme,
}: ProjectsListPageProps) {
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleNewClick = () => {
    if (onNewProjectIntent?.()) return;
    newInputRef.current?.click();
  };
  const handleImportClick = () => importInputRef.current?.click();

  const handleNewSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onNewProject(file);
    e.target.value = '';
  };

  const handleImportSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportProject) onImportProject(file);
    e.target.value = '';
  };

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const count = projects?.length ?? 0;
  const visibleProjects = (projects ?? []).filter(project => project.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.getTime() - a.updatedAt.getTime());

  return (
    <div className="projects-workspace min-h-full flex flex-col bg-surface-0">
      <header className={CHROME}>
        <div className={CHROME_INNER}>
          {mobileSideNav}
          <Wordmark
            href={homeHref}
            size="md"
            className={mobileSideNav ? 'absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0' : ''}
          />
          <div className={UTILITY_CLUSTER}>
            <ThemeToggle controller={theme} />
            {trailingChromeActions}
          </div>
        </div>
      </header>

      <div className={SHELL}>
        {sideNav ?? <aside className="workspace-sidebar" aria-label={t("Workspace")}>
          <span className="workspace-eyebrow"><UiText text="Workspace" /></span>
          <a className="workspace-nav-active" href={homeHref} aria-current="page"><FolderOpen size={17} /><UiText text=" All projects " /><span>{count}</span></a>
          <button className="workspace-nav" onClick={handleNewClick}><Plus size={17} /><UiText text=" Create project" /></button>
          {onImportProject && <button className="workspace-nav" onClick={handleImportClick}><Upload size={17} /><UiText text=" Import project" /></button>}
          <div className="workspace-sidebar-note"><Film size={20} /><strong><UiText text="Your next reel starts here." /></strong><p><UiText text="Bring your footage. Make the cut. Add your captions." /></p></div>
        </aside>}
        <main className={MAIN}>
          <div className={PAGE_HEADER}>
            <div className="min-w-0">
              <span className="workspace-eyebrow"><UiText text="Your creative workspace" /></span>
              <h1 className={PAGE_TITLE}><UiText text={title} /></h1>
              {count > 0 && <p className={PAGE_SUBTITLE}>{subtitle(count)}</p>}
            </div>
            <div className="workspace-page-actions flex items-center gap-2 min-w-0">
              {onImportProject && (
                <button type="button" className={BTN_SECONDARY} onClick={handleImportClick}>
                  <Upload size={14} />
                  <span><UiText text="Import .tscaps" /></span>
                </button>
              )}
              <button type="button" className={BTN_PRIMARY} onClick={handleNewClick}>
                <Plus size={14} />
                <span><UiText text="New project" /></span>
              </button>
              <input ref={newInputRef} type="file" accept={`${VIDEO_FILE_ACCEPT},image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp`} onChange={handleNewSelected} hidden />
              {onImportProject && (
                <input ref={importInputRef} type="file" accept=".tscaps,application/json" onChange={handleImportSelected} hidden />
              )}
            </div>
          </div>

          <section className="workspace-support" aria-label={t("Contact support")}>
            <strong><Headphones size={18} aria-hidden="true" /><UiText text="Contact support" /></strong>
            <a href="tel:+919825344428"><Phone size={16} aria-hidden="true" /><span>9825344428</span></a>
            <a href="mailto:yogeshkukadiya92@gmail.com"><Mail size={16} aria-hidden="true" /><span>yogeshkukadiya92@gmail.com</span></a>
          </section>

          <section className={`workspace-start ${count > 0 ? 'workspace-start--compact' : ''}`} aria-label={t("Start editing")}>
            <div className="workspace-start-copy"><span className="workspace-eyebrow"><UiText text="Your next reel" /></span><h2><UiText text="A great reel starts with your video." /></h2><p><UiText text="Upload a video. Check your captions. Pick a style. Export." /></p><button className={BTN_PRIMARY} onClick={handleNewClick}><Plus size={16} /><UiText text=" New project " /><ArrowUpRight size={16} /></button><span className="workspace-drop-hint"><UiText text="or drop a video file anywhere" /></span></div>
            <div className="workspace-film" aria-hidden="true"><div className="workspace-film-frame"><span><UiText text="YOUR STORY." /></span><strong><UiText text="IN MOTION." /></strong><span className="workspace-film-caption"><UiText text="Every word. Every frame." /></span></div><div className="workspace-film-track"><Scissors size={13} /><i /><i /><i /><Captions size={14} /></div></div>
          </section>
          <div className="workspace-library-header"><div><h2><UiText text="Project library " /><span>{count}</span></h2><p><UiText text="Pick up where you left off." /></p></div></div>
          <div className="workspace-toolbar">
            <label className="workspace-search"><Search size={16} /><input ref={searchInputRef} type="search" placeholder={t("Search projects…")} aria-label={t("Search projects")} value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" aria-label={t("Clear project search")} onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}><X size={16} /></button>}</label>
            <select aria-label={t("Sort projects")} value={sort} onChange={e => setSort(e.target.value)}><option value="recent"><UiText text="Last edited" /></option><option value="name"><UiText text="Name A–Z" /></option></select>
            <div className="workspace-view"><button aria-label={t("Grid view")} aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={17} /></button><button aria-label={t("List view")} aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button></div>
          </div>
          {headerNote && <div className="workspace-library-actions">{headerNote}</div>}

          {error && (
            <div role="alert" className={ERROR_BANNER}>
              <p className="font-semibold m-0 mb-1">{getAppErrorTitle(error)}</p>
              <div className="text-fg-secondary">
                <AppErrorMessage error={error} isMobile={isMobileDevice} />
              </div>
              {onRetry && <button type="button" className={`${BTN_SECONDARY} mt-3`} disabled={isLoading} onClick={onRetry}><UiText text="Try again" /></button>}
            </div>
          )}

          {isLoading ? (
            <div className={EMPTY_STATE}>
              <StatusPill label={t("Loading projects")} tone="info" active />
            </div>
          ) : count > 0 ? (
            <div className={`workspace-projects workspace-projects--${view}`}>
              {visibleProjects.length === 0 && <p className="workspace-no-results" role="status"><UiText text="No projects match “" />{query}<UiText text="”. Try another name." /></p>}
              {visibleProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onOpen={onOpenProject}
                  onDelete={onDeleteProject}
                  {...(onExportProject ? { onExport: onExportProject } : {})}
                />
              ))}
            </div>
          ) : !error ? (
            <div className={EMPTY_STATE}>
              <FolderOpen size={32} className="text-accent" />
              <h2 className={EMPTY_TITLE}>{emptyTitle}</h2>
              <p className={EMPTY_SUB}>{emptyBody}</p>
            </div>
          ) : null}

          {footerNote}
        </main>
      </div>

      <ProjectsDropCatcher
        onVideo={onNewProject}
        {...(onNewProjectIntent ? { onVideoIntent: onNewProjectIntent } : {})}
        {...(onImportProject ? { onProjectFile: onImportProject } : {})}
      />
    </div>
  );
});
