import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __REELSTUDIO_CONFIG__?: { supabaseUrl?: string; supabaseAnonKey?: string; emailEnabled?: boolean; billingEnabled?: boolean; transcriptionUrl?: string; renderUrl?: string };
  }
}

let client: SupabaseClient | null | undefined;
export function getSupabaseUrl(): string | null {
  return window.__REELSTUDIO_CONFIG__?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || null;
}
export function getSupabasePublicKey(): string | null {
  return window.__REELSTUDIO_CONFIG__?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || null;
}
export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return client = null;
  // Only a public anon/publishable key belongs in a browser bundle.
  if (key.startsWith('sb_secret_')) throw new Error('Use a public Supabase key, never a server secret.');
  if (key.split('.').length === 3) {
    const payload = JSON.parse(atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
    if (payload.role !== 'anon') throw new Error('The browser requires the Supabase anon key.');
  }
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'reelstudio-auth' } });
  return client;
}
