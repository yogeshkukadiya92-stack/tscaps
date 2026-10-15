import { describe, expect, it } from 'vitest';
import type { LocalStorageClient } from '@core/_shared/infrastructure/LocalStorageClient';
import { LocalStorageTranscribePreferenceRepository } from '@core/transcription/infrastructure/repositories/LocalStorageTranscribePreferenceRepository';

describe('Hinglish preference persistence', () => {
  function repository(value: unknown) {
    return new LocalStorageTranscribePreferenceRepository({ get: () => value } as unknown as LocalStorageClient);
  }
  it('uses accuracy-first defaults for a new browser', () => {
    expect(repository(null).load()).toEqual({ backend: 'wasm', model: 'large-v3-turbo', captionStyle: 'roman-hinglish' });
  });
  it('keeps an explicitly saved lighter model', () => {
    expect(repository({ backend: 'wasm', model: 'small', captionStyle: 'roman-hinglish' }).load().model).toBe('small');
  });
  it('upgrades the old Base default and enables Roman Hinglish', () => {
    expect(repository({ backend: 'wasm', model: 'base' }).load()).toEqual({ backend: 'wasm', model: 'large-v3-turbo', captionStyle: 'roman-hinglish' });
  });
  it('respects explicit model and script choices after migration', () => {
    expect(repository({ backend: 'webgpu', model: 'base', captionStyle: 'original' }).load()).toEqual({ backend: 'webgpu', model: 'base', captionStyle: 'original' });
  });
  it('preserves the Gujarati accuracy model and original script', () => {
    expect(repository({ backend: 'wasm', model: 'large-v3-turbo', captionStyle: 'original' }).load()).toEqual({ backend: 'wasm', model: 'large-v3-turbo', captionStyle: 'original' });
  });
  it('recovers from corrupt stored values', () => {
    expect(repository({ backend: 'invalid', model: 'invalid', captionStyle: 'invalid' }).load()).toEqual({ backend: 'wasm', model: 'large-v3-turbo', captionStyle: 'roman-hinglish' });
  });
});
