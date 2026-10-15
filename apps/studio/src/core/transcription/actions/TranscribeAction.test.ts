import { describe, expect, it, vi } from 'vitest';
import { Document, Line, Section, Segment, TimeFragment, Word } from '@tscaps/engine';
import { TranscribeAction } from '@core/transcription/actions/TranscribeAction';
import { DEFAULT_TRANSCRIBE_PREFERENCE } from '@core/transcription/domain/TranscribePreference';
import { WordOverlapClamper } from '@core/transcription/services/WordOverlapClamper';
import { UntranscribedRegionsStore } from '@core/transcription/store/UntranscribedRegionsStore';
import { PreprocessingProgressStore } from '@core/preprocessing/store/PreprocessingProgressStore';

describe('Hinglish transcription configuration', () => {
  function setup() {
    const words = [new Word({ text: 'आज', time: new TimeFragment(0, 0.4) }), new Word({ text: 'video', time: new TimeFragment(0.4, 1) })];
    const document = new Document({ sections: [new Section({ kind: 'main', segments: [new Segment({ lines: [new Line({ words })] })] })] });
    const transcriber = { setConfig: vi.fn(), transcribe: vi.fn().mockResolvedValue(document), initialPhase: 'inferring' as const };
    type Dependencies = ConstructorParameters<typeof TranscribeAction>;
    const action = new TranscribeAction(transcriber as unknown as Dependencies[0], new PreprocessingProgressStore(), new WordOverlapClamper(), new UntranscribedRegionsStore(), { capture: vi.fn() } as unknown as Dependencies[4]);
    return { action, transcriber, words };
  }
  it('selects the upgraded multilingual model, requests Hindi transcription, then romanizes without changing timing', async () => {
    const { action, transcriber, words } = setup();
    const document = await action.execute({} as File, DEFAULT_TRANSCRIBE_PREFERENCE, { language: 'en' }, 'en');
    expect(transcriber.setConfig).toHaveBeenCalledWith({ model: 'large-v3-turbo', device: 'wasm' });
    expect(transcriber.transcribe).toHaveBeenCalledWith({}, { language: 'hi' });
    expect(document.getWords().map(w => w.text)).toEqual(['aaj', 'video']);
    expect(document.getWords()[0]?.time).toEqual(words[0]?.time);
    expect(document.language).toBe('hi-Latn');
  });
  it('leaves other languages and original-script output unchanged', async () => {
    const { action, transcriber } = setup();
    const document = await action.execute({} as File, { backend: 'wasm', model: 'medium', captionStyle: 'original' }, { language: 'hi' }, 'hi');
    expect(transcriber.setConfig).toHaveBeenCalledWith({ model: 'medium', device: 'wasm' });
    expect(document.getWords()[0]?.text).toBe('आज');
    expect(document.language).toBe('hi');
  });
  it('rejects a placeholder-only result instead of replacing the existing transcript', async () => {
    const { action, transcriber } = setup();
    transcriber.transcribe.mockImplementation(async () => {
      (transcriber as unknown as { onUntranscribedRegion: (region: { startSeconds: number; endSeconds: number }) => void }).onUntranscribedRegion({ startSeconds: 0, endSeconds: 30 });
      return new Document({ sections: [] });
    });
    await expect(action.execute({} as File, DEFAULT_TRANSCRIBE_PREFERENCE)).rejects.toMatchObject({ name: 'LocalTranscriptionFailedError' });
  });

});
