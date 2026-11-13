import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Info, MessageSquarePlus, Send } from 'lucide-react';
import type { ChatMessage, ChatThread, UserProfile } from '../types/social';
import {
  formatRelativeTime,
  getThreadOnlineStatus,
  isUserOnline,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { ChatInfoModal } from './ChatInfoModal';

interface ChatViewProps {
  profile: UserProfile;
  threads: ChatThread[];
  messagesByChat: Record<string, ChatMessage[]>;
  onlineUserIds: string[];
  communityUsers: UserProfile[];
  initialThreadId?: string | null;
  onSubscribeThread: (chatId: string) => () => void;
  onSendMessage: (thread: ChatThread, text: string) => Promise<void>;
  onStartDirectThread: (creator: UserProfile) => Promise<ChatThread>;
  onOpenPublicProfile: (uid: string) => void;
}

export function ChatView({
  profile,
  threads,
  messagesByChat,
  onlineUserIds,
  communityUsers,
  initialThreadId,
  onSubscribeThread,
  onSendMessage,
  onStartDirectThread,
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
  const selfOnline = isUserOnline(profile.uid, onlineUserIds);
  const onlineCreators = communityUsers.filter(
    (u) => u.uid !== profile.uid && isUserOnline(u.uid, onlineUserIds)
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
            <button
              type="button"
              onClick={() => setShowNewPicker((prev) => !prev)}
              aria-label="Start new chat"
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" aria-hidden="true" />
              <span>New</span>
            </button>
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
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
              Message a creator
            </p>
            {communityUsers
              .filter((creator) => creator.uid !== profile.uid)
              .map((creator) => {
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
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
          {threads.map((thread) => {
            const active = activeThread?.id === thread.id;
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
                <Avatar
                  src={thread.partnerAvatar}
                  name={thread.title}
                  size="md"
                  online={threadStatus.isOnline}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">
                      {thread.title}
                    </p>
                    <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                      {formatRelativeTime(thread.updatedAtMs)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
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
                <h2 className="font-display text-sm font-bold truncate">
                  {activeThread.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>
                    {activeThread.isGroup
                      ? activeThread.partnerHandle
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
              <button
                type="button"
                onClick={() => setShowChatInfo(true)}
                aria-label="Chat information"
                className="ml-auto min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Info className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <ChatInfoModal
              open={showChatInfo}
              thread={activeThread}
              profile={profile}
              messages={activeMessages}
              onlineUserIds={onlineUserIds}
              communityUsers={communityUsers}
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
