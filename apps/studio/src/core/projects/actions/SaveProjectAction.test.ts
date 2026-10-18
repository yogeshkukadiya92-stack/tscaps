import { describe, expect, it, vi } from 'vitest';
import { SaveProjectAction } from '@core/projects/actions/SaveProjectAction';
import { EditorStore } from '@core/editor/store/EditorStore';
import { ProjectFromEditorStateBuilder } from '@core/projects/services/ProjectFromEditorStateBuilder';
import type { ProjectSerializer } from '@core/projects/services/ProjectSerializer';
import type { ProjectRepository } from '@core/projects/domain/ProjectRepository';
import type { Project } from '@core/projects/domain/Project';

function setup(save: (project: Project) => Promise<void>) {
  const store = new EditorStore();
  store.patch({ projectId: 'test-project', projectCreatedAt: new Date(), projectName: 'First', dirty: true });
  store.patchVideo({ fileName: 'sample.mp4', mimeType: 'video/mp4', size: 12 });
  const action = new SaveProjectAction(store, { save } as ProjectRepository,
    new ProjectFromEditorStateBuilder(), { serialize: (project: Project) => ({ id: project.id, name: project.name }) } as unknown as ProjectSerializer);
  return { action, store };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('SaveProjectAction', () => {
  it('serializes overlapping saves so a slower old write cannot overwrite the latest edits', async () => {
    const first = deferred();
    let persisted = '';
    const save = vi.fn(async (project: Project) => {
      if (project.name === 'First') await first.promise;
      persisted = project.name;
    });
    const { action, store } = setup(save);
    const savingFirst = action.execute();
    await Promise.resolve();
    store.patch({ projectName: 'Second', dirty: true });
    const savingSecond = action.execute();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.all([savingFirst, savingSecond]);
    expect(persisted).toBe('Second');
    expect(store.snapshot().dirty).toBe(false);
  });

  it('keeps edits made after the requested save dirty', async () => {
    const write = deferred();
    const { action, store } = setup(() => write.promise);
    const saving = action.execute();
    store.patch({ projectName: 'Unsaved new edit', dirty: true });
    write.resolve();
    await saving;
    expect(store.snapshot().dirty).toBe(true);
  });

  it('does not skip a revert while a different version is still saving', async () => {
    const write = deferred();
    let persisted = '';
    const { action, store } = setup(async project => {
      if (project.name === 'Second') await write.promise;
      persisted = project.name;
    });
    await action.execute();
    store.patch({ projectName: 'Second', dirty: true });
    const second = action.execute();
    store.patch({ projectName: 'First', dirty: true });
    const reverted = action.execute();
    write.resolve();
    await Promise.all([second, reverted]);
    expect(persisted).toBe('First');
    expect(store.snapshot().dirty).toBe(false);
  });

  it('allows retry after a failed write and skips unchanged successful content', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
    const { action, store } = setup(save);
    await expect(action.execute()).rejects.toMatchObject({ name: 'ProjectSaveFailedError' });
    expect(store.snapshot().dirty).toBe(true);
    await action.execute();
    await action.execute();
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.snapshot().dirty).toBe(false);
  });
});
