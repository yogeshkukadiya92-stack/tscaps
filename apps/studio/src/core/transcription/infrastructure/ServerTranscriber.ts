import { Document, Line, Section, Segment, TimeFragment, Word, type AudioDecoder, type TranscriberOptions } from '@tscaps/engine';
import type { ConfigurableTranscriber } from '@core/transcription/domain/ConfigurableTranscriber';
import type { PreprocessingProgressStore } from '@core/preprocessing/store/PreprocessingProgressStore';
import { encodeTranscriptionAudio } from '@core/transcription/infrastructure/PcmWaveEncoder';
import { ServerTranscriptionFailedError } from '@core/transcription/domain/errors/ServerTranscriptionFailedError';

export class ServerTranscriber implements ConfigurableTranscriber {
  readonly initialPhase = 'audio-extract' as const;
  constructor(private readonly endpoint: string, private readonly decoder: AudioDecoder,
    private readonly progress: PreprocessingProgressStore, private readonly token: () => Promise<string>,
    private readonly request: typeof fetch = (...args) => globalThis.fetch(...args),
    private readonly refreshToken?: () => Promise<string>) {}
  setConfig(): void { /* The server owns its warm model and compute settings. */ }
  async transcribe(source: Blob, options?: TranscriberOptions): Promise<Document> {
    try {
      const pcm = await this.decoder.decode(source, 16000, value => this.progress.setAudioExtractProgress(value));
      const audio = encodeTranscriptionAudio(pcm);
      this.progress.enterInferringPhase();
      const url = new URL(`${this.endpoint}/transcribe`);
      if (options?.language) url.searchParams.set('language', options.language);
      const send = (token: string) => this.request(url, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav' },
        body: audio, signal: AbortSignal.timeout(15 * 60 * 1000), credentials: 'omit', redirect: 'error',
      });
      let response = await send(await this.token());
      // Authentication is checked before inference, so retrying a 401 cannot
      // duplicate paid processing. Never automatically retry provider failures.
      if (response.status === 401 && this.refreshToken) {
        let token: string;
        try { token = await this.refreshToken(); }
        catch (cause) { throw new ServerTranscriptionFailedError(cause, 'session', 401); }
        response = await send(token);
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: unknown } | null;
        const reason = response.status === 401 ? 'session' : response.status === 403 ? 'forbidden'
          : response.status === 413 ? 'too-long' : [408, 504, 524].includes(response.status) ? 'timeout'
          : response.status === 429 ? (body?.detail === 'Monthly transcription budget reached' ? 'budget' : 'busy')
          : body?.detail === 'Invalid GPU transcription response' ? 'invalid-response' : 'unavailable';
        throw new ServerTranscriptionFailedError(new Error(`Transcription server returned ${response.status}`), reason, response.status);
      }
      const data = await response.json().catch(() => null) as { words?: unknown } | null;
      if (!data || !Array.isArray(data.words) || data.words.length > 100000) throw new ServerTranscriptionFailedError(new Error('Invalid transcription response'), 'invalid-response');
      const duration = pcm.length / 16000;
      let previousStart = 0;
      const words = data.words.map((item: unknown) => {
        const word = item as { text?: unknown; start?: unknown; end?: unknown } | null;
        if (!word || typeof word.text !== 'string' || !word.text.trim() || word.text.length > 500
          || typeof word.start !== 'number' || typeof word.end !== 'number'
          || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.start < previousStart - 0.5
          || word.end < word.start || word.end > duration + 0.1) throw new ServerTranscriptionFailedError(new Error('Invalid word timestamps'), 'invalid-response');
        // Whisper can place a following word slightly before the preceding
        // word's start (overlapping speech/alignment jitter). Keep text order
        // and normalize bounded jitter instead of discarding the whole reel.
        const start = Math.min(duration, Math.max(previousStart, word.start));
        previousStart = start;
        return new Word({ text: word.text.trim(), time: new TimeFragment(start, Math.max(start, Math.min(duration, word.end))) });
      });
      if (!words.length) throw new ServerTranscriptionFailedError(new Error('No speech was recognized'), 'no-speech');
      this.progress.setInferringProgress(1);
      return new Document({ sections: [new Section({ kind: '', segments: [new Segment({ lines: [new Line({ words })] })] })] });
    } catch (cause) {
      if (cause instanceof ServerTranscriptionFailedError) throw cause;
      throw new ServerTranscriptionFailedError(cause,
        cause instanceof Error && cause.name === 'TimeoutError' ? 'timeout' : cause instanceof TypeError ? 'network' : 'unknown');
    }
  }
}
