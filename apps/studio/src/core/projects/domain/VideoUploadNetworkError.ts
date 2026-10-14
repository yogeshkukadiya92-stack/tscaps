export class VideoUploadNetworkError extends Error {
  constructor() { super('Connection lost. Upload will resume when you are online.'); }
}
