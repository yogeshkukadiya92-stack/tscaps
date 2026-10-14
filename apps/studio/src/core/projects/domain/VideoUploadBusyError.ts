export class VideoUploadBusyError extends Error {
  constructor() { super('This upload is running in another tab. Close that tab before retrying here.'); }
}
