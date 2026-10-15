import { AppError } from '@core/errors/domain/AppError';
export class ServerTranscriptionFailedError extends AppError {
  readonly name = 'ServerTranscriptionFailedError';
  constructor(cause: unknown) { super('Server transcription failed', { cause }); }
}
