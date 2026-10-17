import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCloudAuth } from '@bootstrap/CloudAuthContext';
import { useAppRoutes } from '@ui/_shared/hooks/useAppRoutes';
import { BTN_SECONDARY_SM } from '@ui/_shared/styles/buttons';

type Account = {
  id: string; email: string; display_name: string; created_at: string; last_sign_in_at: string | null; is_admin: boolean;
  projects: number; deleted_projects: number; captioned_projects: number; video_seconds: number;
  stored_videos: number; storage_bytes: number; exports: number; export_failures: number; processed_videos: number; transcriptions: number;
  last_active_at: string | null; cloud_enabled: boolean; project_limit: number | null; storage_limit_bytes: number | null;
  credit_balance: number | null; billing: { trial_ends_at: string; paid_until: string | null; subscription_status: string | null } | null;
};
type Audit = { created_at: string; actor: string; target: string; details: { reason: string; credit_delta: number; after: { cloud_enabled: boolean; project_limit: number | null; storage_limit_bytes: number | null } } };
type Report = { users: Account[]; total_count: number; summary: { users: number; projects: number; storage_bytes: number; active_users: number; exports: number }; credits_available: boolean; billing_available: boolean; server_now: string; audit: Audit[] };
const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'No activity';
const bytes = (value: number) => value >= 1073741824 ? `${(value / 1073741824).toFixed(2)} GB` : `${(value / 1048576).toFixed(1)} MB`;
const field = 'block mt-2 w-full bg-surface-0 border border-edge-subtle rounded-lg p-3';
const box = 'border border-edge-subtle bg-surface-1 rounded-xl p-5';
const message = (cause: unknown) => typeof cause === 'object' && cause !== null && 'message' in cause ? String(cause.message) : 'Could not load administration. Please retry.';
function subscription(user: Account, now: string) {
  if (user.is_admin) return 'Administrator';
  if (!user.billing) return 'Not configured';
  if (user.billing.paid_until && Date.parse(user.billing.paid_until) > Date.parse(now)) return 'Paid';
  return Date.parse(user.billing.trial_ends_at) > Date.parse(now) ? 'Free trial' : 'Expired';
}

export function AdminPanel() {
  const { client, session } = useCloudAuth();
  const routes = useAppRoutes();
  const [report, setReport] = useState<Report | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState('joined');
  const [filter, setFilter] = useState('all');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Account | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [limits, setLimits] = useState({ cloud: true, projects: '', storage: '', credits: '0', reason: '' });
  const [confirm, setConfirm] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  useEffect(() => {
    let active = true;
    if (!client || !session) return;
    setLoading(true); setError('');
    void (async () => {
      try {
        const { data, error: cause } = await client.rpc('reelstudio_admin_usage', { search, page_number: page, sort_by: sort, account_filter: filter });
        if (cause) throw cause;
        if (active) setReport(data as Report);
      } catch (cause) { if (active) setError(message(cause)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [client, session, search, page, refresh, sort, filter]);
  const users = report?.users ?? [];
  const current = users.find(user => user.id === selected);
  function select(user: Account) {
    setSelected(user.id); setConfirm(false); setSettingsError(''); setNotice('');
    setLimits({ cloud: user.cloud_enabled, projects: user.project_limit?.toString() ?? '', storage: user.storage_limit_bytes === null ? '' : String(user.storage_limit_bytes / 1048576), credits: '0', reason: '' });
  }
  async function saveRole() {
    if (!editing || !client || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: cause } = await client.rpc('reelstudio_admin_update_user', { target_id: editing.id, display_name: editing.display_name, make_admin: editing.is_admin });
      if (cause) throw cause;
      setEditing(null); setNotice('User updated successfully.'); setRefresh(value => value + 1);
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); }
  }
  async function saveLimits() {
    if (!current || !client || saving) return;
    setSaving(true); setSettingsError('');
    try {
      const { error: cause } = await client.rpc('reelstudio_admin_save_limits', {
        target_id: current.id, cloud_enabled: limits.cloud,
        project_limit: limits.projects === '' ? null : Number(limits.projects),
        storage_limit_bytes: limits.storage === '' ? null : Math.round(Number(limits.storage) * 1048576),
        credit_delta: Number(limits.credits), reason: limits.reason.trim(),
      });
      if (cause) throw cause;
      setNotice('Limits and credits updated. The change is recorded in the admin history.');
      setConfirm(false); setSelected(null); setRefresh(value => value + 1);
    } catch (cause) { setSettingsError(message(cause)); setConfirm(false); }
    finally { setSaving(false); }
  }
  return <main className="min-h-full bg-surface-0 text-fg-primary p-4 sm:p-5 lg:p-10">
    <div className="max-w-7xl mx-auto space-y-6 min-w-0">
      <Link className="text-sm text-accent" to={routes.projectsList()}>← Back to projects</Link>
      <header><p className="text-accent text-xs uppercase tracking-widest">Administration</p><h1 className="text-3xl font-semibold mt-2">User management</h1><p className="text-fg-secondary mt-2">See account usage, manage access and set cloud limits.</p></header>
      {!client || !session ? <p role="alert">Sign in with a cloud administrator account to manage users.</p> : <>
        {report && !error && <section aria-label="Workspace usage" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[[report.summary.users, 'Total accounts'], [report.summary.active_users, 'Active in 7 days'], [report.summary.projects, 'Saved projects'], [bytes(report.summary.storage_bytes), 'Cloud video storage'], [report.summary.exports, 'Reported exports']].map(([value, label]) => <div key={label} className={box}><p className="text-xs text-fg-secondary">{label}</p><p className="text-2xl font-semibold mt-2">{value}</p></div>)}
        </section>}
        <form className="flex gap-3 flex-wrap items-end" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(0); setSelected(null); setRefresh(value => value + 1); }}>
          <label className="flex-1 min-w-40 text-sm">Find an account<input aria-label="Search users by name or email" placeholder="Search by name or email…" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} className={field} /></label>
          <label className="text-sm">Show<select aria-label="Filter accounts" className={field} value={filter} onChange={event => { setFilter(event.target.value); setPage(0); setSelected(null); }}><option value="all">All accounts</option><option value="active">Active in 7 days</option><option value="admins">Administrators</option><option value="paused">Cloud saving paused</option></select></label>
          <label className="text-sm">Sort by<select aria-label="Sort accounts" className={field} value={sort} onChange={event => { setSort(event.target.value); setPage(0); setSelected(null); }}><option value="joined">Newest accounts</option><option value="activity">Recent activity</option><option value="projects">Most projects</option><option value="storage">Most storage</option></select></label>
          <button className={BTN_SECONDARY_SM}>Search</button><button type="button" className={BTN_SECONDARY_SM} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
        </form>
        {error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status" className="text-accent">{notice}</p>}
        {loading ? <p role="status">Loading users…</p> : !error && report && <>
          <p className="text-xs text-fg-secondary">Project counts and source minutes reflect currently saved projects. Storage counts files still in the cloud, including recently deleted projects. Export, processing and transcription counters are browser reports collected from this rollout; earlier activity and offline reports are not included. Last activity uses sign-in, project saves and reported events. Updated {date(report.server_now)}.</p>
          <div className="rounded-xl border border-edge-subtle bg-surface-1 overflow-x-auto">
            <table className="w-full text-sm text-left"><caption className="text-left p-4 text-fg-secondary">{report.total_count} matching accounts</caption><thead className="border-y border-edge-subtle text-fg-secondary"><tr>{['Account', 'Access / plan', 'Projects', 'Source minutes', 'Storage', 'Exports', 'Last activity', 'Actions'].map(label => <th key={label} className="p-4 font-medium whitespace-nowrap">{label}</th>)}</tr></thead>
              <tbody>{users.map(user => <tr key={user.id} className="border-b border-edge-subtle"><td className="p-4"><p className="font-medium">{user.display_name || 'Unnamed user'}</p><p className="text-fg-secondary mt-1 [overflow-wrap:anywhere] min-w-40">{user.email}</p></td><td className="p-4"><p>{subscription(user, report.server_now)}</p><p className="text-xs text-fg-secondary mt-1">{user.cloud_enabled ? 'Cloud saving enabled' : 'Cloud saving paused'}</p></td><td className="p-4">{user.projects}{user.project_limit !== null && ` / ${user.project_limit}`}</td><td className="p-4">{(Number(user.video_seconds) / 60).toFixed(1)}</td><td className="p-4 whitespace-nowrap">{bytes(Number(user.storage_bytes))}{user.storage_limit_bytes !== null && <p className="text-xs text-fg-secondary">of {bytes(user.storage_limit_bytes)}</p>}</td><td className="p-4">{user.exports}</td><td className="p-4 whitespace-nowrap">{date(user.last_active_at)}</td><td className="p-4 space-y-2"><button className={BTN_SECONDARY_SM} onClick={() => select(user)}>Usage &amp; limits</button>{user.id !== session.user.id && <button className={BTN_SECONDARY_SM} onClick={() => { setEditing({ ...user }); setNotice(''); }}>Edit user</button>}</td></tr>)}</tbody>
            </table>{users.length === 0 && <p className="p-8 text-fg-secondary">No users found. Try another search.</p>}
          </div>
          <nav aria-label="User pages" className="flex items-center justify-between gap-3"><button className={BTN_SECONDARY_SM} disabled={page === 0} onClick={() => { setPage(value => value - 1); setSelected(null); }}>Previous</button><span className="text-sm text-fg-secondary">Page {page + 1}</span><button className={BTN_SECONDARY_SM} disabled={(page + 1) * 25 >= report.total_count} onClick={() => { setPage(value => value + 1); setSelected(null); }}>Next</button></nav>
          {current && <section aria-label="Account usage and limits" className={`${box} space-y-5`}>
            <div className="flex gap-3 justify-between"><div className="min-w-0"><h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{current.email}</h2><p className="text-sm text-fg-secondary mt-2">Joined {date(current.created_at)} · Last sign in {date(current.last_sign_in_at)}</p></div><button className={BTN_SECONDARY_SM} onClick={() => setSelected(null)}>Close</button></div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">{[['Captioned projects', current.captioned_projects], ['Recently deleted projects', current.deleted_projects], ['Stored videos', current.stored_videos], ['Processed videos', current.processed_videos], ['Transcriptions', current.transcriptions], ['Reported exports', current.exports], ['Failed exports', current.export_failures], ['AI credits remaining', report.credits_available ? current.credit_balance ?? 0 : 'Not configured']].map(([label, value]) => <div key={label}><dt className="text-fg-secondary">{label}</dt><dd className="font-semibold mt-1">{value}</dd></div>)}</dl>
            <div className="text-sm"><h3 className="font-medium">Subscription</h3><p className="text-fg-secondary mt-1">{subscription(current, report.server_now)}{current.billing && ` · Trial ends ${date(current.billing.trial_ends_at)} · Paid until ${date(current.billing.paid_until)} · Provider status: ${current.billing.subscription_status ?? 'No subscription'}`}</p><p className="text-xs text-fg-secondary mt-1">Subscription payments and cancellations remain in the payment provider. Cloud limits below do not change or cancel a subscription.</p></div>
            {current.id === session.user.id ? <p className="text-sm text-fg-secondary">Your account is protected from self-editing. Another administrator must change its limits.</p> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); setConfirm(true); }}>
              <h3 className="font-semibold">Account controls</h3><p className="text-sm text-fg-secondary">Limits apply to future cloud uploads and project creation. Pausing cloud saving blocks new uploads and saves; it keeps reading, downloads and deletion available. It does not block local editing or sign-in.</p>
              <fieldset disabled={saving || confirm} className="space-y-4">
                <label className="flex gap-3 items-center"><input type="checkbox" checked={limits.cloud} onChange={event => setLimits({ ...limits, cloud: event.target.checked })} />Allow cloud saving</label>
                <div className="grid sm:grid-cols-3 gap-4"><label className="text-sm">Project limit<input type="number" min="0" max="100000" step="1" placeholder="Unlimited" className={field} value={limits.projects} onChange={event => setLimits({ ...limits, projects: event.target.value })} /></label><label className="text-sm">Storage limit (MB)<input type="number" min="0" max="10485760" step="any" placeholder="Unlimited" className={field} value={limits.storage} onChange={event => setLimits({ ...limits, storage: event.target.value })} /></label>{report.credits_available && <label className="text-sm">Adjust AI credits (+ / −)<input type="number" min="-100000" max="100000" step="1" required className={field} value={limits.credits} onChange={event => setLimits({ ...limits, credits: event.target.value })} /></label>}</div>
                <p className="text-xs text-fg-secondary">Leave limits blank for unlimited. Zero prevents new usage. Existing projects and files are preserved.</p>
                <label className="block text-sm">Reason for change<textarea required minLength={3} maxLength={500} className={field} value={limits.reason} onChange={event => setLimits({ ...limits, reason: event.target.value })} /></label>
              </fieldset>
              {settingsError && <p className="text-danger" role="alert">{settingsError}</p>}
              {confirm ? <div className="border border-edge-medium rounded-lg p-4 space-y-3" role="group" aria-label="Confirm account changes"><p>Apply to <strong className="[overflow-wrap:anywhere]">{current.email}</strong>: cloud saving {limits.cloud ? 'enabled' : 'paused'}, {limits.projects || 'unlimited'} projects, {limits.storage === '' ? 'unlimited storage' : `${limits.storage} MB storage`}, credit adjustment {limits.credits}. This will be recorded in admin history.</p><button type="button" className={BTN_SECONDARY_SM} disabled={saving} onClick={() => void saveLimits()}>{saving ? 'Saving…' : 'Confirm changes'}</button><button type="button" className={BTN_SECONDARY_SM} disabled={saving} onClick={() => setConfirm(false)}>Go back</button></div> : <button className={BTN_SECONDARY_SM}>Review changes</button>}
            </form>}
          </section>}
          <details className={box}><summary className="cursor-pointer font-medium">Recent admin changes</summary><p className="text-xs text-fg-secondary mt-3">Most recent 20 cloud-limit and credit changes.</p>{report.audit.length === 0 ? <p className="text-sm text-fg-secondary mt-3">No changes recorded yet.</p> : <ul className="divide-y divide-edge-subtle">{report.audit.map((item, index) => <li key={index} className="py-4 text-sm [overflow-wrap:anywhere]"><p>{item.target} · {date(item.created_at)}</p><p className="text-fg-secondary mt-1">By {item.actor} · {item.details.reason}</p><p className="text-fg-secondary">Cloud {item.details.after.cloud_enabled ? 'enabled' : 'paused'} · Project limit {item.details.after.project_limit ?? 'unlimited'} · Storage {item.details.after.storage_limit_bytes === null ? 'unlimited' : bytes(item.details.after.storage_limit_bytes)} · Credits {item.details.credit_delta > 0 ? '+' : ''}{item.details.credit_delta}</p></li>)}</ul>}</details>
        </>}
        {editing && <section className={`${box} space-y-4`} aria-label="Edit user">
          <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">Edit {editing.email}</h2>
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void saveRole(); }}>
            <label className="block">Display name<input autoFocus maxLength={100} value={editing.display_name} disabled={saving} onChange={event => setEditing({ ...editing, display_name: event.target.value })} className={field} /></label>
            <label className="flex items-center gap-3"><input type="checkbox" checked={editing.is_admin} disabled={saving} onChange={event => setEditing({ ...editing, is_admin: event.target.checked })} />Administrator access</label>
            <p className="text-sm text-fg-secondary">Administrators can view all accounts and manage other users’ administrator access.</p>
            <div className="flex gap-3"><button className={BTN_SECONDARY_SM} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button><button className={BTN_SECONDARY_SM} type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        </section>}
      </>}
    </div>
  </main>;
}
