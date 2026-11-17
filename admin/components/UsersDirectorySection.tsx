import { useMemo, useState } from 'react';
import { CheckCircle2, Search, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import { Avatar } from '../../src/components/Avatar';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import type { UserProfile } from '../../src/types/social';
import {
  filterAdminMembers,
  type AdminMemberFilter,
  type MemberAccountStatus,
  type MemberModerationRecord,
} from '../adminLogic';

interface UsersDirectorySectionProps {
  currentAdminUid: string;
  communityUsers: UserProfile[];
  onlineUserIds: string[];
  restrictedSet: Set<string>;
  moderationRecords: Record<string, MemberModerationRecord>;
  onSetMemberStatus: (
    targetUid: string,
    status: MemberAccountStatus,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onToggleVerify?: (
    targetUid: string,
    isVerified: boolean
  ) => Promise<{ ok: boolean; error?: string }>;
}

const FILTER_OPTIONS: AdminMemberFilter[] = [
  'all',
  'online',
  'onboarded',
  'restricted',
  'suspended',
];

export function UsersDirectorySection({
  currentAdminUid,
  communityUsers,
  onlineUserIds,
  restrictedSet,
  moderationRecords,
  onSetMemberStatus,
  onToggleVerify,
}: UsersDirectorySectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<AdminMemberFilter>('all');
  const [inspectedUser, setInspectedUser] = useState<UserProfile | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<UserProfile | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);

  const suspendedUids = useMemo(
    () =>
      Object.values(moderationRecords)
        .filter((r) => r.status === 'suspended')
        .map((r) => r.uid),
    [moderationRecords]
  );

  const restrictedUidsCombined = useMemo(
    () =>
      Array.from(
        new Set([
          ...restrictedSet,
          ...Object.values(moderationRecords)
            .filter((r) => r.status === 'restricted')
            .map((r) => r.uid),
        ])
      ),
    [moderationRecords, restrictedSet]
  );

  const filteredUsers = useMemo(
    () =>
      filterAdminMembers(
        communityUsers,
        searchQuery,
        filterMode,
        onlineUserIds,
        restrictedUidsCombined,
        suspendedUids,
        []
      ),
    [communityUsers, filterMode, onlineUserIds, restrictedUidsCombined, searchQuery, suspendedUids]
  );

  const handleQuickStatusChange = async (
    user: UserProfile,
    status: MemberAccountStatus,
    reason: string
  ) => {
    setBusyUid(user.uid);
    setFeedback(null);
    const res = await onSetMemberStatus(user.uid, status, reason);
    setBusyUid(null);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Unable to update user status.' });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Updated @${user.handle} status to ${status.toUpperCase()}.`,
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

  const handleToggleVerifyClick = async (user: UserProfile) => {
    if (!onToggleVerify) return;
    const nextVerified = !user.isVerified;
    setBusyUid(user.uid);
    setFeedback(null);
    const res = await onToggleVerify(user.uid, nextVerified);
    setBusyUid(null);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Failed to update verification.' });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `${nextVerified ? 'Granted' : 'Revoked'} verified blue tick badge for @${user.handle}.`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Community Users Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Inspect regular app user accounts, review profile details, manage verified blue ticks, and enforce account restrictions or suspensions.
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
              aria-label="Search users"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, @handle, location"
              className="min-h-[40px] pl-9 pr-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {FILTER_OPTIONS.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold capitalize cursor-pointer whitespace-nowrap ${
                  filterMode === mode
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
                Suspend User: {suspendTarget.displayName} (@{suspendTarget.handle})
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
              placeholder="e.g. Spam links or policy violation"
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

      {/* User Details Inspection Panel */}
      {inspectedUser && (
        <div
          data-testid="admin-user-details"
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                src={inspectedUser.avatarUrl}
                name={inspectedUser.displayName}
                size="md"
                online={onlineSet.has(inspectedUser.uid)}
              />
              <div className="min-w-0">
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  {inspectedUser.displayName}
                </h2>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                  @{inspectedUser.handle} · UID: {inspectedUser.uid}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInspectedUser(null)}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-300">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Location</p>
              <p className="mt-1 font-medium text-slate-900 dark:text-white">
                {inspectedUser.location || 'Not specified'}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Network</p>
              <p className="mt-1 font-medium text-slate-900 dark:text-white tabular-nums">
                {inspectedUser.followersCount} followers · {inspectedUser.followingCount} following
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Onboarding</p>
              <p className="mt-1 font-medium text-slate-900 dark:text-white">
                {inspectedUser.onboardingCompleted ? 'Completed' : 'Pending'}
              </p>
            </div>
          </div>
          {inspectedUser.bio && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {inspectedUser.bio}
            </p>
          )}
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No community users match the active search or status filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Lifecycle Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Followers</th>
                  <th className="py-3 px-6 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((user) => {
                  const isOnline = onlineSet.has(user.uid);
                  const modRecord = moderationRecords[user.uid];
                  const isSuspended = modRecord?.status === 'suspended';
                  const isRestricted =
                    !isSuspended &&
                    (modRecord?.status === 'restricted' || restrictedSet.has(user.uid));
                  const isSelf = user.uid === currentAdminUid;
                  const isBusy = busyUid === user.uid;

                  return (
                    <tr
                      key={user.uid}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            src={user.avatarUrl}
                            name={user.displayName}
                            size="sm"
                            online={isOnline}
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                              <span>{user.displayName}</span>
                              {user.isVerified && <VerifiedBadge size={14} />}
                              {isSelf ? ' (You)' : ''}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              @{user.handle} · {user.location || 'Looma'}
                            </p>
                          </div>
                        </div>
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
                        {user.followersCount}
                      </td>

                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setInspectedUser((prev) =>
                                prev?.uid === user.uid ? null : user
                              )
                            }
                            className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {inspectedUser?.uid === user.uid ? 'Hide' : 'Details'}
                          </button>

                          {!isSelf && (
                            <>
                              {isRestricted || isSuspended ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleQuickStatusChange(
                                      user,
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
                                      user,
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
                                    setSuspendTarget(user);
                                    setSuspendReason('');
                                  }}
                                  className="min-h-[34px] px-2.5 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Suspend</span>
                                </button>
                              )}

                              {onToggleVerify && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleToggleVerifyClick(user)}
                                  className={`min-h-[34px] px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                                    user.isVerified
                                      ? 'border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                  <span>{user.isVerified ? 'Unverify' : 'Verify'}</span>
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
    </div>
  );
}
