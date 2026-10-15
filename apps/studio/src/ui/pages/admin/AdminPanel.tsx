import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCloudAuth } from '@bootstrap/CloudAuthContext';
import { useAppRoutes } from '@ui/_shared/hooks/useAppRoutes';
import { BTN_SECONDARY_SM } from '@ui/_shared/styles/buttons';

type Account = { id: string; email: string; display_name: string; created_at: string; last_sign_in_at: string | null; is_admin: boolean; total_count: number };
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : 'Never';

export function AdminPanel() {
  const { client, session } = useCloudAuth();
  const routes = useAppRoutes();
  const [users, setUsers] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    if (!client || !session) return;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true); setError(''); setUsers([]);
      try {
        const { data, error: cause } = await client.rpc('reelstudio_admin_users', { search, page_number: page });
        if (cause) throw cause;
        if (active) setUsers(data ?? []);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load users. Check admin access and database setup.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [client, session, search, page, refresh]);
  async function save() {
    if (!editing || !client || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: cause } = await client.rpc('reelstudio_admin_update_user', { target_id: editing.id, display_name: editing.display_name, make_admin: editing.is_admin });
      if (cause) throw cause;
      setEditing(null); setNotice('User updated successfully.'); setRefresh(value => value + 1);
    } catch { setError('Could not update this user. Check your access and try again.'); }
    finally { setSaving(false); }
  }
  return <main className="min-h-full bg-surface-0 text-fg-primary p-5 lg:p-10">
    <div className="max-w-6xl mx-auto space-y-6">
      <Link className="text-sm text-accent" to={routes.projectsList()}>← Back to projects</Link>
      <header><p className="text-accent text-xs uppercase tracking-widest">Administration</p><h1 className="text-3xl font-semibold mt-2">User management</h1><p className="text-fg-secondary mt-2">Find accounts, update names and manage administrator access.</p></header>
      {!client || !session ? <p role="alert">Sign in with a cloud administrator account to manage users.</p> : <>
        <form className="flex gap-3 flex-wrap" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(0); setRefresh(value => value + 1); }}>
          <input aria-label="Search users by name or email" placeholder="Search by name or email…" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} className="bg-surface-1 border border-edge-subtle rounded-lg p-3 flex-1 min-w-48" />
          <button className={BTN_SECONDARY_SM}>Search</button><button type="button" className={BTN_SECONDARY_SM} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
        </form>
        {error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status" className="text-accent">{notice}</p>}
        {loading ? <p role="status">Loading users…</p> : !error && <>
          <div className="rounded-xl border border-edge-subtle bg-surface-1 overflow-x-auto">
            <table className="w-full text-sm text-left"><caption className="text-left p-4 text-fg-secondary">{users[0]?.total_count ?? 0} matching accounts</caption><thead className="border-y border-edge-subtle text-fg-secondary"><tr>{['Account', 'Role', 'Joined', 'Last sign in', 'Actions'].map(label => <th key={label} className="p-4 font-medium">{label}</th>)}</tr></thead>
              <tbody>{users.map(user => <tr key={user.id} className="border-b border-edge-subtle"><td className="p-4"><p className="font-medium">{user.display_name || 'Unnamed user'}</p><p className="text-fg-secondary mt-1">{user.email}</p></td><td className="p-4">{user.is_admin ? 'Administrator' : 'Member'}</td><td className="p-4 whitespace-nowrap">{date(user.created_at)}</td><td className="p-4 whitespace-nowrap">{date(user.last_sign_in_at)}</td><td className="p-4">{user.id === session.user.id ? 'Your account' : <button className={BTN_SECONDARY_SM} onClick={() => { setEditing({ ...user }); setNotice(''); }}>Edit user</button>}</td></tr>)}</tbody>
            </table>{users.length === 0 && <p className="p-8 text-fg-secondary">No users found. Try another search.</p>}
          </div>
          <nav aria-label="User pages" className="flex items-center justify-between gap-3"><button className={BTN_SECONDARY_SM} disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span className="text-sm text-fg-secondary">Page {page + 1}</span><button className={BTN_SECONDARY_SM} disabled={(page + 1) * 25 >= Number(users[0]?.total_count ?? 0)} onClick={() => setPage(value => value + 1)}>Next</button></nav>
        </>}
        {editing && <section className="border border-edge-subtle bg-surface-1 rounded-xl p-5 space-y-4" aria-label="Edit user">
          <h2 className="text-lg font-semibold">Edit {editing.email}</h2>
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
            <label className="block">Display name<input autoFocus maxLength={100} value={editing.display_name} disabled={saving} onChange={event => setEditing({ ...editing, display_name: event.target.value })} className="block mt-2 w-full bg-surface-0 border border-edge-subtle rounded-lg p-3" /></label>
            <label className="flex items-center gap-3"><input type="checkbox" checked={editing.is_admin} disabled={saving} onChange={event => setEditing({ ...editing, is_admin: event.target.checked })} />Administrator access</label>
            <p className="text-sm text-fg-secondary">Administrators can view all accounts and manage other users’ administrator access.</p>
            <div className="flex gap-3"><button className={BTN_SECONDARY_SM} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button><button className={BTN_SECONDARY_SM} type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        </section>}
      </>}
    </div>
  </main>;
}
