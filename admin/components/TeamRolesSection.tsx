import { useState } from 'react';
import { KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { Avatar } from '../../src/components/Avatar';
import {
  ADMIN_EMAILS,
  ADMIN_ROLE_PERMISSIONS,
  type AdminRoleEntry,
  type AdminRoleLevel,
} from '../adminLogic';

interface TeamRolesSectionProps {
  currentAdminUid: string;
  adminRoles: AdminRoleEntry[];
  onAssignRole: (input: {
    uid: string;
    email: string;
    displayName: string;
    role: AdminRoleLevel;
  }) => Promise<{ ok: boolean; error?: string }>;
  onRevokeRole: (uid: string) => Promise<{ ok: boolean; error?: string }>;
}

export function TeamRolesSection({
  currentAdminUid,
  adminRoles,
  onAssignRole,
  onRevokeRole,
}: TeamRolesSectionProps) {
  const [roleForm, setRoleForm] = useState<{
    uid: string;
    email: string;
    displayName: string;
    role: AdminRoleLevel;
  }>({
    uid: '',
    email: '',
    displayName: '',
    role: 'moderator',
  });
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const handleGrantRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await onAssignRole(roleForm);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Could not assign operator role.' });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Assigned ${roleForm.role.replace('_', ' ')} permissions to ${roleForm.email}.`,
    });
    setRoleForm({ uid: '', email: '', displayName: '', role: 'moderator' });
  };

  const handleRevoke = async (uid: string, email: string) => {
    setBusyUid(uid);
    setFeedback(null);
    const res = await onRevokeRole(uid);
    setBusyUid(null);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Cannot revoke role.' });
      return;
    }
    setFeedback({ type: 'ok', text: `Revoked operator role for ${email}.` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Team &amp; Administrator Roles
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage real workspace operators, bootstrap allowlist members, and assign RBAC role scopes.
        </p>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
            feedback.type === 'err'
              ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
              : 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Bootstrap Allowlist + Assigned Operators Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Root Allowlist
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Root administrator emails with direct console bootstrap access:
          </p>
          <ul className="space-y-2 text-xs font-mono text-slate-800 dark:text-slate-200">
            {ADMIN_EMAILS.map((addr) => (
              <li
                key={addr}
                className="flex items-center gap-2 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 truncate"
              >
                <span className="truncate">{addr}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Assigned Team Operators
              </h2>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {adminRoles.length} assigned
            </span>
          </div>

          {adminRoles.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No team operator roles assigned yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {adminRoles.map((entry) => {
                const isSelf = entry.uid === currentAdminUid;
                const isBusy = busyUid === entry.uid;
                return (
                  <div
                    key={entry.uid}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1 flex items-center gap-3">
                      <Avatar name={entry.displayName} size="sm" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {entry.displayName}
                            {isSelf ? ' (You)' : ''}
                          </span>
                          <span className="font-mono text-[11px] uppercase font-semibold text-blue-600 dark:text-blue-400">
                            {entry.role.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                          {entry.email} · UID: {entry.uid}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          Scopes: {entry.permissions.join(', ')}
                        </p>
                      </div>
                    </div>

                    {!isSelf && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRevoke(entry.uid, entry.email)}
                        className="min-h-[34px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0 cursor-pointer disabled:opacity-60"
                      >
                        {isBusy ? 'Revoking...' : 'Revoke Role'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Grant Operator Role Form */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 max-w-xl">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Grant Operator Role to Team Member
          </h2>
        </div>

        <form onSubmit={handleGrantRoleSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Team Member Firebase UID
            </span>
            <input
              type="text"
              required
              value={roleForm.uid}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, uid: e.target.value }))}
              placeholder="e.g. u_operator_abc123"
              className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Verified Team Email
            </span>
            <input
              type="email"
              required
              value={roleForm.email}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="operator@domain.com"
              className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Display Name
            </span>
            <input
              type="text"
              required
              value={roleForm.displayName}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="Operator Full Name"
              className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Role Scope
            </span>
            <select
              value={roleForm.role}
              onChange={(e) =>
                setRoleForm((prev) => ({ ...prev, role: e.target.value as AdminRoleLevel }))
              }
              className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="moderator">Moderator ({ADMIN_ROLE_PERMISSIONS.moderator.length} scopes)</option>
              <option value="analyst">Analyst ({ADMIN_ROLE_PERMISSIONS.analyst.length} scope)</option>
              <option value="super_admin">Super Admin ({ADMIN_ROLE_PERMISSIONS.super_admin.length} scopes)</option>
            </select>
          </label>

          <button
            type="submit"
            className="w-full min-h-[40px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Grant Role &amp; Sync Firestore
          </button>
        </form>
      </section>
    </div>
  );
}
