import { useState } from 'react';
import { KeyRound, Search, ShieldAlert, UserCheck, UserPlus, UserX } from 'lucide-react';
import { Avatar } from '../../src/components/Avatar';
import type { UserProfile } from '../../src/types/social';
import {
  ADMIN_ROLE_PERMISSIONS,
  type AdminMemberFilter,
  type AdminRoleEntry,
  type AdminRoleLevel,
  type MemberAccountStatus,
  type MemberModerationRecord,
} from '../adminLogic';

interface MembersRolesSectionProps {
  currentAdminUid: string;
  members: UserProfile[];
  memberSearch: string;
  memberFilter: AdminMemberFilter;
  onlineSet: Set<string>;
  restrictedSet: Set<string>;
  moderationRecords: Record<string, MemberModerationRecord>;
  adminRoles: AdminRoleEntry[];
  onChangeSearch: (q: string) => void;
  onChangeFilter: (mode: AdminMemberFilter) => void;
  onInspectProfile: (uid: string) => void;
  onSetMemberStatus: (
    targetUid: string,
    status: MemberAccountStatus,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onAssignRole: (input: {
    uid: string;
    email: string;
    displayName: string;
    role: AdminRoleLevel;
  }) => Promise<{ ok: boolean; error?: string }>;
  onRevokeRole: (uid: string) => Promise<{ ok: boolean; error?: string }>;
}

const FILTER_OPTIONS: AdminMemberFilter[] = [
  'all',
  'online',
  'onboarded',
  'restricted',
  'suspended',
  'admins',
];

export function MembersRolesSection({
  currentAdminUid,
  members,
  memberSearch,
  memberFilter,
  onlineSet,
  restrictedSet,
  moderationRecords,
  adminRoles,
  onChangeSearch,
  onChangeFilter,
  onInspectProfile,
  onSetMemberStatus,
  onAssignRole,
  onRevokeRole,
}: MembersRolesSectionProps) {
  const [suspendTarget, setSuspendTarget] = useState<UserProfile | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
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

  const adminByUid = new Map(adminRoles.map((r) => [r.uid, r]));

  const handleQuickStatusChange = async (
    member: UserProfile,
    status: MemberAccountStatus,
    reason: string
  ) => {
    setBusyUid(member.uid);
    setFeedback(null);
    const res = await onSetMemberStatus(member.uid, status, reason);
    setBusyUid(null);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Unable to update member status.' });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Updated @${member.handle} status to ${status.toUpperCase()}.`,
    });
  };

  const handleConfirmSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendTarget) return;
    setBusyUid(suspendTarget.uid);
    setFeedback(null);
    const res = await onSetMemberStatus(suspendTarget.uid, 'suspended', suspendReason);
    setBusyUid(null);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Suspension reason required.' });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Suspended @${suspendTarget.handle}. Appeal eligibility recorded.`,
    });
    setSuspendTarget(null);
    setSuspendReason('');
  };

  const handleGrantRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await onAssignRole(roleForm);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Could not assign role.' });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Assigned ${roleForm.role.replace('_', ' ')} permissions to ${roleForm.email}.`,
    });
    setRoleForm({ uid: '', email: '', displayName: '', role: 'moderator' });
  };

  const handleRevoke = async (uid: string, email: string) => {
    setFeedback(null);
    const res = await onRevokeRole(uid);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Cannot revoke role.' });
      return;
    }
    setFeedback({ type: 'ok', text: `Revoked operator role for ${email}.` });
  };

  return (
    <div className="space-y-6">
      {/* Header & Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            User, Role &amp; Account Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Inspect community accounts, enforce posting restrictions or suspensions, and manage RBAC operator scopes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search members"
              value={memberSearch}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="Search name, @handle, location"
              className="min-h-[40px] pl-9 pr-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {FILTER_OPTIONS.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeFilter(mode)}
                className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold capitalize cursor-pointer whitespace-nowrap ${
                  memberFilter === mode
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
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

      {/* Inline Suspension Reason Panel */}
      {suspendTarget && (
        <form
          onSubmit={handleConfirmSuspend}
          className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold">
                Suspend Account: {suspendTarget.displayName} (@{suspendTarget.handle})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setSuspendTarget(null);
                setSuspendReason('');
              }}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
            >
              Cancel
            </button>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Suspension justification (logged in audit ledger &amp; appeal reference)
            </span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={400}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Repeated unsolicited spam or impersonation after restriction warning"
              className="w-full min-h-[40px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={busyUid === suspendTarget.uid}
              className="min-h-[38px] px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              Confirm Suspension
            </button>
          </div>
        </form>
      )}

      {/* Member Directory Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {members.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No members match the active search or status filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6 font-semibold">Member</th>
                  <th className="py-3 px-4 font-semibold">Role</th>
                  <th className="py-3 px-4 font-semibold">Lifecycle Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Followers</th>
                  <th className="py-3 px-6 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((member) => {
                  const isOnline = onlineSet.has(member.uid);
                  const modRecord = moderationRecords[member.uid];
                  const isSuspended = modRecord?.status === 'suspended';
                  const isRestricted =
                    !isSuspended &&
                    (modRecord?.status === 'restricted' || restrictedSet.has(member.uid));
                  const isSelf = member.uid === currentAdminUid;
                  const roleEntry = adminByUid.get(member.uid);
                  const isBusy = busyUid === member.uid;

                  return (
                    <tr
                      key={member.uid}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            src={member.avatarUrl}
                            name={member.displayName}
                            size="sm"
                            online={isOnline}
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {member.displayName}
                              {isSelf ? ' (You)' : ''}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              @{member.handle} · {member.location || 'Looma'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-xs font-mono font-semibold uppercase ${
                            roleEntry
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {roleEntry ? roleEntry.role.replace('_', ' ') : 'MEMBER'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span
                            className={`text-xs font-mono font-semibold ${
                              isSuspended
                                ? 'text-red-600 dark:text-red-400'
                                : isRestricted
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : isOnline
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {isSuspended
                              ? 'SUSPENDED'
                              : isRestricted
                                ? 'RESTRICTED'
                                : isOnline
                                  ? 'ONLINE'
                                  : 'ACTIVE'}
                          </span>
                          {modRecord?.reason && (isSuspended || isRestricted) && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[240px] truncate">
                              {modRecord.reason}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {member.followersCount}
                      </td>

                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onInspectProfile(member.uid)}
                            className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            Profile
                          </button>

                          {!isSelf && (
                            <>
                              {isRestricted || isSuspended ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleQuickStatusChange(
                                      member,
                                      'active',
                                      'Account standing restored by administrator'
                                    )
                                  }
                                  className="min-h-[34px] px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Restore</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleQuickStatusChange(
                                      member,
                                      'restricted',
                                      'Posting & interaction temporarily restricted by moderator'
                                    )
                                  }
                                  className="min-h-[34px] px-2.5 rounded-lg border border-amber-300 dark:border-amber-800 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                                >
                                  Restrict
                                </button>
                              )}

                              {!isSuspended && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setSuspendTarget(member);
                                    setSuspendReason('');
                                  }}
                                  className="min-h-[34px] px-2.5 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Suspend</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role & Permissions Management */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <section className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Administrator Roles &amp; Permissions
              </h2>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {adminRoles.length} assigned
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {adminRoles.map((entry) => {
              const isSelf = entry.uid === currentAdminUid;
              return (
                <div
                  key={entry.uid}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
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
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Scopes: {entry.permissions.join(', ')}
                    </p>
                  </div>

                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => void handleRevoke(entry.uid, entry.email)}
                      className="min-h-[34px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0 cursor-pointer"
                    >
                      Revoke Role
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <form
          onSubmit={handleGrantRoleSubmit}
          className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Assign Operator Role
            </h2>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Verified Member UID
            </span>
            <input
              type="text"
              required
              value={roleForm.uid}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, uid: e.target.value }))}
              placeholder="e.g. u_sophia"
              className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Verified Email
            </span>
            <input
              type="email"
              required
              value={roleForm.email}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="moderator@looma.studio"
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
              placeholder="Sophia Chen"
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
            Grant Role &amp; Sync Rules
          </button>
        </form>
      </div>
    </div>
  );
}
