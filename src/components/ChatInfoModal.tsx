import { useState } from 'react';
import { BellOff, Info, Search, Shield, User, X } from 'lucide-react';
import type { ChatMessage, ChatThread, UserProfile } from '../types/social';
import { formatRelativeTime, getThreadOnlineStatus } from '../utils/socialLogic';
import { SEED_CREATORS } from '../services/seedData';
import { Avatar } from './Avatar';

interface ChatInfoModalProps {
  open: boolean;
  thread: ChatThread;
  profile: UserProfile;
  messages: ChatMessage[];
  onlineUserIds: string[];
  communityUsers: UserProfile[];
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
  onClose,
  onOpenPublicProfile,
}: ChatInfoModalProps) {
  const [muted, setMuted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  if (!open) return null;

  const status = getThreadOnlineStatus(thread, profile.uid, onlineUserIds);
  const partnerUid = thread.memberIds.find((id) => id !== profile.uid) || thread.memberIds[0];
  const matchedUser =
    communityUsers.find((u) => u.uid === partnerUid) ||
    SEED_CREATORS.find((u) => u.uid === partnerUid);

  const filteredMessages = showSearch && searchQuery.trim()
    ? messages.filter((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-info-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 id="chat-info-title" className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Chat Information
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

        {/* Profile Card / Participant Info (Clickable to profile for 1:1 chats) */}
        {thread.isGroup ? (
          <div className="w-full flex flex-col items-center text-center space-y-3 pt-2">
            <Avatar
              src={thread.partnerAvatar}
              name={thread.title}
              size="xl"
              online={status.isOnline}
            />
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {thread.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {thread.partnerHandle} ·{' '}
                <span className={status.isOnline ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                  {status.statusLabel}
                </span>
              </p>
            </div>
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
                <span className={status.isOnline ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
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

        {/* Members list for group chats */}
        {thread.isGroup && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Members ({thread.memberIds.length})
            </p>
            <div className="space-y-1">
              {thread.memberIds.map((uid) => {
                const isMe = uid === profile.uid;
                const member = communityUsers.find((u) => u.uid === uid) || SEED_CREATORS.find((u) => u.uid === uid);
                return (
                  <button
                    key={uid}
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPublicProfile(uid);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={member?.avatarUrl || ''} name={member?.displayName || uid} size="sm" />
                      <span className="text-xs font-medium text-slate-900 dark:text-white truncate">
                        {isMe ? `${profile.displayName} (You)` : member?.displayName || uid}
                      </span>
                    </div>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 shrink-0">View</span>
                  </button>
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
              <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{messages.length}</span>
            </div>
            <div>
              <span className="text-slate-500">Started:</span>{' '}
              <span className="font-semibold text-slate-900 dark:text-white">{formatRelativeTime(thread.createdAtMs)}</span>
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
                    <p className="text-xs text-slate-400 py-2">No matching messages found.</p>
                  ) : (
                    filteredMessages.map((m) => (
                      <div key={m.id} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white">{m.senderName}:</span>{' '}
                        <span className="text-slate-600 dark:text-slate-300">{m.text}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setMuted((prev) => !prev)}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <BellOff className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span>Mute Notifications</span>
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">{muted ? 'On' : 'Off'}</span>
          </button>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 justify-center pt-2">
            <Shield className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
            <span>End-to-end encrypted chat</span>
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
