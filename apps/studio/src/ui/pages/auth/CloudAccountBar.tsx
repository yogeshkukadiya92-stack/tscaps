import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, LogOut } from 'lucide-react';
import { useCloudAuth } from '@bootstrap/CloudAuthContext';
import { useProjects } from '@ui/_shared/contexts/modules/ProjectsContext';
import { useAppRoutes } from '@ui/_shared/hooks/useAppRoutes';
import { BTN_SECONDARY_SM } from '@ui/_shared/styles/buttons';

export function CloudAccountBar() {
  const { client, session } = useCloudAuth();
  const projects = useProjects();
  const navigate = useNavigate();
  const routes = useAppRoutes();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!client || !session) return null;
  async function signOut() {
    if (!client) return;
    setPending(true); setError('');
    try {
      await projects.actions.save.execute();
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      navigate(routes.projectsList(), { replace: true });
    } catch { setError('Could not finish saving or sign out. Please try again.'); }
    finally { setPending(false); }
  }
  return <div className="shrink-0 px-5 lg:px-8 py-2 bg-surface-1 border-b border-edge-subtle text-xs text-fg-secondary flex items-center gap-3 flex-wrap">
    <Cloud size={15} className="text-accent" /><span>Account projects</span>
    <span className="ml-auto max-w-[180px] truncate">{session.user.email}</span>
    <button className={BTN_SECONDARY_SM} disabled={pending} onClick={() => void signOut()}><LogOut size={14} />{pending ? 'Saving…' : 'Sign out'}</button>
    {error && <p className="w-full text-danger m-0" role="alert">{error}</p>}
  </div>;
}
