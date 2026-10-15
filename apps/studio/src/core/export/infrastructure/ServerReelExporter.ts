import { getSupabaseClient } from '@core/auth/infrastructure/SupabaseClient';
import { getRenderServerUrl } from '@core/transcription/infrastructure/ServerTranscriptionConfig';

export class ServerReelExporter {
  get enabled(): boolean { return !!getRenderServerUrl(); }
  async render(projectId: string, format: 'mp4' | 'webm', signal: AbortSignal): Promise<Blob> {
    const endpoint = getRenderServerUrl(), client = getSupabaseClient();
    if (!endpoint || !client) throw new Error('Server export requires a saved cloud project.');
    const { data, error } = await client.auth.refreshSession();
    if (error || !data.session) throw new Error('Sign in again before exporting.');
    const url = new URL(`${endpoint}/render`);
    url.searchParams.set('project_id', projectId);
    url.searchParams.set('output_format', format);
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(30 * 60 * 1000)]), credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error(`Server export failed (${response.status}). Retry or use device export.`);
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith('video/')) throw new Error('The server did not return a video.');
    return blob;
  }
}
