import { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Building2,
  Check,
  ExternalLink,
  Globe,
  Info,
  MapPin,
  Pencil,
  Search,
  Shield,
  User,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ChatMessage, ChatThread, UserProfile } from '../types/social';
import {
  formatRelativeTime,
  getThreadOnlineStatus,
  isGroupAdmin,
  isSafeExternalHttpUrl,
  isUserOnline,
  MAX_GROUP_MEMBERS,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

interface ChatInfoModalProps {
  open: boolean;
  thread: ChatThread;
  profile: UserProfile;
  messages: ChatMessage[];
  onlineUserIds: string[];
  communityUsers: UserProfile[];
  isMuted: boolean;
  pushEnabled: boolean;
  onToggleMute: () => void;
  onEnablePush: () => Promise<unknown>;
  onAddParticipants: (chatId: string, participantIds: string[]) => Promise<void>;
  onRemoveParticipant: (chatId: string, targetUid: string) => Promise<void>;
  onRenameGroup: (chatId: string, nextTitle: string) => Promise<void>;
  onPromoteAdmin?: (chatId: string, targetUid: string) => Promise<void>;
  onClose: () => void;
  onOpenPublicProfile: (uid: string) => void;
}

export function ChatInfoModal({
  open,
  thread,
  profile,
  messages,
  onlineUserIds,
  communityUsers,
  isMuted,
  pushEnabled,
  onToggleMute,
  onEnablePush,
  onAddParticipants,
  onRemoveParticipant,
  onRenameGroup,
  onPromoteAdmin,
  onClose,
  onOpenPublicProfile,
}: ChatInfoModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(thread.title);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!open) return null;

  const status = getThreadOnlineStatus(thread, profile.uid, onlineUserIds);
  const partnerUid = thread.isGroup
    ? thread.memberIds.find((id) => id !== profile.uid) || null
    : thread.partnerUid || thread.memberIds.find((id) => id !== profile.uid) || null;
  const matchedUser = partnerUid
    ? communityUsers.find((u) => u.uid === partnerUid && u.uid !== profile.uid) || null
    : null;

  const memberPool = [profile, ...communityUsers];
  const availableToAdd = communityUsers.filter(
    (u) => u.uid !== profile.uid && !thread.memberIds.includes(u.uid)
  );
  const atCapacity = thread.memberIds.length >= MAX_GROUP_MEMBERS;
  const iAmAdmin = isGroupAdmin(thread, profile.uid);

  const filteredMessages =
    showSearch && searchQuery.trim()
      ? messages.filter((m) =>
          m.text.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : messages;

  const handleAddSingle = async (uid: string) => {
    setActionError(null);
    setBusyUid(uid);
    try {
      await onAddParticipants(thread.id, [uid]);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to add participant.'
      );
    } finally {
      setBusyUid(null);
    }
  };

  const handleRemove = async (uid: string) => {
    setActionError(null);
    setBusyUid(uid);
    try {
      await onRemoveParticipant(thread.id, uid);
      if (uid === profile.uid) {
        onClose();
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to remove participant.'
      );
    } finally {
      setBusyUid(null);
    }
  };

  const handleSaveTitle = async () => {
    const clean = titleDraft.trim();
    if (!clean) {
      setActionError('Group name cannot be empty.');
      return;
    }
    setActionError(null);
    try {
      await onRenameGroup(thread.id, clean);
      setEditingTitle(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to rename group.'
      );
    }
  };

  const handlePromote = async (uid: string) => {
    if (!onPromoteAdmin) return;
    setActionError(null);
    setBusyUid(uid);
    try {
      await onPromoteAdmin(thread.id, uid);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to promote participant.'
      );
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-info-title"
      data-testid="chat-info-fullscreen-page"
      className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden"
    >
      {/* Full-Screen Sticky Header */}
      <header className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to chat"
              className="min-h-[42px] px-3 -ml-1.5 rounded-xl flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Back to Chat</span>
            </button>
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block shrink-0" aria-hidden="true" />
            <div className="flex items-center gap-2 min-w-0">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 hidden sm:block" aria-hidden="true" />
              <h2
                id="chat-info-title"
                className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
              >
                {thread.isGroup ? 'Group Information' : 'User Information'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat info"
            className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Full-Screen Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-5xl mx-auto w-full space-y-6">
          {actionError && (
            <p
              role="alert"
              className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3"
            >
              {actionError}
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: User / Group Identity Card */}
            <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 space-y-5">
              {thread.isGroup ? (
                <div className="w-full flex flex-col items-center text-center space-y-3.5">
                  <div className="relative">
                    <Avatar
                      src={thread.partnerAvatar}
                      name={thread.title}
                      size="xl"
                      online={status.isOnline}
                    />
                    <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-white dark:border-slate-900">
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </div>

                  {editingTitle ? (
                    <div className="w-full flex items-center gap-2">
                      <input
                        type="text"
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        maxLength={80}
                        aria-label="Edit group name"
                        className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleSaveTitle}
                        aria-label="Save group name"
                        className="min-h-[40px] px-3.5 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Save</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-1.5">
                        <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                          {thread.title}
                        </h3>
                        {iAmAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setTitleDraft(thread.title);
                              setEditingTitle(true);
                            }}
                            aria-label="Rename group"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {thread.memberIds.length} participants ·{' '}
                        <span
                          className={
                            status.isOnline
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : ''
                          }
                        >
                          {status.statusLabel}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full flex flex-col items-center text-center space-y-4">
                  <Avatar
                    src={matchedUser?.avatarUrl ?? thread.partnerAvatar}
                    name={matchedUser?.displayName || thread.title}
                    size="xl"
                    online={status.isOnline}
                  />
                  <div className="space-y-1 min-w-0 max-w-full">
                    <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white inline-flex items-center justify-center gap-1.5 max-w-full min-w-0">
                      <span className="truncate">{matchedUser?.displayName || thread.title}</span>
                      {matchedUser?.isVerified && <VerifiedBadge size={17} />}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {matchedUser?.handle || thread.partnerHandle ? (
                        <>@{matchedUser?.handle || thread.partnerHandle} · </>
                      ) : thread.isParticipantResolved === false ? (
                        <>Resolving profile... · </>
                      ) : null}
                      <span
                        className={
                          status.isOnline
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : ''
                        }
                      >
                        {status.statusLabel}
                      </span>
                    </p>
                    {matchedUser?.location && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center justify-center gap-1 pt-0.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{matchedUser.location}</span>
                      </p>
                    )}
                    {matchedUser?.accountType === 'business' && (
                      <p
                        data-testid="chat-info-business-meta"
                        className="text-xs font-medium text-blue-700 dark:text-blue-400 pt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
                      >
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Business Profile</span>
                        </span>
                        {matchedUser.businessCategory && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-600 dark:text-slate-300">
                              {matchedUser.businessCategory}
                            </span>
                          </>
                        )}
                        {isSafeExternalHttpUrl(matchedUser.businessWebsiteUrl) && (
                          <>
                            <span aria-hidden="true">·</span>
                            <a
                              href={matchedUser.businessWebsiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>Website</span>
                              <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                            </a>
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  {matchedUser?.bio && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm">
                      {matchedUser.bio}
                    </p>
                  )}

                  {matchedUser?.interests && matchedUser.interests.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {matchedUser.interests.join(' · ')}
                    </p>
                  )}

                  {partnerUid && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenPublicProfile(partnerUid);
                      }}
                      className="w-full min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <User className="w-4 h-4" aria-hidden="true" />
                      <span>View Public Profile</span>
                    </button>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Shield className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                <span>Protected by HTTPS/TLS &amp; Firebase Auth</span>
              </div>
            </div>

            {/* Right Column: Participants, Conversation Stats, Search & Alerts */}
            <div className="lg:col-span-7 space-y-5">
              {/* Group Participants Management */}
              {thread.isGroup && (
                <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider tabular-nums">
                      Participants ({thread.memberIds.length}/{MAX_GROUP_MEMBERS})
                    </p>
                    {iAmAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowAddMembers((prev) => !prev)}
                        disabled={atCapacity || availableToAdd.length === 0}
                        className="min-h-[36px] px-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{showAddMembers ? 'Done Adding' : 'Add Participant'}</span>
                      </button>
                    )}
                  </div>

                  {iAmAdmin && showAddMembers && (
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1">
                        {atCapacity
                          ? `Group limit reached (${MAX_GROUP_MEMBERS} members max)`
                          : availableToAdd.length === 0
                            ? 'All creators are already in this group.'
                            : 'Add creators to this group'}
                      </p>
                      {availableToAdd.map((candidate) => (
                        <div
                          key={candidate.uid}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              src={candidate.avatarUrl}
                              name={candidate.displayName}
                              size="sm"
                              online={isUserOnline(candidate.uid, onlineUserIds)}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1 max-w-full min-w-0">
                                <span className="truncate">{candidate.displayName}</span>
                                {candidate.isVerified && <VerifiedBadge size={12} />}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                @{candidate.handle}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={busyUid === candidate.uid || atCapacity}
                            onClick={() => handleAddSingle(candidate.uid)}
                            aria-label={`Add ${candidate.displayName} to group`}
                            className="min-h-[34px] px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 disabled:opacity-50 cursor-pointer"
                          >
                            {busyUid === candidate.uid ? 'Adding...' : 'Add'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                    {thread.memberIds.map((uid) => {
                      const isMe = uid === profile.uid;
                      const member = memberPool.find((u) => u.uid === uid);
                      const memberName = isMe
                        ? `${profile.displayName} (You)`
                        : member?.displayName || uid;
                      const online = isUserOnline(uid, onlineUserIds);
                      const targetIsAdmin = isGroupAdmin(thread, uid);
                      const canRemoveOrLeave = thread.memberIds.length > 1 && (isMe || iAmAdmin);
                      return (
                        <div
                          key={uid}
                          className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenPublicProfile(uid);
                            }}
                            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
                          >
                            <Avatar
                              src={isMe ? profile.avatarUrl : member?.avatarUrl || ''}
                              name={isMe ? profile.displayName : member?.displayName || uid}
                              size="sm"
                              online={online}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center gap-1.5">
                                <span className="truncate">{memberName}</span>
                                {(isMe ? profile.isVerified : member?.isVerified) && (
                                  <VerifiedBadge size={12} />
                                )}
                                {targetIsAdmin && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 shrink-0">
                                    Admin
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {member?.handle ? `@${member.handle}` : 'Member'}
                                {online ? ' · Online' : ''}
                              </p>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isMe && iAmAdmin && !targetIsAdmin && onPromoteAdmin && (
                              <button
                                type="button"
                                disabled={busyUid === uid}
                                onClick={() => handlePromote(uid)}
                                aria-label={`Make ${member?.displayName || uid} admin`}
                                className="min-h-[34px] px-2.5 rounded-lg border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50 cursor-pointer"
                              >
                                Make Admin
                              </button>
                            )}
                            {canRemoveOrLeave && (
                              <button
                                type="button"
                                disabled={busyUid === uid}
                                onClick={() => handleRemove(uid)}
                                aria-label={
                                  isMe
                                    ? 'Leave group'
                                    : `Remove ${member?.displayName || uid}`
                                }
                                className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
                              >
                                <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{isMe ? 'Leave' : 'Remove'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Conversation Statistics */}
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-3 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Conversation Details
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Messages</p>
                    <p className="font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {messages.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Started</p>
                    <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                      {formatRelativeTime(thread.createdAtMs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Participants</p>
                    <p className="font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {thread.memberIds.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Search in Conversation */}
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Message History
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSearch((prev) => !prev)}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{showSearch ? 'Hide Search' : 'Search in Conversation'}</span>
                  </button>
                </div>

                {showSearch && (
                  <div className="space-y-2.5 pt-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search messages..."
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                    {searchQuery.trim() && (
                      <div className="max-h-56 overflow-y-auto space-y-1.5">
                        {filteredMessages.length === 0 ? (
                          <p className="text-xs text-slate-400 py-2">
                            No matching messages found.
                          </p>
                        ) : (
                          filteredMessages.map((m) => {
                            const liveSender = memberPool.find((u) => u.uid === m.senderId);
                            return (
                              <div
                                key={m.id}
                                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs"
                              >
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {liveSender?.displayName || m.senderName}:
                                </span>{' '}
                                <span className="text-slate-600 dark:text-slate-300">
                                  {m.text}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Push Notifications & Mute Actions */}
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-3 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Notifications &amp; Preferences
                </p>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="w-full min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    {isMuted ? (
                      <BellOff className="w-4 h-4 text-amber-500" aria-hidden="true" />
                    ) : (
                      <Bell className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                    )}
                    <span>
                      {thread.isGroup ? 'Group Push Alerts' : 'Push Notifications'}
                    </span>
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {isMuted ? 'Muted' : 'Active'}
                  </span>
                </button>

                {!pushEnabled && (
                  <button
                    type="button"
                    onClick={() => void onEnablePush()}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Bell className="w-4 h-4" aria-hidden="true" />
                    <span>Enable Browser Push Notifications</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
