import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useCloudAuth } from '@bootstrap/CloudAuthContext';
import { Wordmark } from '@ui/_shared/components/Wordmark/Wordmark';
import { BTN_PRIMARY, BTN_SECONDARY } from '@ui/_shared/styles/buttons';

type Mode = 'signin' | 'signup' | 'reset';
const INPUT = 'w-full rounded-md border border-edge-medium bg-surface-1 text-fg-primary p-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
export function AuthScreen({ initialError, recovering, onRecovered }: { initialError: string; recovering: boolean; onRecovered: () => void }) {
  const { client } = useCloudAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const title = recovering ? 'Set a new password' : mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome to ReelStudio';
  const redirect = `${window.location.origin}${import.meta.env.BASE_URL}projects`;

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!client || pending) return;
    setPending(true); setError(''); setNotice('');
    try {
      if ((mode === 'signup' || recovering) && password !== confirmation) throw new Error('The passwords do not match.');
      if (recovering) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        onRecovered();
      } else if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password,
          options: { emailRedirectTo: redirect, data: { display_name: name.trim() } } });
        if (error) throw error;
        if (!data.session) setNotice('Check your email to confirm your account, then sign in.');
      } else if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
        if (error) throw error;
        setNotice('If this email has an account, a password reset link will arrive shortly.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'); }
    finally { setPending(false); }
  }
  function switchMode(next: Mode) { setMode(next); setError(''); setNotice(''); setPassword(''); setConfirmation(''); }

  return <main className="min-h-dvh bg-surface-0 text-fg-primary flex flex-col">
    <header className="border-b border-edge-subtle px-6 py-5"><Wordmark size="md" /></header>
    <div className="flex-1 grid place-items-center px-5 py-10">
      <div className="w-full max-w-[420px] flex flex-col gap-6">
        <div><h1 className="text-3xl font-semibold tracking-tight m-0">{title}</h1>
          <p className="text-sm text-fg-secondary mt-3 leading-relaxed">{recovering || mode === 'reset' ? 'Get back to creating your next reel.' : 'Your reels, captions and edits — saved to your account, ready on any device.'}</p></div>
        {!recovering && mode !== 'reset' && <div className="grid grid-cols-2 rounded-md bg-surface-1 border border-edge-subtle p-1 gap-1">
          {(['signin', 'signup'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} disabled={pending}
            className={`rounded-sm p-2 text-sm ${mode === value ? 'bg-surface-3 text-accent font-semibold' : 'text-fg-muted'}`}
            onClick={() => switchMode(value)}>{value === 'signin' ? 'Sign in' : 'Sign up'}</button>)}
        </div>}
        <form onSubmit={event => void submit(event)} className="flex flex-col gap-4">
          {mode === 'signup' && !recovering && <label className="text-sm text-fg-secondary flex flex-col gap-2">Your name<input className={INPUT} autoComplete="name" maxLength={80} required value={name} onChange={e => setName(e.target.value)} disabled={pending} /></label>}
          {!recovering && <label className="text-sm text-fg-secondary flex flex-col gap-2">Email<input className={INPUT} type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} disabled={pending} /></label>}
          {(mode !== 'reset' || recovering) && <>
            <label className="text-sm text-fg-secondary flex flex-col gap-2">{recovering ? 'New password' : 'Password'}
              <div className="relative"><input className={`${INPUT} pr-12`} aria-label={recovering ? 'New password' : 'Password'} type={show ? 'text' : 'password'}
                autoComplete={mode === 'signup' || recovering ? 'new-password' : 'current-password'} minLength={mode === 'signup' || recovering ? 10 : 1} maxLength={128}
                required value={password} onChange={e => setPassword(e.target.value)} disabled={pending} />
                <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(v => !v)} className="absolute right-3 top-3 text-fg-muted">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </label>
            {(mode === 'signup' || recovering) && <label className="text-sm text-fg-secondary flex flex-col gap-2">Confirm password<input aria-label="Confirm password" className={INPUT} type={show ? 'text' : 'password'} autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={pending} />
              <span className="text-xs text-fg-muted">Use at least 10 characters.</span></label>}
          </>}
          {error && <p className="text-sm text-danger m-0" role="alert">{error}</p>}
          {notice && <p className="text-sm text-accent m-0" role="status">{notice}</p>}
          <button className={BTN_PRIMARY} type="submit" disabled={pending}>{pending ? 'Please wait…' : recovering ? 'Save new password' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}<ArrowRight size={16} /></button>
        </form>
        {!recovering && <button className={BTN_SECONDARY} disabled={pending} onClick={() => switchMode(mode === 'reset' ? 'signin' : 'reset')}>{mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}</button>}
        <p className="flex items-center justify-center gap-2 text-xs text-fg-muted m-0"><LockKeyhole size={14} />Your projects and source videos are private.</p>
      </div>
    </div>
  </main>;
}
