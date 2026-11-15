import { useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  Info,
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
  isUserOnline,
  MAX_GROUP_MEMBERS,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';

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
  const partnerUid =
    thread.memberIds.find((id) => id !== profile.uid) || thread.memberIds[0];
  const matchedUser = communityUsers.find((u) => u.uid === partnerUid);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2
              id="chat-info-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-white"
            >
              {thread.isGroup ? 'Group Information' : 'Chat Information'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat info"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Profile / Group Summary */}
        {thread.isGroup ? (
          <div className="w-full flex flex-col items-center text-center space-y-3 pt-1">
            <div className="relative">
              <Avatar
                src={thread.partnerAvatar}
                name={thread.title}
                size="xl"
                online={status.isOnline}
              />
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-white dark:border-slate-900">
                <Users className="w-3 h-3" aria-hidden="true" />
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
                  className="flex-1 min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  aria-label="Save group name"
                  className="min-h-[38px] px-3 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Save</span>
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-center gap-1.5">
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
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
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
          <button
            type="button"
            onClick={() => {
              if (partnerUid) {
                onClose();
                onOpenPublicProfile(partnerUid);
              }
            }}
            className="w-full flex flex-col items-center text-center space-y-3 pt-2 cursor-pointer group"
          >
            <Avatar
              src={thread.partnerAvatar}
              name={thread.title}
              size="xl"
              online={status.isOnline}
            />
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {thread.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                @{thread.partnerHandle} ·{' '}
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

            {matchedUser?.bio && (
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs leading-relaxed">
                {matchedUser.bio}
              </p>
            )}

            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 mt-1">
              <User className="w-3.5 h-3.5" aria-hidden="true" />
              <span>View Public Profile</span>
            </span>
          </button>
        )}

        {actionError && (
          <p
            role="alert"
            className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2"
          >
            {actionError}
          </p>
        )}

        {/* Group Participants Management */}
        {thread.isGroup && (
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Participants ({thread.memberIds.length}/{MAX_GROUP_MEMBERS})
              </p>
              {iAmAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddMembers((prev) => !prev)}
                  disabled={atCapacity || availableToAdd.length === 0}
                  className="min-h-[32px] px-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{showAddMembers ? 'Done Adding' : 'Add Participant'}</span>
                </button>
              )}
            </div>

            {iAmAdmin && showAddMembers && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 space-y-1.5">
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
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        src={candidate.avatarUrl}
                        name={candidate.displayName}
                        size="sm"
                        online={isUserOnline(candidate.uid, onlineUserIds)}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate text-slate-900 dark:text-white">
                          {candidate.displayName}
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
                      className="min-h-[32px] px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 disabled:opacity-50 cursor-pointer"
                    >
                      {busyUid === candidate.uid ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
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
                    className="w-full flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80"
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
                        src={member?.avatarUrl || ''}
                        name={member?.displayName || uid}
                        size="sm"
                        online={online}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center gap-1.5">
                          <span className="truncate">{memberName}</span>
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
                          className="min-h-[32px] px-2 rounded-lg border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50 cursor-pointer"
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
                          className="min-h-[32px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
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
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 space-y-2 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Conversation Details
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500">Messages:</span>{' '}
              <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                {messages.length}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Started:</span>{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {formatRelativeTime(thread.createdAtMs)}
              </span>
            </div>
          </div>
        </div>

        {/* Search in Conversation */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
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
            <div className="space-y-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
              {searchQuery.trim() && (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {filteredMessages.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">
                      No matching messages found.
                    </p>
                  ) : (
                    filteredMessages.map((m) => (
                      <div
                        key={m.id}
                        className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs"
                      >
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {m.senderName}:
                        </span>{' '}
                        <span className="text-slate-600 dark:text-slate-300">
                          {m.text}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Push Notifications & Mute Actions */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onToggleMute}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
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
              className="w-full min-h-[40px] px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Enable Browser Push Notifications</span>
            </button>
          )}

          <div className="flex items-center gap-2 text-[11px] text-slate-400 justify-center pt-1">
            <Shield className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
            <span>Protected by HTTPS/TLS &amp; Firebase Auth</span>
          </div>
        </div>

        {/* Footer Close */}
        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}
