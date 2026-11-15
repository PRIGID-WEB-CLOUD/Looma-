import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  BellOff,
  Check,
  CheckCheck,
  ExternalLink,
  Globe,
  Info,
  MapPin,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  MicOff,
  Pause,
  Phone,
  Play,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { ChatMessage, ChatThread, UserProfile } from '../types/social';
import {
  extractFirstUrl,
  filterUsersByQuery,
  formatGifMessage,
  formatRelativeTime,
  formatVoiceNote,
  getThreadOnlineStatus,
  isUserOnline,
  MAX_GROUP_MEMBERS,
  parseGifMessage,
  parseRichUrl,
  parseVoiceNote,
  type CuratedGif,
} from '../utils/socialLogic';
import { uploadMediaToCloudflareR2 } from '../services/storage';
import { Avatar } from './Avatar';
import { ChatInfoModal } from './ChatInfoModal';
import { GifPickerModal } from './GifPickerModal';

interface ChatViewProps {
  profile: UserProfile;
  threads: ChatThread[];
  messagesByChat: Record<string, ChatMessage[]>;
  mutedChatIds: string[];
  pushEnabled: boolean;
  onlineUserIds: string[];
  communityUsers: UserProfile[];
  chatUsers?: UserProfile[];
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
  onPromoteAdmin?: (chatId: string, targetUid: string) => Promise<void>;
  onToggleMuteChat: (chatId: string) => void;
  onEnablePush: () => Promise<unknown>;
  onOpenPublicProfile: (uid: string) => void;
  onStartCall: (thread: ChatThread, isAudioOnly: boolean) => void;
  onStartInstantCall: (title: string, isAudioOnly: boolean) => void;
}

function VoiceNoteBubble({
  url,
  durationSec,
  mine,
}: {
  url: string;
  durationSec: number;
  mine: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSec || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const formatSec = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 py-1 min-w-[200px] sm:min-w-[240px]">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && (!durationSec || durationSec === 0)) {
            setDuration(Math.round(audioRef.current.duration) || 0);
          }
        }}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice memo' : 'Play voice memo'}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition shadow-sm cursor-pointer ${
          mine
            ? 'bg-white text-blue-600 hover:bg-blue-50'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform Visualization Bars */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
        <div className="flex items-center gap-0.5 h-6">
          {[40, 75, 30, 85, 60, 100, 45, 90, 75, 50, 80, 65, 35, 95, 55, 70, 85, 40].map(
            (h, i) => {
              const progress = duration > 0 ? currentTime / duration : 0;
              const barProgress = i / 18;
              const isPassed = progress >= barProgress;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-all duration-150 ${
                    mine
                      ? isPassed
                        ? 'bg-white'
                        : 'bg-white/40'
                      : isPassed
                        ? 'bg-blue-600 dark:bg-blue-400'
                        : 'bg-slate-300 dark:bg-slate-700'
                  } ${isPlaying ? 'animate-pulse' : ''}`}
                  style={{ height: `${Math.max(15, h)}%` }}
                />
              );
            }
          )}
        </div>
        <div
          className={`flex items-center justify-between text-[11px] font-medium tabular-nums ${
            mine ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <span>{formatSec(isPlaying ? currentTime : duration)}</span>
          <span className="text-[10px] opacity-75">Voice note</span>
        </div>
      </div>
    </div>
  );
}

function GifBubble({
  url,
  caption,
  mine,
}: {
  url: string;
  caption?: string;
  mine: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="rounded-xl overflow-hidden max-w-[280px] sm:max-w-[320px] bg-black/10">
        <img
          src={url}
          alt={caption || 'Animated GIF'}
          loading="lazy"
          className="w-full h-auto max-h-64 object-cover"
        />
      </div>
      {caption && (
        <p
          className={`text-sm ${
            mine ? 'text-white' : 'text-slate-900 dark:text-slate-100'
          } break-words`}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

function ChatLinkCard({ url, mine }: { url: string; mine: boolean }) {
  const parsed = useMemo(() => parseRichUrl(url), [url]);
  if (!parsed || parsed.kind !== 'link') return null;

  return (
    <a
      href={parsed.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 block rounded-xl p-2.5 border transition ${
        mine
          ? 'bg-blue-700/60 border-blue-500/50 hover:bg-blue-700 text-white'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-100'
      }`}
    >
      <div className="flex items-center justify-between gap-1.5 text-[11px] opacity-80 mb-1">
        <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider truncate">
          <Globe className="w-3 h-3" />
          {parsed.hostname}
        </span>
        <ExternalLink className="w-3 h-3 shrink-0" />
      </div>
      <p className="text-xs font-semibold truncate">{parsed.displayTitle}</p>
      <p className="text-[11px] opacity-70 truncate mt-0.5">{parsed.url}</p>
    </a>
  );
}

export function ChatView({
  profile,
  threads,
  messagesByChat,
  mutedChatIds,
  pushEnabled,
  onlineUserIds,
  communityUsers,
  chatUsers,
  initialThreadId,
  onSubscribeThread,
  onSendMessage,
  onStartDirectThread,
  onCreateGroupThread,
  onAddParticipants,
  onRemoveParticipant,
  onRenameGroup,
  onPromoteAdmin,
  onToggleMuteChat,
  onEnablePush,
  onOpenPublicProfile,
  onStartCall,
  onStartInstantCall,
}: ChatViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialThreadId || threads[0]?.id || null
  );
  const [mobileShowThread, setMobileShowThread] = useState(
    Boolean(initialThreadId)
  );
  const [draft, setDraft] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [showNewPicker, setShowNewPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'direct' | 'group'>('direct');
  const [directorySearch, setDirectorySearch] = useState('');
  const [onlineOnlyFilter, setOnlineOnlyFilter] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [gifModalOpen, setGifModalOpen] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

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
  const knownOtherUsers = useMemo(() => {
    const byUid = new Map<string, UserProfile>();
    for (const u of chatUsers || []) {
      if (u.uid && u.uid !== profile.uid) {
        byUid.set(u.uid, u);
      }
    }
    for (const u of communityUsers) {
      if (u.uid && u.uid !== profile.uid) {
        byUid.set(u.uid, u);
      }
    }
    return Array.from(byUid.values());
  }, [chatUsers, communityUsers, profile.uid]);
  const otherCreators = useMemo(
    () => communityUsers.filter((u) => u.uid !== profile.uid),
    [communityUsers, profile.uid]
  );
  const onlineCreators = useMemo(
    () => otherCreators.filter((u) => isUserOnline(u.uid, onlineUserIds)),
    [otherCreators, onlineUserIds]
  );

  const filteredThreads = useMemo(() => {
    const q = threadSearch.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.partnerHandle.toLowerCase().includes(q) ||
        (t.lastMessageText || '').toLowerCase().includes(q)
    );
  }, [threads, threadSearch]);

  const filteredDirectoryUsers = useMemo(() => {
    const base = onlineOnlyFilter ? onlineCreators : otherCreators;
    return filterUsersByQuery(base, directorySearch);
  }, [onlineOnlyFilter, onlineCreators, otherCreators, directorySearch]);

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

  useEffect(() => {
    if (!showNewPicker) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNewPicker(false);
        setGroupError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showNewPicker]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
      }
    };
  }, []);

  useEffect(() => {
    if (activeStatus?.isOnline) {
      setIsPartnerTyping(true);
      const timer = setTimeout(() => setIsPartnerTyping(false), 2200);
      return () => clearTimeout(timer);
    } else {
      setIsPartnerTyping(false);
    }
  }, [selectedId, activeStatus?.isOnline]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeThread || !draft.trim()) return;
    const text = draft;
    setDraft('');
    await onSendMessage(activeThread, text);
  };

  const handleSelectChatGif = async (gif: CuratedGif) => {
    if (!activeThread) return;
    await onSendMessage(activeThread, formatGifMessage(gif.url));
  };

  const handleStartVoiceRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert('Audio recording is not supported in this browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        typeof MediaRecorder !== 'undefined' &&
        MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start voice recording:', err);
    }
  };

  const handleCancelVoiceRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  const handleSendVoiceRecording = async () => {
    if (!mediaRecorderRef.current || !activeThread) return;
    const finalDuration = Math.max(1, recordingSeconds);

    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    setVoiceUploading(true);

    recorder.onstop = async () => {
      try {
        recorder.stream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        let audioUrl = '';

        try {
          const file = new File(
            [blob],
            `voice-${Date.now()}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
            { type: mimeType }
          );
          const uploaded = await uploadMediaToCloudflareR2(file, 'posts');
          audioUrl = uploaded.url;
        } catch {
          // Fall back to object URL so audio memo remains immediately playable
          audioUrl = URL.createObjectURL(blob);
        }

        if (audioUrl) {
          await onSendMessage(activeThread, formatVoiceNote(audioUrl, finalDuration));
        }
      } catch (err) {
        console.error('Failed to upload/send voice note:', err);
      } finally {
        setIsRecordingVoice(false);
        setRecordingSeconds(0);
        setVoiceUploading(false);
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
      }
    };

    recorder.stop();
  };

  const handlePickCreator = async (creator: UserProfile) => {
    const thread = await onStartDirectThread(creator);
    setSelectedId(thread.id);
    setMobileShowThread(true);
    setShowNewPicker(false);
    setDirectorySearch('');
    setOnlineOnlyFilter(false);
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
      setDirectorySearch('');
      setOnlineOnlyFilter(false);
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

  const openFullUserDirectory = (mode: 'direct' | 'group') => {
    setPickerMode(mode);
    setGroupError(null);
    setShowNewPicker(true);
  };

  return (
    <section
      aria-label="Real-time messaging"
      data-testid="chat-fullscreen-container"
      className="w-full h-full flex-1 min-h-0 bg-white dark:bg-slate-900 grid grid-cols-1 md:grid-cols-12 overflow-hidden"
    >
      {/* Conversation List */}
      <div
        className={`md:col-span-4 lg:col-span-3 min-h-0 h-full border-r border-slate-200 dark:border-slate-800 flex-col overflow-hidden ${
          mobileShowThread ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div
          data-testid="messenger-header"
          className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-base font-bold truncate">
              Messages
            </h1>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => openFullUserDirectory('group')}
                aria-label="New group chat"
                className="min-h-[38px] px-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/60 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Group</span>
              </button>
            </div>
          </div>

          {/* Conversation Search */}
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Filter conversations..."
              aria-label="Filter conversations"
              className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {onlineCreators.length > 0 && (
            <div className="pt-0.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Active now ({onlineCreators.length})
                </p>
                <button
                  type="button"
                  onClick={() => openFullUserDirectory('direct')}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  All people
                </button>
              </div>
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

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
          {filteredThreads.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {threadSearch.trim()
                  ? 'No conversations match that search.'
                  : 'No conversations yet.'}
              </p>
              <button
                type="button"
                onClick={() => openFullUserDirectory('direct')}
                className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Browse People</span>
              </button>
            </div>
          ) : null}
          {filteredThreads.map((thread) => {
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
                className={`w-full min-h-[68px] p-3.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
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
        className={`md:col-span-8 lg:col-span-9 min-h-0 h-full flex-col overflow-hidden ${
          mobileShowThread ? 'flex' : 'hidden md:flex'
        }`}
      >
        {activeThread ? (
          <>
            <div
              data-testid="active-thread-header"
              className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowThread(false)}
                  aria-label="Back to conversations"
                  className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                </button>
                <div className="relative shrink-0">
                  <Avatar
                    src={activeThread.partnerAvatar}
                    name={activeThread.title}
                    size="md"
                    online={Boolean(activeStatus?.isOnline)}
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-sm font-semibold truncate flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                    <span className="truncate">{activeThread.title}</span>
                    {activeThreadMuted && (
                      <BellOff
                        className="w-3.5 h-3.5 text-slate-400 shrink-0"
                        aria-label="Notifications muted"
                      />
                    )}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {activeStatus?.isOnline ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Active now</span>
                    ) : (
                      <span>
                        {activeStatus?.statusLabel ||
                          (activeThread.isGroup
                            ? `${activeThread.memberIds.length} members`
                            : activeThread.partnerHandle
                              ? `@${activeThread.partnerHandle}`
                              : activeThread.isParticipantResolved === false
                                ? 'Resolving profile...'
                                : 'Direct conversation')}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {activeThread.isGroup && (
                  <button
                    type="button"
                    onClick={() => setShowChatInfo(true)}
                    aria-label="Manage group participants"
                    className="min-h-[38px] w-[38px] rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onStartCall(activeThread, true)}
                  aria-label="Start audio call"
                  className="min-h-[38px] w-[38px] rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Phone className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onStartCall(activeThread, false)}
                  aria-label="Start video call"
                  className="min-h-[38px] w-[38px] rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Video className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowChatInfo(true)}
                  aria-label="Chat information"
                  className="min-h-[38px] w-[38px] rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Info className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <ChatInfoModal
              open={showChatInfo}
              thread={activeThread}
              profile={profile}
              messages={activeMessages}
              onlineUserIds={onlineUserIds}
              communityUsers={knownOtherUsers}
              isMuted={activeThreadMuted}
              pushEnabled={pushEnabled}
              onToggleMute={() => onToggleMuteChat(activeThread.id)}
              onEnablePush={onEnablePush}
              onAddParticipants={onAddParticipants}
              onRemoveParticipant={onRemoveParticipant}
              onRenameGroup={onRenameGroup}
              onPromoteAdmin={onPromoteAdmin}
              onClose={() => setShowChatInfo(false)}
              onOpenPublicProfile={onOpenPublicProfile}
            />

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-white dark:bg-slate-900">
              {activeMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-sm text-slate-400 gap-2">
                  <Avatar src={activeThread.partnerAvatar} name={activeThread.title} size="lg" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    {activeThread.title}
                  </p>
                  <p className="text-xs text-slate-400">
                    Say hello to start the conversation!
                  </p>
                </div>
              ) : (
                activeMessages.map((msg, idx) => {
                  const mine = msg.senderId === profile.uid;
                  const nextMsg = activeMessages[idx + 1];
                  const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId;
                  const isLastMine =
                    mine &&
                    idx === activeMessages.map((m) => m.senderId).lastIndexOf(profile.uid);

                  const voiceData = parseVoiceNote(msg.text);
                  const gifData = parseGifMessage(msg.text);
                  const urlMatch = !voiceData && !gifData ? extractFirstUrl(msg.text) : null;

                  const liveSender =
                    msg.senderId === profile.uid
                      ? profile
                      : knownOtherUsers.find((u) => u.uid === msg.senderId);
                  const resolvedSenderName =
                    liveSender?.displayName ||
                    (!activeThread.isGroup &&
                    msg.senderId === activeThread.partnerUid &&
                    activeThread.isParticipantResolved
                      ? activeThread.title
                      : msg.senderName);
                  const resolvedSenderAvatar =
                    liveSender?.avatarUrl ??
                    (!activeThread.isGroup &&
                    msg.senderId === activeThread.partnerUid &&
                    activeThread.isParticipantResolved
                      ? activeThread.partnerAvatar
                      : msg.senderAvatar);

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        mine ? 'items-end' : 'items-start'
                      } ${isLastInGroup ? 'mb-3' : 'mb-1'}`}
                    >
                      <div
                        className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${
                          mine ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {!mine && (
                          <div className="w-7 shrink-0">
                            {isLastInGroup ? (
                              <Avatar
                                src={resolvedSenderAvatar}
                                name={resolvedSenderName}
                                size="sm"
                              />
                            ) : (
                              <div className="w-7" />
                            )}
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-sm shadow-2xs ${
                            mine
                              ? 'bg-blue-600 text-white rounded-br-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-xs'
                          }`}
                        >
                          {!mine && activeThread.isGroup && isLastInGroup && (
                            <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5">
                              {resolvedSenderName}
                            </p>
                          )}

                          {voiceData ? (
                            <VoiceNoteBubble
                              url={voiceData.url}
                              durationSec={voiceData.durationSec}
                              mine={mine}
                            />
                          ) : gifData ? (
                            <GifBubble
                              url={gifData.url}
                              caption={gifData.caption}
                              mine={mine}
                            />
                          ) : (
                            <div>
                              <p className="leading-relaxed break-words">{msg.text}</p>
                              {urlMatch && (
                                <ChatLinkCard url={urlMatch} mine={mine} />
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Messenger-style Read Receipt & Status Indicator */}
                      {isLastMine && (
                        <div className="flex items-center justify-end gap-1 mt-1 px-1 text-[11px] text-slate-400">
                          {activeStatus?.isOnline ? (
                            <div className="flex items-center gap-1.5" title="Seen by partner">
                              <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                Seen
                              </span>
                              <div className="w-3.5 h-3.5 rounded-full overflow-hidden ring-1 ring-blue-500/40 shrink-0 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-700 dark:text-slate-200">
                                {activeThread.partnerAvatar ? (
                                  <img
                                    src={activeThread.partnerAvatar}
                                    alt={activeThread.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span>
                                    {(activeThread.title.trim()[0] || '?').toUpperCase()}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1" title="Delivered">
                              <span className="text-[10px]">Delivered</span>
                              <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Animated Typing Indicator */}
              {activeStatus?.isOnline && isPartnerTyping && (
                <div className="flex items-end gap-2 mb-2 animate-in fade-in duration-200">
                  <Avatar
                    src={activeThread.partnerAvatar}
                    name={activeThread.title}
                    size="sm"
                  />
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-xs px-3.5 py-2.5 flex items-center gap-1.5 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce" />
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {isRecordingVoice ? (
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-red-50/50 dark:bg-red-950/20 animate-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                  </span>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums">
                    Recording {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                    · Speak into your microphone
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelVoiceRecording}
                    className="min-h-[40px] px-3.5 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-950/50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendVoiceRecording}
                    disabled={voiceUploading}
                    className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 transition shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                    <span>{voiceUploading ? 'Uploading...' : 'Send Voice Note'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSend}
                className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-slate-900"
              >
                {/* GIF Button */}
                <button
                  type="button"
                  onClick={() => setGifModalOpen(true)}
                  title="Send a GIF"
                  aria-label="Send a GIF"
                  className="min-h-[40px] min-w-[40px] rounded-full text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold text-xs tracking-wider transition cursor-pointer"
                >
                  GIF
                </button>

                {/* Voice Note Mic Button */}
                <button
                  type="button"
                  onClick={handleStartVoiceRecording}
                  title="Record Voice Note"
                  aria-label="Record voice note"
                  className="min-h-[40px] min-w-[40px] rounded-full text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
                >
                  <Mic className="w-5 h-5" />
                </button>

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
                  className="flex-1 min-h-[40px] px-4 rounded-full bg-slate-100 dark:bg-slate-800 border-none text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                />

                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Send message"
                  className="min-h-[40px] min-w-[40px] rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer transition shadow-sm"
                >
                  <Send className="w-4 h-4 ml-0.5" aria-hidden="true" />
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center text-slate-500">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Video className="w-7 h-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                Start a conversation or live room
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                Browse the full member directory to start a direct chat or group, or launch an instant audio or video call room.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => openFullUserDirectory('direct')}
                className="min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Users className="w-4 h-4" aria-hidden="true" />
                <span>Browse People</span>
              </button>
              <button
                type="button"
                onClick={() => onStartInstantCall('Studio Video Call', false)}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Video className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>Start Video Room</span>
              </button>
              <button
                type="button"
                onClick={() => onStartInstantCall('Studio Audio Call', true)}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Audio Room</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full-Screen Chat User List & Group Builder Overlay */}
      {showNewPicker && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chat user directory"
          data-testid="chat-user-list-fullscreen"
          className="fixed inset-0 z-50 h-[100dvh] w-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden"
        >
          {/* Directory Top Bar */}
          <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-950">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setShowNewPicker(false);
                  setGroupError(null);
                }}
                aria-label="Back to messages"
                className="min-h-[44px] min-w-[44px] px-2.5 rounded-xl flex items-center justify-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                <span className="hidden sm:inline text-xs font-semibold">
                  Messages
                </span>
              </button>
              <div className="min-w-0">
                <h2 className="font-display text-base sm:text-lg font-bold truncate">
                  {pickerMode === 'group' ? 'New Group Chat' : 'People Directory'}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                  {otherCreators.length} members · {onlineCreators.length} online now
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setPickerMode('direct');
                    setGroupError(null);
                  }}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    pickerMode === 'direct'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
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
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    pickerMode === 'group'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  New Group
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNewPicker(false);
                  setGroupError(null);
                }}
                aria-label="Close user directory"
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Search & Group Name Controls */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 shrink-0">
            <div className="max-w-6xl mx-auto w-full space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={directorySearch}
                    onChange={(e) => setDirectorySearch(e.target.value)}
                    placeholder="Search people by name, @handle, city, or bio..."
                    aria-label="Search chat users"
                    className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setOnlineOnlyFilter(false)}
                    aria-pressed={!onlineOnlyFilter}
                    className={`min-h-[46px] px-4 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                      !onlineOnlyFilter
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    All ({otherCreators.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlineOnlyFilter(true)}
                    aria-pressed={onlineOnlyFilter}
                    className={`min-h-[46px] px-4 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                      onlineOnlyFilter
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Online ({onlineCreators.length})
                  </button>
                </div>
              </div>

              {pickerMode === 'group' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                  <div className="flex-1">
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
                      className="w-full min-h-[46px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                    Select participants ({selectedGroupIds.length + 1}/
                    {MAX_GROUP_MEMBERS})
                  </p>
                </div>
              )}

              {groupError && (
                <p
                  role="alert"
                  className="text-xs font-medium text-red-600 dark:text-red-400"
                >
                  {groupError}
                </p>
              )}
            </div>
          </div>

          {/* Full-Screen Responsive User List Grid */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-6xl mx-auto w-full">
              {filteredDirectoryUsers.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {directorySearch.trim() || onlineOnlyFilter
                      ? 'No matching members found.'
                      : 'No other members available yet.'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Try clearing your search or switching back to all members.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {filteredDirectoryUsers.map((creator) => {
                    const online = isUserOnline(creator.uid, onlineUserIds);
                    const selected = selectedGroupIds.includes(creator.uid);

                    if (pickerMode === 'group') {
                      return (
                        <button
                          key={creator.uid}
                          type="button"
                          onClick={() => toggleGroupParticipant(creator.uid)}
                          aria-pressed={selected}
                          className={`p-4 rounded-2xl border text-left flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                            selected
                              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 dark:border-blue-500'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <Avatar
                              src={creator.avatarUrl}
                              name={creator.displayName}
                              size="md"
                              online={online}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {creator.displayName}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                @{creator.handle}
                                {online ? ' · Online' : ''}
                              </p>
                              {creator.bio && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1.5">
                                  {creator.bio}
                                </p>
                              )}
                            </div>
                          </div>
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${
                              selected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {selected && (
                              <Check className="w-4 h-4" aria-hidden="true" />
                            )}
                          </span>
                        </button>
                      );
                    }

                    return (
                      <div
                        key={creator.uid}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-3.5"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <Avatar
                            src={creator.avatarUrl}
                            name={creator.displayName}
                            size="lg"
                            online={online}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {creator.displayName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              @{creator.handle} ·{' '}
                              <span
                                className={
                                  online
                                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                    : ''
                                }
                              >
                                {online ? 'Online' : 'Offline'}
                              </span>
                            </p>
                            {creator.location && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 mt-1 truncate max-w-full">
                                <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{creator.location}</span>
                              </p>
                            )}
                            {creator.bio && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-1.5">
                                {creator.bio}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => handlePickCreator(creator)}
                            className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Message</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowNewPicker(false);
                              onOpenPublicProfile(creator.uid);
                            }}
                            className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                          >
                            Profile
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {pickerMode === 'group' && (
            <form
              onSubmit={handleCreateGroup}
              className="shrink-0 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-3"
            >
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                {selectedGroupIds.length} member
                {selectedGroupIds.length === 1 ? '' : 's'} selected
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewPicker(false);
                    setGroupError(null);
                  }}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup}
                  className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Users className="w-4 h-4" aria-hidden="true" />
                  <span>{creatingGroup ? 'Creating...' : 'Create Group'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <GifPickerModal
        open={gifModalOpen}
        onClose={() => setGifModalOpen(false)}
        onSelectGif={handleSelectChatGif}
      />
    </section>
  );
}
