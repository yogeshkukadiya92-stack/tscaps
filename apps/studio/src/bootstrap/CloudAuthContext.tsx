import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { PublicSite } from '@ui/pages/marketing/PublicSite';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@core/auth/infrastructure/SupabaseClient';
import type { AppModules } from '@bootstrap/AppModules';
import { AuthScreen } from '@ui/pages/auth/AuthScreen';

interface CloudAuthState { client: SupabaseClient | null; session: Session | null }
const CloudAuthContext = createContext<CloudAuthState>({ client: null, session: null });
export const useCloudAuth = () => useContext(CloudAuthContext);

export function CloudAuthGate({ modules, children }: { modules: AppModules; children: ReactNode }) {
  const location = useLocation();
  const publicPath = ['/', '/features', '/pricing', '/signin', '/signup'].includes(location.pathname);
  const authPath = ['/signin', '/signup'].includes(location.pathname);
  const [client] = useState(getSupabaseClient);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(client === null);
  const [error, setError] = useState('');
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    if (!client) return;
    let active = true;
    let resolvedByEvent = false;
    let accountId: string | null = null;
    const { data: listener } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      resolvedByEvent = true;
      // Account transitions destroy previous in-memory work before the next account renders.
      if (event === 'SIGNED_OUT' || (accountId && next?.user.id !== accountId)) {
        modules.projects.cloudRepository?.resetUploads();
        modules.editor.store.reset();
        // Navigation also destroys in-flight transcription and media pipelines from the old account.
        window.location.replace(`${import.meta.env.BASE_URL}projects`);
        return;
      }
      accountId = next?.user.id ?? null;
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(next); setReady(true);
    });
    void client.auth.getSession().then(({ data, error: cause }) => {
      if (!active || resolvedByEvent) return;
      if (cause) setError(cause.message);
      setSession(data.session); setReady(true);
    }).catch(() => { if (active) { setError('Could not restore your session. Please sign in again.'); setReady(true); } });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [client, modules.editor.store, modules.projects.cloudRepository]);

  return <CloudAuthContext.Provider value={{ client, session }}>
    {!ready ? <div className="h-dvh grid place-items-center bg-surface-0 text-fg-muted" role="status">Opening your account…</div>
       : recovering ? <AuthScreen initialError={error} recovering onRecovered={() => setRecovering(false)} />
      : publicPath ? (authPath && session ? <Navigate to={typeof location.state?.returnTo === 'string' && location.state.returnTo.startsWith('/') && !location.state.returnTo.startsWith('//') ? location.state.returnTo : modules.routing.routes.projectsList()} replace /> : <PublicSite initialError={error} />)
      : client && !session ? <Navigate to="/signin" state={{ returnTo: location.pathname + location.search }} replace />
      : <div className="contents" key={session?.user.id ?? 'local'}>{children}</div>}
  </CloudAuthContext.Provider>;
}
