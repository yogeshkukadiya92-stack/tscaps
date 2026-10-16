import { getSupabaseClient } from '@core/auth/infrastructure/SupabaseClient';
import { getTranscriptionServerUrl } from '@core/transcription/infrastructure/ServerTranscriptionConfig';
import { ServerTranscriber } from '@core/transcription/infrastructure/ServerTranscriber';
import type { EditorStore } from '@core/editor/store/EditorStore';
import type { LocalStorageTranscribePreferenceRepository } from '@core/transcription/infrastructure/repositories/LocalStorageTranscribePreferenceRepository';
import type { AudioDecoder } from '@tscaps/engine';
import { WHISPER_SAMPLE_RATE } from '@tscaps/engine';
import type { ConfigurableTranscriber } from '@core/transcription/domain/ConfigurableTranscriber';
import { WorkerTranscriber } from '@core/transcription/infrastructure/WorkerTranscriber';
import { WordOverlapClamper } from '@core/transcription/services/WordOverlapClamper';
import { HinglishRomanizer } from '@core/transcription/services/HinglishRomanizer';
import { RomanizeCaptionsAction } from '@core/transcription/actions/RomanizeCaptionsAction';
import { TranscribeAction } from '@core/transcription/actions/TranscribeAction';
import { UpdateTranscribePreferenceAction } from '@core/transcription/actions/UpdateTranscribePreferenceAction';
import { UntranscribedRegionsStore } from '@core/transcription/store/UntranscribedRegionsStore';
import { PreprocessingProgressStore } from '@core/preprocessing/store/PreprocessingProgressStore';
import type { WorkerErrorMonitor } from '@core/_shared/workers/WorkerErrorMonitor';
import type { TelemetryModule } from '@bootstrap/wiring/telemetry';
import type { AppNoticeChannel } from '@core/errors/services/AppNoticeChannel';
import type { AppErrorClassifier } from '@core/errors/services/AppErrorClassifier';
import type { AppErrorTelemetryDescriber } from '@core/errors/services/AppErrorTelemetryDescriber';
import type { StorageFootprintProbe } from '@core/_shared/infrastructure/StorageFootprintProbe';
import { SkippedCueBlocksStore } from '@core/transcription/store/SkippedCueBlocksStore';
import { ReadSubtitleFileAction } from '@core/transcription/actions/ReadSubtitleFileAction';
import { EngineSubtitleFileReader } from '@core/transcription/infrastructure/EngineSubtitleFileReader';
import { NonBlockingFailureReporter } from '@core/errors/services/NonBlockingFailureReporter';
import type { AudioModule } from '@bootstrap/wiring/audio';

export interface TranscriptionDependencies {
  readonly store: EditorStore;
  readonly preferenceRepository: LocalStorageTranscribePreferenceRepository;
  readonly audioDecoder: AudioDecoder;
  readonly progressStore: PreprocessingProgressStore;
  readonly workerErrorMonitor: WorkerErrorMonitor;
  readonly telemetry: TelemetryModule;
  readonly appNoticeChannel: AppNoticeChannel;
  readonly errorClassifier: AppErrorClassifier;
  readonly errorTelemetryDescriber: AppErrorTelemetryDescriber;
  readonly storageFootprintProbe: StorageFootprintProbe;
  readonly audio: AudioModule;
  /** External transcriber; when omitted, picks the surface default. */
  readonly transcriber?: ConfigurableTranscriber;
}

export type TranscriptionModule = ReturnType<typeof bootTranscription>;

/**
 * Boots the transcription feature: the concrete transcriber and the
 * actions that consume it. The progress store is owned by the
 * preprocessing module and passed in — transcription is one phase of
 * preprocessing, so the broader-scoped store lives there.
 */
export function bootTranscription(deps: TranscriptionDependencies) {
  const endpoint = getTranscriptionServerUrl();
  const transcriber = deps.transcriber ?? (endpoint ? new ServerTranscriber(endpoint, deps.audioDecoder, deps.progressStore, async () => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Sign in to use server transcription.');
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error('Sign in to use server transcription.');
    return data.session.access_token;
  }, undefined, async () => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Sign in to use server transcription.');
    const { data, error } = await client.auth.refreshSession();
    if (error || !data.session) throw new Error('Sign in to use server transcription.');
    return data.session.access_token;
  }) : buildLocalTranscriber(deps));

  const untranscribedRegionsStore = new UntranscribedRegionsStore();
  const skippedCueBlocksStore = new SkippedCueBlocksStore();
  const hinglishRomanizer = new HinglishRomanizer();

  return {
    serverProcessing: !!endpoint,
    untranscribedRegionsStore,
    skippedCueBlocksStore,
    actions: {
      romanize: new RomanizeCaptionsAction(deps.store, hinglishRomanizer),
      transcribe: new TranscribeAction(
        transcriber,
        deps.progressStore,
        new WordOverlapClamper(),
        untranscribedRegionsStore,
        deps.telemetry.telemetry,
      ),
      readSubtitleFile: new ReadSubtitleFileAction(
        new EngineSubtitleFileReader(skippedCueBlocksStore),
        deps.progressStore,
        new WordOverlapClamper(),
      ),
      updatePreference: new UpdateTranscribePreferenceAction(deps.store, deps.preferenceRepository),
    },
  };
}


function buildLocalTranscriber(deps: TranscriptionDependencies): ConfigurableTranscriber {
  const worker = new Worker(
    new URL('../../core/transcription/infrastructure/workers/whisperWorker.ts', import.meta.url),
    { type: 'module' },
  );
  deps.workerErrorMonitor.monitor(worker, 'whisper-worker');
  return new WorkerTranscriber(
    worker,
    deps.audioDecoder,
    WHISPER_SAMPLE_RATE,
    deps.progressStore,
    new NonBlockingFailureReporter(
      deps.telemetry.telemetry,
      deps.appNoticeChannel,
      deps.errorClassifier,
      deps.errorTelemetryDescriber,
      deps.storageFootprintProbe,
      'transcription_model_cache_failed',
    ),
    deps.telemetry.telemetry,
    deps.audio.services.peakFolder,
    deps.audio.services.waveformExtractor,
  );
}

