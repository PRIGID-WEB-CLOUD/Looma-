import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  MapPin,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
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
  onSanitizeProfile?: (
    targetUid: string,
    input: {
      displayName: string;
      handle: string;
      bio: string;
      location: string;
      avatarUrl: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onSendWarning?: (
    targetUid: string,
    title: string,
    body: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onPurgeUser?: (targetUid: string) => Promise<{ ok: boolean; error?: string }>;
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
  onSanitizeProfile,
  onSendWarning,
  onPurgeUser,
}: UsersDirectorySectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<AdminMemberFilter>('all');
  const [inspectedUser, setInspectedUser] = useState<UserProfile | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBio, setEditBio] = useState('');
  const [clearAvatar, setClearAvatar] = useState(false);
  const [warnTitle, setWarnTitle] = useState('Official Account Notice');
  const [warnBody, setWarnBody] = useState('');
  const [confirmPurgeUid, setConfirmPurgeUid] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<UserProfile | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'edit' | 'warning' | 'standing'>('overview');
  const [copiedUid, setCopiedUid] = useState(false);

  useEffect(() => {
    if (!inspectedUser) return;
    setEditDisplayName(inspectedUser.displayName || '');
    setEditHandle(inspectedUser.handle || '');
    setEditLocation(inspectedUser.location || '');
    setEditBio(inspectedUser.bio || '');
    setClearAvatar(false);
    setWarnTitle('Official Account Notice');
    setWarnBody('');
    setConfirmPurgeUid(null);
    setInspectorTab('overview');
    setCopiedUid(false);
  }, [inspectedUser]);

  useEffect(() => {
    if (!inspectedUser) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInspectedUser(null);
        setConfirmPurgeUid(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectedUser]);

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
      {/* Header & Search / Filter Bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Community Users Directory
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Inspect user accounts, manage verified blue ticks, review network presence, and enforce safety controls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:flex-initial">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search community users"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, handle, location..."
                className="w-full sm:w-64 min-h-[42px] pl-10 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div
              role="tablist"
              aria-label="User status filters"
              className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            >
              {FILTER_OPTIONS.map((mode) => {
                const active = filterMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilterMode(mode)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
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

      {/* Suspension Reason Panel */}
      {suspendTarget && (
        <form
          onSubmit={handleConfirmSuspend}
          className="rounded-2xl border border-red-300 dark:border-red-900 bg-red-50/80 dark:bg-red-950/40 p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-red-700 dark:text-red-300">
              <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h2 className="font-display text-sm sm:text-base font-bold">
                Suspend User: {suspendTarget.displayName} (@{suspendTarget.handle})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setSuspendTarget(null);
                setSuspendReason('');
              }}
              className="min-h-[36px] px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer"
            >
              Cancel
            </button>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Suspension Justification (logged in audit trail &amp; appeal reference)
            </span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={400}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Repeated policy violation or spam solicitation"
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-600 text-slate-900 dark:text-white"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={busyUid === suspendTarget.uid}
              className="min-h-[40px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60 shadow-md shadow-red-600/20"
            >
              Confirm Account Suspension
            </button>
          </div>
        </form>
      )}

      {/* User Details Inspection Card */}
      {/* User Details Slide-over Inspector Sheet */}
      {inspectedUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex justify-end"
          onClick={() => {
            setInspectedUser(null);
            setConfirmPurgeUid(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`User inspector for ${inspectedUser.displayName}`}
        >
          <div
            data-testid="admin-user-details"
            className="w-full max-w-lg h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-slate-950/70">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  src={inspectedUser.avatarUrl}
                  name={inspectedUser.displayName}
                  size="md"
                  online={onlineSet.has(inspectedUser.uid)}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2
                      id="inspector-user-title"
                      className="font-display text-base font-bold text-slate-900 dark:text-white truncate"
                    >
                      {inspectedUser.displayName}
                    </h2>
                    {inspectedUser.isVerified && <VerifiedBadge size={14} />}
                  </div>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    @{inspectedUser.handle}
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="close-user-inspector"
                aria-label="Close inspector"
                onClick={() => {
                  setInspectedUser(null);
                  setConfirmPurgeUid(null);
                }}
                className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Close Inspector</span>
              </button>
            </div>

            {/* Segmented Tab Bar */}
            <div className="px-4 sm:px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <div
                role="tablist"
                aria-label="User inspector sections"
                className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-xs"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'overview'}
                  onClick={() => setInspectorTab('overview')}
                  className={`py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer truncate text-center ${
                    inspectorTab === 'overview'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'edit'}
                  onClick={() => setInspectorTab('edit')}
                  className={`py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer truncate text-center ${
                    inspectorTab === 'edit'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'warning'}
                  onClick={() => setInspectorTab('warning')}
                  className={`py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer truncate text-center ${
                    inspectorTab === 'warning'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Notice
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === 'standing'}
                  onClick={() => setInspectorTab('standing')}
                  className={`py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer truncate text-center ${
                    inspectorTab === 'standing'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Standing
                </button>
              </div>
            </div>

            {/* Scrollable Tab Content Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {inspectorTab === 'overview' && (
                <div className="space-y-3.5">
                  {/* UID Pill with Copy */}
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono">
                    <span className="truncate text-slate-600 dark:text-slate-400">
                      UID: {inspectedUser.uid}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(inspectedUser.uid);
                        setCopiedUid(true);
                        setTimeout(() => setCopiedUid(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
                    >
                      {copiedUid ? (
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>{copiedUid ? 'Copied' : 'Copy UID'}</span>
                    </button>
                  </div>

                  {/* 3 Metric Stats */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Location
                      </p>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {inspectedUser.location || 'Not set'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Network
                      </p>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white tabular-nums truncate">
                        {inspectedUser.followersCount}F · {inspectedUser.followingCount}F
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Onboarding
                      </p>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {inspectedUser.onboardingCompleted ? 'Completed' : 'Pending'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Verified Badge Action */}
                  {onToggleVerify && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <BadgeCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                          Verified Badge: {inspectedUser.isVerified ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={busyUid === inspectedUser.uid}
                        onClick={async () => {
                          setBusyUid(inspectedUser.uid);
                          const nextVerified = !inspectedUser.isVerified;
                          const res = await onToggleVerify(inspectedUser.uid, nextVerified);
                          setBusyUid(null);
                          if (res.ok) {
                            setInspectedUser((prev) =>
                              prev ? { ...prev, isVerified: nextVerified } : null
                            );
                            setFeedback({
                              type: 'ok',
                              text: nextVerified
                                ? 'Granted verified status badge.'
                                : 'Revoked verified status badge.',
                            });
                          } else {
                            setFeedback({
                              type: 'err',
                              text: res.error || 'Failed to update verification status.',
                            });
                          }
                        }}
                        className="min-h-[32px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        {inspectedUser.isVerified ? 'Revoke Badge' : 'Grant Badge'}
                      </button>
                    </div>
                  )}

                  {/* Biography */}
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Biography
                    </p>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {inspectedUser.bio || 'No biography written by user yet.'}
                    </p>
                  </div>

                  {/* Interests */}
                  {inspectedUser.interests.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Interests
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {inspectedUser.interests.map((tag) => (
                          <span
                            key={tag}
                            className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-medium"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {inspectorTab === 'edit' && onSanitizeProfile && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusyUid(inspectedUser.uid);
                    setFeedback(null);
                    const res = await onSanitizeProfile(inspectedUser.uid, {
                      displayName: editDisplayName,
                      handle: editHandle,
                      bio: editBio,
                      location: editLocation,
                      avatarUrl: clearAvatar ? '' : inspectedUser.avatarUrl || '',
                    });
                    setBusyUid(null);
                    if (!res.ok) {
                      setFeedback({ type: 'err', text: res.error || 'Could not update profile.' });
                      return;
                    }
                    setInspectedUser((prev) =>
                      prev
                        ? {
                            ...prev,
                            displayName: editDisplayName.trim(),
                            handle: editHandle.trim().toLowerCase().replace(/^@+/, ''),
                            bio: editBio.trim(),
                            location: editLocation.trim(),
                            avatarUrl: clearAvatar ? '' : prev.avatarUrl,
                          }
                        : null
                    );
                    setFeedback({ type: 'ok', text: `Updated profile fields for @${editHandle}.` });
                  }}
                  className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <Edit3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <span>Edit / Sanitize User Profile</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Display Name</span>
                      <input
                        type="text"
                        required
                        aria-label="Edit display name"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="Display name"
                        className="w-full min-h-[38px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Handle</span>
                      <input
                        type="text"
                        required
                        aria-label="Edit user handle"
                        value={editHandle}
                        onChange={(e) => setEditHandle(e.target.value)}
                        placeholder="handle"
                        className="w-full min-h-[38px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Location</span>
                    <input
                      type="text"
                      aria-label="Edit user location"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="e.g. San Francisco, CA"
                      className="w-full min-h-[38px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Biography</span>
                    <textarea
                      rows={3}
                      aria-label="Edit user bio"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      placeholder="Profile biography..."
                      className="w-full p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white resize-none"
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clearAvatar}
                        onChange={(e) => setClearAvatar(e.target.checked)}
                      />
                      <span>Reset profile photo to default</span>
                    </label>
                    <button
                      type="submit"
                      disabled={busyUid === inspectedUser.uid}
                      className="min-h-[36px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      Save Profile
                    </button>
                  </div>
                </form>
              )}

              {inspectorTab === 'warning' && onSendWarning && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusyUid(inspectedUser.uid);
                    setFeedback(null);
                    const res = await onSendWarning(inspectedUser.uid, warnTitle, warnBody);
                    setBusyUid(null);
                    if (!res.ok) {
                      setFeedback({ type: 'err', text: res.error || 'Could not send notice.' });
                      return;
                    }
                    setWarnBody('');
                    setFeedback({
                      type: 'ok',
                      text: `Sent official warning notification to @${inspectedUser.handle}.`,
                    });
                  }}
                  className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <span>Send Direct Official Warning</span>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Notice Heading</span>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={warnTitle}
                      onChange={(e) => setWarnTitle(e.target.value)}
                      placeholder="Notice heading"
                      className="w-full min-h-[38px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Warning Message</span>
                    <textarea
                      rows={3}
                      required
                      maxLength={240}
                      value={warnBody}
                      onChange={(e) => setWarnBody(e.target.value)}
                      placeholder="Official policy warning delivered to user notifications..."
                      className="w-full p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white resize-none"
                    />
                  </label>
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={busyUid === inspectedUser.uid || !warnBody.trim()}
                      className="min-h-[36px] px-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      Send Official Notice
                    </button>
                  </div>
                </form>
              )}

              {inspectorTab === 'standing' && (
                <div className="space-y-4">
                  {/* Account Standing Controls */}
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                      <ShieldAlert className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span>Moderation Standing &amp; Access Status</span>
                    </div>

                    {inspectedUser.uid === currentAdminUid ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        This is your active administrator account. Standing controls cannot be applied to yourself.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busyUid === inspectedUser.uid}
                          onClick={() => void handleQuickStatusChange(inspectedUser, 'active', 'Standing restored by admin')}
                          className="min-h-[38px] px-3 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Set Active</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyUid === inspectedUser.uid}
                          onClick={() => void handleQuickStatusChange(inspectedUser, 'restricted', 'Restricted by administrator')}
                          className="min-h-[38px] px-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Restrict Account</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Purge Danger Zone */}
                  {onPurgeUser && inspectedUser.uid !== currentAdminUid && (
                    <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30 p-4 space-y-2.5">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-red-700 dark:text-red-300">
                          Purge User &amp; Content
                        </p>
                        <p className="text-[11px] text-red-700/80 dark:text-red-300/80">
                          Deletes profile, posts, and 24h stories permanently. This action cannot be undone.
                        </p>
                      </div>

                      {confirmPurgeUid === inspectedUser.uid ? (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={busyUid === inspectedUser.uid}
                            onClick={async () => {
                              setBusyUid(inspectedUser.uid);
                              const res = await onPurgeUser(inspectedUser.uid);
                              setBusyUid(null);
                              if (!res.ok) {
                                setFeedback({ type: 'err', text: res.error || 'Purge failed.' });
                                return;
                              }
                              setFeedback({
                                type: 'ok',
                                text: `Purged @${inspectedUser.handle} and associated workspace content.`,
                              });
                              setInspectedUser(null);
                            }}
                            className="min-h-[36px] px-3.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Confirm Purge
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmPurgeUid(null)}
                            className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmPurgeUid(inspectedUser.uid)}
                          className="min-h-[36px] px-3.5 rounded-lg border border-red-300 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Purge Account</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sheet Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px]">Esc</kbd> to exit
              </span>
              <button
                type="button"
                onClick={() => {
                  setInspectedUser(null);
                  setConfirmPurgeUid(null);
                }}
                className="min-h-[36px] px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shadow-xs"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users List (Responsive Card Grid for Mobile & Clean Table for Desktop) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No community users match your search criteria.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try adjusting your search or switching the status filter tab above.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card Layout */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
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
                  <div
                    key={user.uid}
                    className={`p-4 space-y-3 transition-colors ${
                      inspectedUser?.uid === user.uid
                        ? 'bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500/30 rounded-xl'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          src={user.avatarUrl}
                          name={user.displayName}
                          size="md"
                          online={isOnline}
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{user.displayName}</span>
                            {user.isVerified && <VerifiedBadge size={14} />}
                            {isSelf ? ' (You)' : ''}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            @{user.handle} · {user.location || 'Looma'}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md shrink-0 ${
                          isSuspended
                            ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                            : isRestricted
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : isOnline
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {isSuspended
                          ? 'Suspended'
                          : isRestricted
                            ? 'Restricted'
                            : isOnline
                              ? 'Online'
                              : 'Active'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <span>Followers: <strong className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">{user.followersCount}</strong></span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspectedUser((prev) => (prev?.uid === user.uid ? null : user))}
                          className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                            inspectedUser?.uid === user.uid
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {inspectedUser?.uid === user.uid ? 'Close' : 'Details'}
                        </button>
                        {!isSelf && (
                          <>
                            {isRestricted || isSuspended ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleQuickStatusChange(user, 'active', 'Restored by admin')}
                                className="min-h-[38px] px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold cursor-pointer"
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleQuickStatusChange(user, 'restricted', 'Restricted by moderator')}
                                className="min-h-[38px] px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
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
                                className="min-h-[38px] px-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold cursor-pointer"
                              >
                                Suspend
                              </button>
                            )}
                            {onToggleVerify && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleToggleVerifyClick(user)}
                                className="min-h-[38px] px-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-semibold cursor-pointer"
                              >
                                {user.isVerified ? 'Unverify' : 'Verify'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/50">
                    <th className="py-3.5 px-6">User Account</th>
                    <th className="py-3.5 px-4">Lifecycle Status</th>
                    <th className="py-3.5 px-4 text-right">Followers</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
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
                        className={`transition-colors ${
                          inspectedUser?.uid === user.uid
                            ? 'bg-blue-50/70 dark:bg-blue-950/40'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <Avatar
                              src={user.avatarUrl}
                              name={user.displayName}
                              size="md"
                              online={isOnline}
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                <span className="truncate">{user.displayName}</span>
                                {user.isVerified && <VerifiedBadge size={14} />}
                                {isSelf ? ' (You)' : ''}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                @{user.handle} · {user.location || 'Looma'}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span
                              className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md inline-block ${
                                isSuspended
                                  ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                                  : isRestricted
                                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                                    : isOnline
                                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
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

                        <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                          {user.followersCount}
                        </td>

                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setInspectedUser((prev) =>
                                  prev?.uid === user.uid ? null : user
                                )
                              }
                              className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                                inspectedUser?.uid === user.uid
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {inspectedUser?.uid === user.uid ? 'Close' : 'Details'}
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
                                    className="min-h-[36px] px-3 rounded-xl border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 inline-flex items-center gap-1 cursor-pointer"
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
                                    className="min-h-[36px] px-3 rounded-xl border border-amber-300 dark:border-amber-800 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
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
                                    className="min-h-[36px] px-3 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 cursor-pointer"
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
                                    className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
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
          </>
        )}
      </div>
    </div>
  );
}
