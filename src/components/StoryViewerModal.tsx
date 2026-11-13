import { useEffect, useState, type FormEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Send,
  X,
} from 'lucide-react';
import type { StoryGroup } from '../types/social';
import { formatRelativeTime } from '../utils/socialLogic';
import { Avatar } from './Avatar';

interface StoryViewerModalProps {
  groups: StoryGroup[];
  activeAuthorId: string | null;
  currentUid: string;
  onClose: () => void;
  onSelectAuthor: (authorId: string) => void;
  onMarkViewed: (storyId: string) => void;
  onOpenAuthorProfile: (authorId: string) => void;
  onReplyToStory: (group: StoryGroup, text: string) => Promise<void>;
}

export function StoryViewerModal({
  groups,
  activeAuthorId,
  currentUid,
  onClose,
  onSelectAuthor,
  onMarkViewed,
  onOpenAuthorProfile,
  onReplyToStory,
}: StoryViewerModalProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sentNotice, setSentNotice] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const groupIndex = groups.findIndex((g) => g.authorId === activeAuthorId);
  const activeGroup = groupIndex >= 0 ? groups[groupIndex] : null;
  const activeItem = activeGroup
    ? activeGroup.items[Math.min(frameIndex, activeGroup.items.length - 1)]
    : null;

  useEffect(() => {
    setFrameIndex(0);
    setReplyText('');
    setSentNotice(false);
    setImgFailed(false);
  }, [activeAuthorId]);

  useEffect(() => {
    if (activeItem) {
      onMarkViewed(activeItem.id);
      setImgFailed(false);
    }
  }, [activeItem, onMarkViewed]);

  const handleNext = () => {
    if (!activeGroup) return;
    if (frameIndex + 1 < activeGroup.items.length) {
      setFrameIndex(frameIndex + 1);
      return;
    }
    if (groupIndex + 1 < groups.length) {
      onSelectAuthor(groups[groupIndex + 1].authorId);
      return;
    }
    onClose();
  };

  const handlePrev = () => {
    if (!activeGroup) return;
    if (frameIndex > 0) {
      setFrameIndex(frameIndex - 1);
      return;
    }
    if (groupIndex > 0) {
      onSelectAuthor(groups[groupIndex - 1].authorId);
    }
  };

  useEffect(() => {
    if (!activeGroup) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!activeGroup || !activeItem) return null;

  const isOwnStory = activeGroup.authorId === currentUid;

  const handleSubmitReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    const text = replyText.trim();
    setReplyText('');
    await onReplyToStory(activeGroup, text);
    setSentNotice(true);
    window.setTimeout(() => setSentNotice(false), 2500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${activeGroup.authorName}'s story`}
      className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between h-screen w-screen overflow-hidden select-none"
    >
      {/* Top Progress Bars & Header */}
      <div className="absolute top-0 left-0 right-0 z-30 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent space-y-3">
        <div className="flex items-center gap-1.5 max-w-2xl mx-auto w-full">
          {activeGroup.items.map((item, idx) => (
            <div
              key={item.id}
              className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden"
            >
              <div
                className={`h-full rounded-full transition-all ${
                  idx <= frameIndex ? 'w-full bg-white' : 'w-0 bg-white'
                }`}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 max-w-2xl mx-auto w-full">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAuthorProfile(activeGroup.authorId);
            }}
            className="flex items-center gap-3 min-w-0 text-left cursor-pointer group"
          >
            <Avatar
              src={activeGroup.authorAvatar}
              name={activeGroup.authorName}
              size="md"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate group-hover:underline">
                {activeGroup.authorName}
              </p>
              <p className="text-xs text-slate-300 truncate tabular-nums">
                @{activeGroup.authorHandle} ·{' '}
                {formatRelativeTime(activeItem.createdAtMs)}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close story viewer"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-black/40 hover:bg-black/70 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Full-Screen Visual Frame */}
      <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden">
        {!imgFailed && activeItem.imageUrl ? (
          <>
            {/* Blurred ambient background for non-square media */}
            <div
              className="absolute inset-0 bg-cover bg-center filter blur-2xl opacity-40 scale-110 pointer-events-none"
              style={{ backgroundImage: `url(${activeItem.imageUrl})` }}
            />
            <img
              src={activeItem.imageUrl}
              alt={`${activeGroup.authorName}'s story`}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="relative z-10 w-full h-full object-contain max-h-screen"
            />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 flex items-center justify-center p-12 text-center">
            <p className="font-display text-2xl sm:text-3xl font-bold text-white text-balance max-w-xl leading-snug">
              {activeItem.caption || activeGroup.authorName}
            </p>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-20" />

        {/* Prev / Next Overlay Controls */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous story"
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer transition-colors shadow-lg"
        >
          <ChevronLeft className="w-6 h-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next story"
          className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer transition-colors shadow-lg"
        >
          <ChevronRight className="w-6 h-6" aria-hidden="true" />
        </button>

        {activeItem.caption && activeItem.imageUrl && !imgFailed && (
          <div className="absolute bottom-20 sm:bottom-24 left-6 right-6 sm:left-12 sm:right-12 z-35 text-center pointer-events-none">
            <p className="text-base sm:text-lg font-medium text-white leading-relaxed drop-shadow-md max-w-2xl mx-auto">
              {activeItem.caption}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Reply Bar */}
      {!isOwnStory && (
        <div className="absolute bottom-0 inset-x-0 z-40 p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
          <form
            onSubmit={handleSubmitReply}
            className="max-w-xl mx-auto flex items-center gap-3"
          >
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={
                sentNotice
                  ? `Reply sent to ${activeGroup.authorName.split(' ')[0]}!`
                  : `Reply to ${activeGroup.authorName.split(' ')[0]}...`
              }
              maxLength={400}
              className="flex-1 min-h-[48px] px-4 rounded-2xl bg-slate-900/90 border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-md"
            />
            <button
              type="submit"
              aria-label="Send story reply"
              className="min-h-[48px] px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors shadow-lg"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
