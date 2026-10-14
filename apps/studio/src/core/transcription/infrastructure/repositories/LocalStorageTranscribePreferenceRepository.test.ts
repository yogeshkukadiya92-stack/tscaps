import { describe, expect, it } from 'vitest';
import type { LocalStorageClient } from '@core/_shared/infrastructure/LocalStorageClient';
import { LocalStorageTranscribePreferenceRepository } from '@core/transcription/infrastructure/repositories/LocalStorageTranscribePreferenceRepository';

describe('Hinglish preference persistence', () => {
  function repository(value: unknown) {
    return new LocalStorageTranscribePreferenceRepository({ get: () => value } as unknown as LocalStorageClient);
  }
  it('upgrades the old Base default and enables Roman Hinglish', () => {
    expect(repository({ backend: 'wasm', model: 'base' }).load()).toEqual({ backend: 'wasm', model: 'small', captionStyle: 'roman-hinglish' });
  });
  it('respects explicit model and script choices after migration', () => {
    expect(repository({ backend: 'webgpu', model: 'base', captionStyle: 'original' }).load()).toEqual({ backend: 'webgpu', model: 'base', captionStyle: 'original' });
  });
  it('recovers from corrupt stored values', () => {
    expect(repository({ backend: 'invalid', model: 'invalid', captionStyle: 'invalid' }).load()).toEqual({ backend: 'wasm', model: 'small', captionStyle: 'roman-hinglish' });
  });
});
