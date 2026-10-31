import { describe, expect, it } from 'vitest';
import type { LocalStorageClient } from '@core/_shared/infrastructure/LocalStorageClient';
import { LocalStorageTranscribePreferenceRepository } from '@core/transcription/infrastructure/repositories/LocalStorageTranscribePreferenceRepository';

describe('Transcription preference persistence', () => {
  function repository(value: unknown) {
    return new LocalStorageTranscribePreferenceRepository({ get: () => value } as unknown as LocalStorageClient);
  }
  it('uses fast defaults for a new browser', () => {
    expect(repository(null).load()).toEqual({ backend: 'auto', model: 'small', captionStyle: 'original' });
  });
  it('keeps an explicitly saved lighter model', () => {
    expect(repository({ backend: 'wasm', model: 'small', captionStyle: 'roman-hinglish' }).load()).toEqual({ backend: 'wasm', model: 'small', captionStyle: 'roman-hinglish' });
  });
  it('upgrades the old Base default while preserving native script', () => {
    expect(repository({ backend: 'wasm', model: 'base' }).load()).toEqual({ backend: 'wasm', model: 'small', captionStyle: 'original' });
  });
  it('respects explicit model and script choices after migration', () => {
    expect(repository({ backend: 'webgpu', model: 'base', captionStyle: 'original' }).load()).toEqual({ backend: 'webgpu', model: 'base', captionStyle: 'original' });
  });
  it('preserves the Gujarati accuracy model and original script', () => {
    expect(repository({ backend: 'wasm', model: 'large-v3-turbo', captionStyle: 'original' }).load()).toEqual({ backend: 'wasm', model: 'large-v3-turbo', captionStyle: 'original' });
  });
  it('recovers from corrupt stored values', () => {
    expect(repository({ backend: 'invalid', model: 'invalid', captionStyle: 'invalid' }).load()).toEqual({ backend: 'auto', model: 'small', captionStyle: 'original' });
  });
  it('preserves automatic acceleration when saved', () => {
    expect(repository({ backend: 'auto', model: 'small', captionStyle: 'original' }).load()).toEqual({ backend: 'auto', model: 'small', captionStyle: 'original' });
  });

});
