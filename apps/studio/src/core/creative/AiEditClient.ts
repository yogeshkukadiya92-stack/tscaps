import { getTranscriptionServerUrl } from '@core/transcription/infrastructure/ServerTranscriptionConfig';
import type { AutoEditOptions, AutoEditStyle } from '@core/creative/AutoEdit';
import { isReelPresetId, type ReelPresetId } from '@core/creative/ReelPresets';

export interface AiEditPlan {
  style: AutoEditStyle;
  preset: ReelPresetId | null;
  options: AutoEditOptions;
  summary: string;
  limitations: string[];
}
export function readAiEditPlan(value: unknown): AiEditPlan {
  const p = value as AiEditPlan | null;
  if (!p || !['clean', 'energetic', 'professional'].includes(p.style)
    || (p.preset !== null && !isReelPresetId(p.preset)) || !p.options
    || !['pauses', 'zooms', 'polish', 'captions'].every(k => typeof p.options[k as keyof AutoEditOptions] === 'boolean')
    || typeof p.summary !== 'string' || !p.summary.trim() || p.summary.length > 600
    || !Array.isArray(p.limitations) || p.limitations.length > 8 || p.limitations.some(s => typeof s !== 'string' || s.length > 300)) {
    throw new Error('AI returned an invalid edit plan. Your edits are unchanged. Please retry.');
  }
  return p;
}
export async function requestAiEdit(endpoint: string, token: string, payload: { prompt: string; transcript: string; duration: number; project_id: string; request_id: string; quality: 'standard' | 'high'; source_hash: string; max_credits: number }, signal: AbortSignal): Promise<AiEditPlan> {
  const response = await fetch(`${endpoint}/ai-edit`, {
    method: 'POST', credentials: 'omit', redirect: 'error', signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 402 ? 'Not enough AI credits. Buy credits below, then try again.'
      : response.status === 401 ? 'Your session expired. Sign in again to use AI editing.'
      : response.status === 429 ? 'Your daily AI edit limit is reached. Try again tomorrow.'
      : response.status === 503 ? 'AI editing is unavailable or not configured yet. Please retry later.'
      : 'AI could not create an edit plan. Your edits are unchanged. Please retry.';
    throw new Error(message);
  }
  return readAiEditPlan(data);
}

export interface AiEditQuote { duration: number; quality: 'standard' | 'high'; source_hash: string; credits: number; charge: number }
export async function requestAiQuote(endpoint: string, token: string, project: string, quality: 'standard' | 'high', signal: AbortSignal): Promise<AiEditQuote> {
  const url = new URL(`${endpoint}/ai-edit/quote`);
  url.searchParams.set('project_id', project); url.searchParams.set('quality', quality);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error('Finish uploading and saving this video, then retry the credit estimate.');
  const q = await response.json() as AiEditQuote;
  if (!Number.isFinite(q.duration) || q.duration <= 0 || q.duration > 1800 || q.quality !== quality
    || !Number.isInteger(q.credits) || q.credits < 1 || q.credits > 720 || ![0, q.credits].includes(q.charge)
    || !new RegExp(`^[a-f0-9]{64}:${quality}$`).test(q.source_hash)) throw new Error('Invalid credit estimate. Please retry.');
  return q;
}

export const getAiEditServerUrl = getTranscriptionServerUrl;
