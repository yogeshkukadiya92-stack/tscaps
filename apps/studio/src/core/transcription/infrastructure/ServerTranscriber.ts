import { Document, Line, Section, Segment, TimeFragment, Word, type AudioDecoder, type TranscriberOptions } from '@tscaps/engine';
import type { ConfigurableTranscriber } from '@core/transcription/domain/ConfigurableTranscriber';
import type { PreprocessingProgressStore } from '@core/preprocessing/store/PreprocessingProgressStore';
import { encodeTranscriptionAudio } from '@core/transcription/infrastructure/PcmWaveEncoder';
import { ServerTranscriptionFailedError } from '@core/transcription/domain/errors/ServerTranscriptionFailedError';

export class ServerTranscriber implements ConfigurableTranscriber {
  readonly initialPhase = 'audio-extract' as const;
  constructor(private readonly endpoint: string, private readonly decoder: AudioDecoder,
    private readonly progress: PreprocessingProgressStore, private readonly token: () => Promise<string>,
    private readonly request: typeof fetch = fetch) {}
  setConfig(): void { /* The server owns its warm model and compute settings. */ }
  async transcribe(source: Blob, options?: TranscriberOptions): Promise<Document> {
    try {
      const pcm = await this.decoder.decode(source, 16000, value => this.progress.setAudioExtractProgress(value));
      const audio = encodeTranscriptionAudio(pcm);
      this.progress.enterInferringPhase();
      const url = new URL(`${this.endpoint}/transcribe`);
      if (options?.language) url.searchParams.set('language', options.language);
      const response = await this.request(url, {
        method: 'POST', headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'audio/wav' },
        body: audio, signal: AbortSignal.timeout(15 * 60 * 1000), credentials: 'omit', redirect: 'error',
      });
      if (!response.ok) throw new Error(`Transcription server returned ${response.status}`);
      const data = await response.json() as { words?: unknown };
      if (!Array.isArray(data.words) || data.words.length > 100000) throw new Error('Invalid transcription response');
      const duration = pcm.length / 16000;
      let previousStart = 0;
      const words = data.words.map((item: unknown) => {
        const word = item as { text?: unknown; start?: unknown; end?: unknown } | null;
        if (!word || typeof word.text !== 'string' || !word.text.trim() || word.text.length > 500
          || typeof word.start !== 'number' || typeof word.end !== 'number'
          || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < previousStart
          || word.end < word.start || word.end > duration + 0.1) throw new Error('Invalid word timestamps');
        previousStart = word.start;
        return new Word({ text: word.text.trim(), time: new TimeFragment(word.start, Math.min(duration, word.end)) });
      });
      if (!words.length) throw new Error('No speech was recognized');
      this.progress.setInferringProgress(1);
      return new Document({ sections: [new Section({ kind: '', segments: [new Segment({ lines: [new Line({ words })] })] })] });
    } catch (cause) { throw new ServerTranscriptionFailedError(cause); }
  }
}
