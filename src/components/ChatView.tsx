import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  BellOff,
  Check,
  Info,
  MessageSquarePlus,
  Send,
  UserPlus,
  Users,
} from 'lucide-react';
import type { ChatMessage, ChatThread, UserProfile } from '../types/social';
import {
  formatRelativeTime,
  getThreadOnlineStatus,
  isUserOnline,
  MAX_GROUP_MEMBERS,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { ChatInfoModal } from './ChatInfoModal';

interface ChatViewProps {
  profile: UserProfile;
  threads: ChatThread[];
  messagesByChat: Record<string, ChatMessage[]>;
  mutedChatIds: string[];
  pushEnabled: boolean;
  onlineUserIds: string[];
  communityUsers: UserProfile[];
  initialThreadId?: string | null;
  onSubscribeThread: (chatId: string) => () => void;
  onSendMessage: (thread: ChatThread, text: string) => Promise<void>;
  onStartDirectThread: (creator: UserProfile) => Promise<ChatThread>;
  onCreateGroupThread: (
    title: string,
    participantIds: string[]
  ) => Promise<ChatThread>;
  onAddParticipants: (
    chatId: string,
    participantIds: string[]
  ) => Promise<void>;
  onRemoveParticipant: (chatId: string, targetUid: string) => Promise<void>;
  onRenameGroup: (chatId: string, nextTitle: string) => Promise<void>;
  onToggleMuteChat: (chatId: string) => void;
  onEnablePush: () => Promise<unknown>;
  onOpenPublicProfile: (uid: string) => void;
}

export function ChatView({
  profile,
  threads,
  messagesByChat,
  mutedChatIds,
  pushEnabled,
  onlineUserIds,
  communityUsers,
  initialThreadId,
  onSubscribeThread,
  onSendMessage,
  onStartDirectThread,
  onCreateGroupThread,
  onAddParticipants,
  onRemoveParticipant,
  onRenameGroup,
  onToggleMuteChat,
  onEnablePush,
  onOpenPublicProfile,
}: ChatViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialThreadId || threads[0]?.id || null
  );
  const [mobileShowThread, setMobileShowThread] = useState(
    Boolean(initialThreadId)
  );
  const [draft, setDraft] = useState('');
  const [showNewPicker, setShowNewPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'direct' | 'group'>('direct');
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const activeThread =
    threads.find((t) => t.id === selectedId) || threads[0] || null;
  const activeMessages = activeThread
    ? messagesByChat[activeThread.id] || []
    : [];
  const activeStatus = activeThread
    ? getThreadOnlineStatus(activeThread, profile.uid, onlineUserIds)
    : null;
  const activeThreadMuted = activeThread
    ? mutedChatIds.includes(activeThread.id)
    : false;
  const selfOnline = isUserOnline(profile.uid, onlineUserIds);
  const otherCreators = communityUsers.filter((u) => u.uid !== profile.uid);
  const onlineCreators = otherCreators.filter((u) =>
    isUserOnline(u.uid, onlineUserIds)
  );

  useEffect(() => {
    if (initialThreadId) {
      setSelectedId(initialThreadId);
      setMobileShowThread(true);
    }
  }, [initialThreadId]);

  useEffect(() => {
    if (!activeThread) return;
    return onSubscribeThread(activeThread.id);
  }, [activeThread, onSubscribeThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeThread?.id]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeThread || !draft.trim()) return;
    const text = draft;
    setDraft('');
    await onSendMessage(activeThread, text);
  };

  const handlePickCreator = async (creator: UserProfile) => {
    const thread = await onStartDirectThread(creator);
    setSelectedId(thread.id);
    setMobileShowThread(true);
    setShowNewPicker(false);
  };

  const toggleGroupParticipant = (uid: string) => {
    setGroupError(null);
    setSelectedGroupIds((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }
      if (prev.length >= MAX_GROUP_MEMBERS - 1) {
        setGroupError(`Groups support up to ${MAX_GROUP_MEMBERS} total participants.`);
        return prev;
      }
      return [...prev, uid];
    });
  };

  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    setGroupError(null);
    setCreatingGroup(true);
    try {
      const created = await onCreateGroupThread(groupTitle, selectedGroupIds);
      setSelectedId(created.id);
      setMobileShowThread(true);
      setGroupTitle('');
      setSelectedGroupIds([]);
      setShowNewPicker(false);
      setPickerMode('direct');
    } catch (err) {
      setGroupError(
        err instanceof Error ? err.message : 'Could not create group chat.'
      );
    } finally {
      setCreatingGroup(false);
    }
  };

  return (
    <section
      aria-label="Real-time messaging"
      className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[560px] md:h-[calc(100vh-140px)]"
    >
      {/* Conversation List */}
      <div
        className={`md:col-span-4 border-r border-slate-200 dark:border-slate-800 flex flex-col ${
          mobileShowThread ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div
          data-testid="messenger-header"
          className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar
                src={profile.avatarUrl}
                name={profile.displayName}
                size="md"
                online={selfOnline}
              />
              <div className="min-w-0">
                <h1 className="font-display text-base font-bold truncate">
                  Messages
                </h1>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 truncate">
                  {selfOnline ? 'Online' : 'Offline'} · @{profile.handle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setPickerMode('group');
                  setShowNewPicker((prev) =>
                    prev && pickerMode === 'group' ? false : true
                  );
                }}
                aria-label="New group chat"
                className="min-h-[38px] px-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/60 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Group</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickerMode('direct');
                  setShowNewPicker((prev) =>
                    prev && pickerMode === 'direct' ? false : true
                  );
                }}
                aria-label="Start new chat"
                className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New</span>
              </button>
            </div>
          </div>

          {onlineCreators.length > 0 && (
            <div className="pt-1">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Active now ({onlineCreators.length})
              </p>
              <div className="flex items-center gap-3 overflow-x-auto pb-0.5">
                {onlineCreators.map((person) => {
                  const firstName =
                    person.displayName.split(' ')[0] || person.displayName;
                  return (
                    <button
                      key={person.uid}
                      type="button"
                      onClick={() => handlePickCreator(person)}
                      aria-label={`Chat with ${person.displayName} (Online)`}
                      className="flex flex-col items-center gap-1 shrink-0 w-12 cursor-pointer group"
                    >
                      <Avatar
                        src={person.avatarUrl}
                        name={person.displayName}
                        size="sm"
                        online={true}
                      />
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-full group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {firstName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {showNewPicker && (
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-3">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setPickerMode('direct');
                  setGroupError(null);
                }}
                className={`min-h-[34px] rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  pickerMode === 'direct'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Direct Message
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickerMode('group');
                  setGroupError(null);
                }}
                className={`min-h-[34px] rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  pickerMode === 'group'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                New Group
              </button>
            </div>

            {pickerMode === 'direct' ? (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
                  Message a member
                </p>
                {otherCreators.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 px-1 py-2">
                    No other members available yet.
                  </p>
                ) : (
                  otherCreators.map((creator) => {
                    const online = isUserOnline(creator.uid, onlineUserIds);
                    return (
                      <button
                        key={creator.uid}
                        type="button"
                        onClick={() => handlePickCreator(creator)}
                        className="w-full min-h-[44px] px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer"
                      >
                        <Avatar
                          src={creator.avatarUrl}
                          name={creator.displayName}
                          size="sm"
                          online={online}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {creator.displayName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            @{creator.handle}
                            {online ? ' · Online' : ''}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <form onSubmit={handleCreateGroup} className="space-y-2.5">
                <div>
                  <label htmlFor="new-group-title" className="sr-only">
                    Group name
                  </label>
                  <input
                    id="new-group-title"
                    type="text"
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder="Group name (e.g., Studio Design Crit)"
                    maxLength={80}
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1">
                    Select participants ({selectedGroupIds.length + 1}/
                    {MAX_GROUP_MEMBERS})
                  </p>
                  {otherCreators.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 px-1 py-2">
                      No other members available yet.
                    </p>
                  ) : (
                    otherCreators.map((creator) => {
                      const selected = selectedGroupIds.includes(creator.uid);
                      const online = isUserOnline(creator.uid, onlineUserIds);
                      return (
                        <button
                          key={creator.uid}
                          type="button"
                          onClick={() => toggleGroupParticipant(creator.uid)}
                          aria-pressed={selected}
                          className={`w-full min-h-[42px] px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-left transition-colors cursor-pointer border ${
                            selected
                              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
                              : 'bg-white/70 dark:bg-slate-900/70 border-transparent hover:bg-white dark:hover:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar
                              src={creator.avatarUrl}
                              name={creator.displayName}
                              size="sm"
                              online={online}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">
                                {creator.displayName}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                @{creator.handle}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                              selected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {selected && (
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {groupError && (
                  <p
                    role="alert"
                    className="text-xs font-medium text-red-600 dark:text-red-400 px-1"
                  >
                    {groupError}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={creatingGroup}
                    className="flex-1 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{creatingGroup ? 'Creating...' : 'Create Group'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewPicker(false);
                      setGroupError(null);
                    }}
                    className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
          {threads.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No conversations yet.
            </div>
          ) : null}
          {threads.map((thread) => {
            const active = activeThread?.id === thread.id;
            const muted = mutedChatIds.includes(thread.id);
            const threadStatus = getThreadOnlineStatus(
              thread,
              profile.uid,
              onlineUserIds
            );
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  setSelectedId(thread.id);
                  setMobileShowThread(true);
                }}
                className={`w-full p-3.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-50/70 dark:bg-blue-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="relative shrink-0">
                  <Avatar
                    src={thread.partnerAvatar}
                    name={thread.title}
                    size="md"
                    online={threadStatus.isOnline}
                  />
                  {thread.isGroup && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center border border-white dark:border-slate-900"
                    >
                      <Users className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      <span className="truncate">{thread.title}</span>
                      {muted && (
                        <BellOff
                          className="w-3 h-3 text-slate-400 shrink-0"
                          aria-label="Muted"
                        />
                      )}
                    </p>
                    <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                      {formatRelativeTime(thread.updatedAtMs)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {thread.isGroup && (
                      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mr-1.5">
                        {thread.memberIds.length} members ·
                      </span>
                    )}
                    {thread.lastMessageText || 'No messages yet'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Message Thread */}
      <div
        className={`md:col-span-8 flex flex-col ${
          mobileShowThread ? 'flex' : 'hidden md:flex'
        }`}
      >
        {activeThread ? (
          <>
            <div
              data-testid="active-thread-header"
              className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3"
            >
              <button
                type="button"
                onClick={() => setMobileShowThread(false)}
                aria-label="Back to conversations"
                className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              </button>
              <Avatar
                src={activeThread.partnerAvatar}
                name={activeThread.title}
                size="md"
                online={Boolean(activeStatus?.isOnline)}
              />
              <div className="min-w-0">
                <h2 className="font-display text-sm font-bold truncate flex items-center gap-1.5">
                  <span className="truncate">{activeThread.title}</span>
                  {activeThreadMuted && (
                    <BellOff
                      className="w-3.5 h-3.5 text-amber-500 shrink-0"
                      aria-label="Notifications muted"
                    />
                  )}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>
                    {activeThread.isGroup
                      ? `${activeThread.memberIds.length} participants`
                      : `@${activeThread.partnerHandle}`}
                  </span>
                  {activeStatus && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          activeStatus.isOnline
                            ? 'font-medium text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {activeStatus.statusLabel}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                {activeThread.isGroup && (
                  <button
                    type="button"
                    onClick={() => setShowChatInfo(true)}
                    aria-label="Manage group participants"
                    className="min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Members</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowChatInfo(true)}
                  aria-label="Chat information"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Info className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <ChatInfoModal
              open={showChatInfo}
              thread={activeThread}
              profile={profile}
              messages={activeMessages}
              onlineUserIds={onlineUserIds}
              communityUsers={communityUsers}
              isMuted={activeThreadMuted}
              pushEnabled={pushEnabled}
              onToggleMute={() => onToggleMuteChat(activeThread.id)}
              onEnablePush={onEnablePush}
              onAddParticipants={onAddParticipants}
              onRemoveParticipant={onRemoveParticipant}
              onRenameGroup={onRenameGroup}
              onClose={() => setShowChatInfo(false)}
              onOpenPublicProfile={onOpenPublicProfile}
            />

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
              {activeMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  Send a message to start this real-time thread.
                </div>
              ) : (
                activeMessages.map((msg) => {
                  const mine = msg.senderId === profile.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-end gap-2 ${
                        mine ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {!mine && (
                        <Avatar
                          src={msg.senderAvatar}
                          name={msg.senderName}
                          size="sm"
                        />
                      )}
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                          mine
                            ? 'bg-blue-600 text-white dark:bg-blue-500'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {!mine && activeThread.isGroup && (
                          <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5">
                            {msg.senderName}
                          </p>
                        )}
                        <p className="leading-relaxed">{msg.text}</p>
                        <p
                          className={`text-[10px] mt-1 tabular-nums ${
                            mine
                              ? 'text-blue-100'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {formatRelativeTime(msg.createdAtMs)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-slate-900"
            >
              <label htmlFor="chat-message-input" className="sr-only">
                Type a message
              </label>
              <input
                id="chat-message-input"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${activeThread.title}...`}
                maxLength={1000}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                aria-label="Send message"
                className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white text-sm font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
            Select a conversation to begin messaging.
          </div>
        )}
      </div>
    </section>
  );
}
