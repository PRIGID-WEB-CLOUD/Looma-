import { useMemo, useState } from 'react';
import {
  Edit3,
  ExternalLink,
  HardDrive,
  MessageSquare,
  PhoneOff,
  RefreshCw,
  Search,
  Trash2,
  UserMinus,
  Video,
} from 'lucide-react';
import type { ChatThread, UserProfile } from '../../src/types/social';
import { formatRelativeTime } from '../../src/utils/socialLogic';
import {
  formatStorageBytes,
  type AdminCallRoomSummary,
  type R2MediaObjectItem,
} from '../adminLogic';

interface CommsMediaOpsSectionProps {
  chats: ChatThread[];
  calls: AdminCallRoomSummary[];
  communityUsers: UserProfile[];
  r2Objects: R2MediaObjectItem[];
  r2TotalBytes: number;
  r2Loading: boolean;
  r2Error: string | null;
  onRenameChat: (
    chatId: string,
    nextTitle: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onRemoveChatMember: (
    chatId: string,
    targetUid: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteChat: (chatId: string) => Promise<{ ok: boolean; error?: string }>;
  onForceEndCall: (callId: string) => Promise<{ ok: boolean; error?: string }>;
  onLoadR2Objects: (prefix?: string) => Promise<void>;
  onDeleteR2Object: (key: string) => Promise<{ ok: boolean; error?: string }>;
}

export function CommsMediaOpsSection({
  chats,
  calls,
  communityUsers,
  r2Objects,
  r2TotalBytes,
  r2Loading,
  r2Error,
  onRenameChat,
  onRemoveChatMember,
  onDeleteChat,
  onForceEndCall,
  onLoadR2Objects,
  onDeleteR2Object,
}: CommsMediaOpsSectionProps) {
  const [subTab, setSubTab] = useState<'chats' | 'calls' | 'storage'>('chats');
  const [chatSearch, setChatSearch] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatTitle, setEditingChatTitle] = useState('');
  const [confirmDeleteChatId, setConfirmDeleteChatId] = useState<string | null>(null);

  const [callFilter, setCallFilter] = useState<'all' | 'active' | 'ended'>('all');
  const [storageSearch, setStorageSearch] = useState('');
  const [storagePrefix, setStoragePrefix] = useState('');
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const userLookup = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of communityUsers) {
      map.set(u.uid, u);
    }
    return map;
  }, [communityUsers]);

  const filteredChats = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return [...chats]
      .filter((c) => {
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.lastMessageText || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }, [chatSearch, chats]);

  const filteredCalls = useMemo(() => {
    return [...calls]
      .filter((c) => {
        if (callFilter === 'active') return c.status === 'active' || c.status === 'ringing';
        if (callFilter === 'ended') return c.status === 'ended';
        return true;
      })
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }, [callFilter, calls]);

  const filteredObjects = useMemo(() => {
    const q = storageSearch.trim().toLowerCase();
    if (!q) return r2Objects;
    return r2Objects.filter(
      (obj) =>
        obj.key.toLowerCase().includes(q) ||
        obj.ownerUid.toLowerCase().includes(q) ||
        obj.folder.toLowerCase().includes(q)
    );
  }, [r2Objects, storageSearch]);

  const handleRenameSubmit = async (chatId: string) => {
    setBusyId(chatId);
    setFeedback(null);
    const res = await onRenameChat(chatId, editingChatTitle);
    setBusyId(null);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Could not rename thread.' });
      return;
    }
    setEditingChatId(null);
    setEditingChatTitle('');
    setFeedback({ type: 'ok', text: 'Conversation title updated.' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Chats, Calls &amp; Media Storage
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Moderate group chat metadata while keeping private DMs confidential, terminate active WebRTC rooms, and inspect Cloudflare R2 media objects.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start">
          <button
            type="button"
            onClick={() => setSubTab('chats')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap ${
              subTab === 'chats'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Chats ({chats.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('calls')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap ${
              subTab === 'calls'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Calls ({calls.filter((c) => c.status !== 'ended').length} active)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('storage');
              if (r2Objects.length === 0 && !r2Loading) {
                void onLoadR2Objects(storagePrefix);
              }
            }}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap ${
              subTab === 'storage'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
            <span>R2 Storage ({r2Objects.length})</span>
          </button>
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

      {subTab === 'chats' && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search chat threads"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search title, ID, or snippet"
              className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredChats.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No chat threads found matching your filter.
              </div>
            ) : (
              filteredChats.map((chat) => {
                const isEditing = editingChatId === chat.id;
                const confirmingDelete = confirmDeleteChatId === chat.id;

                return (
                  <article key={chat.id} className="p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-sm text-slate-900 dark:text-white">
                            {chat.title}
                          </span>
                          <span className="font-mono uppercase font-semibold text-blue-600 dark:text-blue-400">
                            {chat.isGroup ? 'GROUP' : 'DIRECT'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {chat.memberIds.length} participants
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatRelativeTime(chat.updatedAtMs)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[68ch]">
                          Last preview: {chat.lastMessageText || 'No messages yet'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingChatId(null);
                            } else {
                              setEditingChatId(chat.id);
                              setEditingChatTitle(chat.title);
                            }
                          }}
                          className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isEditing ? 'Cancel Edit' : 'Rename'}</span>
                        </button>

                        {confirmingDelete ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busyId === chat.id}
                              onClick={async () => {
                                setBusyId(chat.id);
                                const res = await onDeleteChat(chat.id);
                                setBusyId(null);
                                setConfirmDeleteChatId(null);
                                setFeedback(
                                  res.ok
                                    ? { type: 'ok', text: `Deleted thread ${chat.title}.` }
                                    : { type: 'err', text: res.error || 'Delete failed.' }
                                );
                              }}
                              className="min-h-[36px] px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteChatId(null)}
                              className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteChatId(chat.id)}
                            className="min-h-[36px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Delete Thread</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <input
                          type="text"
                          value={editingChatTitle}
                          onChange={(e) => setEditingChatTitle(e.target.value)}
                          placeholder="Updated conversation title"
                          maxLength={80}
                          className="flex-1 min-w-[200px] min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          disabled={busyId === chat.id || !editingChatTitle.trim()}
                          onClick={() => void handleRenameSubmit(chat.id)}
                          className="min-h-[38px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Save Title
                        </button>
                      </div>
                    )}

                    {/* Participant chips with moderation remove action */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                        Members:
                      </span>
                      {chat.memberIds.map((uid) => {
                        const member = userLookup.get(uid);
                        const label = member ? `${member.displayName} (@${member.handle})` : uid;
                        return (
                          <div
                            key={uid}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
                          >
                            <span className="truncate max-w-[160px]">{label}</span>
                            {chat.isGroup && chat.memberIds.length > 1 && (
                              <button
                                type="button"
                                disabled={busyId === `${chat.id}:${uid}`}
                                aria-label={`Remove ${label} from ${chat.title}`}
                                onClick={async () => {
                                  setBusyId(`${chat.id}:${uid}`);
                                  const res = await onRemoveChatMember(chat.id, uid);
                                  setBusyId(null);
                                  setFeedback(
                                    res.ok
                                      ? { type: 'ok', text: `Removed ${label} from ${chat.title}.` }
                                      : { type: 'err', text: res.error || 'Could not remove member.' }
                                  );
                                }}
                                className="text-red-600 dark:text-red-400 hover:text-red-700 cursor-pointer"
                              >
                                <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}

      {subTab === 'calls' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter call rooms by status"
              value={callFilter}
              onChange={(e) => setCallFilter(e.target.value as 'all' | 'active' | 'ended')}
              className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
            >
              <option value="all">All Call Rooms ({calls.length})</option>
              <option value="active">Active &amp; Ringing</option>
              <option value="ended">Ended</option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredCalls.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No call rooms match the selected filter.
              </div>
            ) : (
              filteredCalls.map((call) => (
                <div
                  key={call.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">
                        {call.title}
                      </span>
                      <span
                        className={`font-mono uppercase font-bold ${
                          call.status === 'active'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : call.status === 'ringing'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {call.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        {call.isAudioOnly ? 'Audio Call' : 'Video Call'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {call.memberIds.length} participants
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                      Started by {call.callerName} · {formatRelativeTime(call.updatedAtMs)}
                    </p>
                  </div>

                  {call.status !== 'ended' && (
                    <button
                      type="button"
                      disabled={busyId === call.id}
                      onClick={async () => {
                        setBusyId(call.id);
                        const res = await onForceEndCall(call.id);
                        setBusyId(null);
                        setFeedback(
                          res.ok
                            ? { type: 'ok', text: `Ended call room "${call.title}".` }
                            : { type: 'err', text: res.error || 'Could not terminate call.' }
                        );
                      }}
                      className="min-h-[38px] px-3.5 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <PhoneOff className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Force End Call</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {subTab === 'storage' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
              <span className="text-slate-700 dark:text-slate-200 font-semibold">
                {r2Objects.length} objects
              </span>
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                Total size: {formatStorageBytes(r2TotalBytes)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter R2 folder prefix"
                value={storagePrefix}
                onChange={(e) => {
                  const next = e.target.value;
                  setStoragePrefix(next);
                  void onLoadR2Objects(next);
                }}
                className="min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <option value="">All Folders</option>
                <option value="uploads/">uploads/</option>
                <option value="avatars/">avatars/</option>
                <option value="posts/">posts/</option>
                <option value="stories/">stories/</option>
                <option value="voice/">voice/</option>
              </select>

              <div className="relative flex-1 sm:flex-initial">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search R2 media objects"
                  value={storageSearch}
                  onChange={(e) => setStorageSearch(e.target.value)}
                  placeholder="Filter by key or UID"
                  className="w-full sm:w-52 min-h-[38px] pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <button
                type="button"
                disabled={r2Loading}
                onClick={() => void onLoadR2Objects(storagePrefix)}
                className="min-h-[38px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${r2Loading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{r2Loading ? 'Refreshing...' : 'Refresh Bucket'}</span>
              </button>
            </div>
          </div>

          {r2Error && (
            <div
              role="alert"
              className="rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-800 dark:text-amber-300"
            >
              {r2Error}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredObjects.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {r2Loading
                  ? 'Loading Cloudflare R2 bucket contents...'
                  : 'No R2 storage objects found. Click Refresh Bucket to query Cloudflare R2.'}
              </div>
            ) : (
              filteredObjects.map((item) => {
                const confirming = confirmDeleteKey === item.key;
                return (
                  <div
                    key={item.key}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {item.key}
                      </p>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatStorageBytes(item.size)} · folder: {item.folder} · owner:{' '}
                        {item.ownerUid}
                        {item.lastModified
                          ? ` · ${formatRelativeTime(Date.parse(item.lastModified) || Date.now())}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Inspect</span>
                      </a>

                      {confirming ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === item.key}
                            onClick={async () => {
                              setBusyId(item.key);
                              const res = await onDeleteR2Object(item.key);
                              setBusyId(null);
                              setConfirmDeleteKey(null);
                              setFeedback(
                                res.ok
                                  ? { type: 'ok', text: `Deleted R2 object ${item.key}.` }
                                  : { type: 'err', text: res.error || 'Could not delete object.' }
                              );
                            }}
                            className="min-h-[36px] px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(null)}
                            className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKey(item.key)}
                          className="min-h-[36px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
