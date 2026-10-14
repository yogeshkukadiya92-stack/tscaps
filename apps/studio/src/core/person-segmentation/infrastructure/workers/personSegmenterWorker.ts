import { PersonSegmenterWorkerHost } from '@core/person-segmentation/infrastructure/workers/PersonSegmenterWorkerHost';
import { ModuleWorkerImportScriptsShim } from '@core/person-segmentation/infrastructure/workers/ModuleWorkerImportScriptsShim';
import { WorkerUncaughtErrorForwarder } from '@core/_shared/workers/WorkerUncaughtErrorForwarder';
import { CachedModelFileFetcher, CacheStorageModelFileCache, DirectModelFileFetcher, IndexedDbModelFileCache } from '@tscaps/engine';

new WorkerUncaughtErrorForwarder('person-segmenter-worker').install();

new ModuleWorkerImportScriptsShim().install();
const modelFiles = new CachedModelFileFetcher(
  new CacheStorageModelFileCache(
    (error) => console.warn('[person-segmenter] Model could not be kept for the next session', error),
    new IndexedDbModelFileCache(),
  ),
  new DirectModelFileFetcher(),
);
new PersonSegmenterWorkerHost(modelFiles).start();
