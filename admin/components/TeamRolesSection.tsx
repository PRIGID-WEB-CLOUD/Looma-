import { useState } from 'react';
import { KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { Avatar } from '../../src/components/Avatar';
import type { UserProfile } from '../../src/types/social';
import {
  ADMIN_EMAILS,
  ADMIN_ROLE_PERMISSIONS,
  type AdminRoleEntry,
  type AdminRoleLevel,
} from '../adminLogic';

interface TeamRolesSectionProps {
  currentAdminUid: string;
  adminRoles: AdminRoleEntry[];
  communityUsers?: UserProfile[];
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
  communityUsers = [],
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
  const [selectedMemberUid, setSelectedMemberUid] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const selectableMembers = communityUsers.filter((u) => u.uid !== currentAdminUid);

  const handleSelectMember = (uid: string) => {
    setSelectedMemberUid(uid);
    const member = selectableMembers.find((m) => m.uid === uid);
    if (!member) return;
    setRoleForm((prev) => ({
      ...prev,
      uid: member.uid,
      displayName: member.displayName || prev.displayName,
    }));
  };

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
    setSelectedMemberUid('');
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
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Team &amp; Administrator Roles
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage workspace operators, bootstrap root allowlist accounts, and assign RBAC role permissions.
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

      {/* Root Allowlist & Assigned Team Operators Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Root Allowlist
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Root administrator emails with secure console bootstrap privileges:
          </p>
          <ul className="space-y-2 text-xs font-mono text-slate-800 dark:text-slate-200">
            {ADMIN_EMAILS.map((addr) => (
              <li
                key={addr}
                className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 truncate"
              >
                <span className="truncate">{addr}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="px-5 sm:px-6 py-4.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 min-w-0">
              <KeyRound className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
                Assigned Team Operators
              </h2>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 shrink-0">
              {adminRoles.length} assigned
            </span>
          </div>

          {adminRoles.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
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
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1.5 flex items-start gap-3.5">
                      <Avatar name={entry.displayName} size="md" />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {entry.displayName}
                            {isSelf ? ' (You)' : ''}
                          </span>
                          <span className="font-mono text-[11px] uppercase font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                            {entry.role.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all sm:truncate">
                          {entry.email} · UID: {entry.uid}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 break-words sm:truncate">
                          Scopes: {entry.permissions.join(', ')}
                        </p>
                      </div>
                    </div>

                    {!isSelf && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRevoke(entry.uid, entry.email)}
                        className="min-h-[40px] px-3.5 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0 cursor-pointer disabled:opacity-60 self-start sm:self-center"
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

      {/* Grant Operator Role Form Card */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5 max-w-xl shadow-sm">
        <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400">
          <UserPlus className="w-5 h-5 shrink-0" aria-hidden="true" />
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Grant Operator Role to Team Member
          </h2>
        </div>

        <form onSubmit={handleGrantRoleSubmit} className="space-y-4">
          {selectableMembers.length > 0 && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Quick Select Existing Community Member (Optional)
              </span>
              <select
                aria-label="Quick Select Existing Community Member"
                value={selectedMemberUid}
                onChange={(e) => handleSelectMember(e.target.value)}
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">Choose a member to autofill UID &amp; name...</option>
                {selectableMembers.map((member) => (
                  <option key={member.uid} value={member.uid}>
                    {member.displayName} (@{member.handle}) — {member.uid}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Selecting a member populates their Firebase UID and display name; enter their verified login email below.
              </p>
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Team Member Firebase UID
            </span>
            <input
              type="text"
              required
              value={roleForm.uid}
              onChange={(e) => {
                setSelectedMemberUid('');
                setRoleForm((prev) => ({ ...prev, uid: e.target.value }));
              }}
              placeholder="e.g. JC4GQxv4fnPAQ4EJuapgNDrfh4a2"
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Verified Team Email
            </span>
            <input
              type="email"
              required
              value={roleForm.email}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="operator@domain.com"
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Display Name
            </span>
            <input
              type="text"
              required
              value={roleForm.displayName}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="Operator Full Name"
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Role Scope
            </span>
            <select
              value={roleForm.role}
              onChange={(e) =>
                setRoleForm((prev) => ({ ...prev, role: e.target.value as AdminRoleLevel }))
              }
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="moderator">Moderator ({ADMIN_ROLE_PERMISSIONS.moderator.length} scopes)</option>
              <option value="analyst">Analyst ({ADMIN_ROLE_PERMISSIONS.analyst.length} scope)</option>
              <option value="super_admin">Super Admin ({ADMIN_ROLE_PERMISSIONS.super_admin.length} scopes)</option>
            </select>
          </label>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full min-h-[42px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold cursor-pointer shadow-lg shadow-blue-600/20 transition-colors"
            >
              Grant Role &amp; Sync Firestore
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
