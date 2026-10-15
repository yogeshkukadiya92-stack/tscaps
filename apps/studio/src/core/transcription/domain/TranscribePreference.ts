import type { WhisperDevice, WhisperModel } from '@tscaps/engine';

export type TranscribeBackend = Extract<WhisperDevice, 'auto' | 'wasm' | 'webgpu'>;
export type TranscribeModel = Extract<WhisperModel, 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'>;

/**
 * User-tunable transcription settings. `backend` chooses where Whisper
 * runs (automatic GPU selection with CPU fallback by default); `model` picks the
 * multilingual Whisper variant. The engine's distil-whisper variants are
 * deliberately not surfaced here — they are English-only and WASM-only,
 * so exposing them would require conditional UX rules.
 */
export interface TranscribePreference {
  readonly backend: TranscribeBackend;
  readonly model: TranscribeModel;
  readonly captionStyle?: 'roman-hinglish' | 'original';
}

export const DEFAULT_TRANSCRIBE_PREFERENCE: TranscribePreference = {
  backend: 'auto',
  model: 'small',
  captionStyle: 'roman-hinglish',
};
