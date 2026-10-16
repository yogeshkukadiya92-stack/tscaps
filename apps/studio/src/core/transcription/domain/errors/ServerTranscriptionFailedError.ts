import { AppError } from '@core/errors/domain/AppError';
export type ServerTranscriptionFailureReason = 'unknown' | 'session' | 'forbidden' | 'busy' | 'budget' | 'unavailable' | 'invalid-response' | 'no-speech' | 'too-long' | 'timeout' | 'network';
export class ServerTranscriptionFailedError extends AppError {
  readonly name = 'ServerTranscriptionFailedError';
  constructor(cause: unknown, readonly reason: ServerTranscriptionFailureReason = 'unknown', readonly status?: number) {
    super(`Server transcription failed (${reason}${status ? `, HTTP ${status}` : ''})`, { cause });
  }
}
