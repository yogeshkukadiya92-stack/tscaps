import { UiText, useTranslation } from '@ui/i18n/Locale';
import { buildPhotoVideo, isReelPhoto } from '@core/creative/PhotoVideoBuilder';
import { useCallback, useEffect, useState, useRef } from 'react';
import { isAcceptedVideoFile } from '@ui/_shared/video/videoAcceptance';
import { useHref, useNavigate } from 'react-router-dom';
import type { AppError } from '@core/errors/domain/AppError';
import type { ProjectMetadata } from '@core/projects/domain/ProjectMetadata';
import { ProjectListLoadFailedError } from '@core/projects/domain/errors/ProjectListLoadFailedError';
import { ProjectDeleteFailedError } from '@core/projects/domain/errors/ProjectDeleteFailedError';
import { ProjectExportFailedError } from '@core/projects/domain/errors/ProjectExportFailedError';
import { ProjectImportFailedError } from '@core/projects/domain/errors/ProjectImportFailedError';
import { useProjects } from '@ui/_shared/contexts/modules/ProjectsContext';
import { useVideos } from '@ui/_shared/contexts/modules/VideosContext';
import { useAppRoutes } from '@ui/_shared/hooks/useAppRoutes';
import { useIsMobileViewport } from '@ui/_shared/hooks/useIsMobileViewport';
import { useTheme } from '@bootstrap/ThemeContext';
import { ProjectsListPage } from '@ui/pages/editor/features/projects/components/ProjectsListPage';
import { BTN_SECONDARY_SM } from '@ui/_shared/styles/buttons';

/**
 * Renders account projects, or IndexedDB when cloud storage is unconfigured. Offers import /
 * export of `.tscaps` files so projects can move between devices.
 */
export function ProjectsHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useProjects();
  const videos = useVideos();
  const theme = useTheme();
  const routes = useAppRoutes();
  const homeHref = useHref(routes.projectsList());
  const [mine, setMine] = useState<ProjectMetadata[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobileViewport();
  const [migrating, setMigrating] = useState(false);
  const [migrationNotice, setMigrationNotice] = useState('');
  const [trash, setTrash] = useState<{ id: string; name: string }[] | null>(null);
  const [trashPending, setTrashPending] = useState(false);
  const preparingRef = useRef(false);
  const [preparingMedia, setPreparingMedia] = useState(false);
  const [audioError, setAudioError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await projects.actions.list.execute();
      setMine(all);
    } catch (cause) {
      setError(new ProjectListLoadFailedError({ cause }));
    } finally {
      setLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    const store = projects.videoUploads?.store;
    if (!store) return;
    const completed = () => { void refresh(); };
    store.addEventListener('completed', completed);
    return () => store.removeEventListener('completed', completed);
  }, [projects, refresh]);

  useEffect(() => {
    let active = true;
    void projects.actions.list.execute().then(all => {
      if (active) setMine(all);
    }).catch(cause => {
      if (active) setError(new ProjectListLoadFailedError({ cause }));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projects]);

  async function openTrash() {
    if (!projects.cloudRepository) return;
    if (trash !== null) { setTrash(null); return; }
    setTrashPending(true); setError(null);
    try { setTrash(await projects.cloudRepository.listDeleted()); }
    catch (cause) { setError(new ProjectListLoadFailedError({ cause })); }
    finally { setTrashPending(false); }
  }
  async function restore(id: string) {
    if (!projects.cloudRepository) return;
    setTrashPending(true); setError(null);
    try {
      await projects.cloudRepository.restore(id);
      setTrash(await projects.cloudRepository.listDeleted());
      await refresh();
    } catch (cause) { setError(new ProjectListLoadFailedError({ cause })); }
    finally { setTrashPending(false); }
  }

  async function importLocalProjects() {
    setMigrating(true); setMigrationNotice(''); setError(null);
    try {
      const local = await projects.localRepository.list();
      let imported = 0;
      for (const entry of local) {
        if (await projects.repository.has(entry.id)) continue;
        const project = await projects.localRepository.load(entry.id);
        if (!project) continue;
        const video = await projects.localRepository.loadVideoBlob(entry.id);
        if (video.outcome === 'found') await projects.repository.cacheVideoBlob(entry.id, video.blob);
        await projects.repository.save(project); imported++;
      }
      setMigrationNotice(imported ? `${imported} projects imported into your account. Originals remain in this browser.` : 'No new browser projects to import.');
      await refresh();
    } catch (cause) { setError(new ProjectListLoadFailedError({ cause })); }
    finally { setMigrating(false); }
  }

  const handleNewProject = useCallback(async (file: File) => {
    if (preparingRef.current) return;
    setAudioError('');
    if (!isAcceptedVideoFile(file) && !isReelPhoto(file)) { setAudioError('Choose a video (MP4, WebM, MOV) or photo (JPG, PNG, WebP).'); return; }
    preparingRef.current = true; setPreparingMedia(true);
    try {
      videos.actions.load.execute(isReelPhoto(file) ? await buildPhotoVideo(file) : file);
      navigate(routes.editor());
    } catch (cause) { setAudioError(cause instanceof Error ? cause.message : 'Could not open this video file.'); }
    finally { preparingRef.current = false; setPreparingMedia(false); }
  }, [videos, navigate, routes]);

  const handleOpenProject = useCallback((id: string) => {
    navigate(routes.project(id));
  }, [navigate, routes]);

  const handleDeleteProject = useCallback(async (id: string) => {
    setError(null);
    try {
      await projects.actions.delete.execute(id);
      await refresh();
    } catch (cause) {
      setError(new ProjectDeleteFailedError({ cause }));
    }
  }, [projects, refresh]);

  const handleExportProject = useCallback(async (id: string) => {
    setError(null);
    try {
      await projects.actions.export.execute(id);
    } catch (cause) {
      setError(new ProjectExportFailedError({ cause }));
    }
  }, [projects]);

  const handleImportProject = useCallback(async (file: File) => {
    setError(null);
    try {
      const newId = await projects.actions.import.execute(file);
      await refresh();
      navigate(routes.project(newId));
    } catch (cause) {
      setError(new ProjectImportFailedError({ cause }));
    }
  }, [projects, refresh, navigate, routes]);

  return (
    <>
    <ProjectsListPage
      projects={mine}
      isLoading={loading}
      {...(error instanceof ProjectListLoadFailedError ? { onRetry: () => void refresh() } : {})}
      error={error}
      isMobileDevice={isMobile}
      homeHref={homeHref}
      title={projects.cloudEnabled ? t('Your projects') : t('Local projects')}
      subtitle={(n) => `${n} ${n === 1 ? 'project' : 'projects'} · Add video or photos with New project`}
      emptyTitle="Make your first project."
      emptyBody="Add a video or photo. Open Creative → Templates to build a reel with music and motion, or add captions to a talking video."
      headerNote={projects.cloudEnabled ? <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-muted m-0"><UiText text="Cloud videos are automatically removed 48 hours after upload. Download your finished reel before then. Caption edits remain saved; keep your original video to relink later." /></p>
        <div className="flex gap-2 flex-wrap">
          <button className={BTN_SECONDARY_SM} disabled={migrating} onClick={() => void importLocalProjects()}>{migrating ? t('Importing browser projects…') : t('Import projects from this browser')}</button>
          <button className={BTN_SECONDARY_SM} disabled={trashPending} onClick={() => void openTrash()}>{trash === null ? t('Recently deleted') : t('Close recently deleted')}</button>
        </div>
        {trash !== null && <div className="rounded-md border border-edge-subtle p-3 text-sm flex flex-col gap-2">
          {trash.length === 0 ? <span><UiText text="No deleted projects." /></span> : trash.map(entry => <div key={entry.id} className="flex items-center gap-3"><span className="truncate flex-1">{entry.name}</span><button className={BTN_SECONDARY_SM} disabled={trashPending} onClick={() => void restore(entry.id)}><UiText text="Restore" /></button></div>)}
        </div>}
        {migrationNotice && <p className="text-xs text-fg-muted m-0" role="status">{migrationNotice}</p>}
      </div> : null}
      onNewProject={handleNewProject}
      onNewProjectIntent={() => preparingRef.current}
      onOpenProject={handleOpenProject}
      onDeleteProject={handleDeleteProject}
      onExportProject={handleExportProject}
      onImportProject={handleImportProject}
      theme={theme}
    />
    {preparingMedia && <p role="status" className="fixed bottom-6 left-6 right-6 z-[1000] rounded-md bg-surface-1 border border-edge-medium p-4"><UiText text="Preparing your media…" /></p>}
    {audioError && <div className="fixed bottom-6 left-6 right-6 z-[1000] rounded-md bg-surface-1 border border-danger p-4" role="alert">{audioError}<button className={BTN_SECONDARY_SM} onClick={() => setAudioError('')}><UiText text="Dismiss" /></button></div>}
    </>
  );
}
