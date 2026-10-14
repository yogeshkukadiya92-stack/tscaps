import { useCallback, useEffect, useState } from 'react';
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
  const navigate = useNavigate();
  const projects = useProjects();
  const videos = useVideos();
  const theme = useTheme();
  const routes = useAppRoutes();
  const homeHref = useHref(routes.projectsList());
  const [mine, setMine] = useState<ProjectMetadata[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const isMobile = useIsMobileViewport();
  const [migrating, setMigrating] = useState(false);
  const [migrationNotice, setMigrationNotice] = useState('');
  const [trash, setTrash] = useState<{ id: string; name: string }[] | null>(null);
  const [trashPending, setTrashPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const all = await projects.actions.list.execute();
      setMine(all);
    } catch (cause) {
      setError(new ProjectListLoadFailedError({ cause }));
    }
  }, [projects]);

  useEffect(() => {
    let active = true;
    void projects.actions.list.execute().then(all => {
      if (active) setMine(all);
    }).catch(cause => {
      if (active) setError(new ProjectListLoadFailedError({ cause }));
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

  const handleNewProject = useCallback((file: File) => {
    videos.actions.load.execute(file);
    navigate(routes.editor());
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
      isLoading={mine === null}
      error={error}
      isMobileDevice={isMobile}
      homeHref={homeHref}
      title={projects.cloudEnabled ? 'Your projects' : 'Local projects'}
      subtitle={(n) => `${n} ${n === 1 ? 'project' : 'projects'} · ${projects.cloudEnabled ? 'saved to your account' : 'stored in this browser'}`}
      emptyTitle="Make your first project."
      emptyBody={projects.cloudEnabled ? 'Drop a video to start. Your source video, captions and saved edits stay in your private account.' : 'Drop a video anywhere on this page. Everything stays in this browser — export a .tscaps file to back up or move between devices.'}
      headerNote={projects.cloudEnabled ? <div className="flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          <button className={BTN_SECONDARY_SM} disabled={migrating} onClick={() => void importLocalProjects()}>{migrating ? 'Importing browser projects…' : 'Import projects from this browser'}</button>
          <button className={BTN_SECONDARY_SM} disabled={trashPending} onClick={() => void openTrash()}>{trash === null ? 'Recently deleted' : 'Close recently deleted'}</button>
        </div>
        {trash !== null && <div className="rounded-md border border-edge-subtle p-3 text-sm flex flex-col gap-2">
          {trash.length === 0 ? <span>No deleted projects.</span> : trash.map(entry => <div key={entry.id} className="flex items-center gap-3"><span className="truncate flex-1">{entry.name}</span><button className={BTN_SECONDARY_SM} disabled={trashPending} onClick={() => void restore(entry.id)}>Restore</button></div>)}
        </div>}
        {migrationNotice && <p className="text-xs text-fg-muted m-0" role="status">{migrationNotice}</p>}
      </div> : null}
      onNewProject={handleNewProject}
      onOpenProject={handleOpenProject}
      onDeleteProject={handleDeleteProject}
      onExportProject={handleExportProject}
      onImportProject={handleImportProject}
      theme={theme}
    />
    </>
  );
}
