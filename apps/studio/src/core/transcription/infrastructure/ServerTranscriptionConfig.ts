/** Public endpoint only. Access is authorized with the signed-in user's JWT. */
export function getTranscriptionServerUrl(): string | null {
  const value = window.__REELSTUDIO_CONFIG__?.transcriptionUrl || import.meta.env.VITE_TRANSCRIPTION_URL;
  if (!value) return null;
  const url = new URL(value, window.location.origin);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Transcription requires HTTPS.');
  }
  return url.href.replace(/\/$/, '');
}

export function getRenderServerUrl(): string | null {
  const value = window.__REELSTUDIO_CONFIG__?.renderUrl || import.meta.env.VITE_RENDER_URL;
  if (!value) return null;
  const url = new URL(value, window.location.origin);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Server export requires HTTPS.');
  return url.href.replace(/\/$/, '');
}
