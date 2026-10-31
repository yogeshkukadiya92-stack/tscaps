import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BTN_PRIMARY } from '@ui/_shared/styles/buttons';

/** Verification is a deliberate POST, so link previews cannot consume recovery tokens. */
export function RecoveryLinkScreen({ client, token, onVerified }: { client: SupabaseClient; token: string; onVerified: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function verify() {
    if (pending) return;
    setPending(true); setError('');
    try {
      const result = await client.auth.verifyOtp({ token_hash: token, type: 'recovery' });
      if (result.error) throw result.error;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      onVerified();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not verify this recovery link. Please try again.');
    } finally { setPending(false); }
  }
  return <main className="min-h-dvh grid place-items-center bg-surface-0 text-fg-primary p-6">
    <section className="w-full max-w-md flex flex-col gap-5 rounded-xl border border-edge-medium bg-surface-1 p-6">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p>Continue to verify your recovery link, then choose a new password.</p>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <button className={BTN_PRIMARY} disabled={pending} onClick={() => void verify()}>{pending ? 'Verifying…' : 'Continue to reset password'}</button>
    </section>
  </main>;
}
