import { useEffect, useState, type FormEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { StoryGroup, StoryItem } from '../types/social';
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
  onDeleteStory?: (story: StoryItem) => Promise<void>;
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
  onDeleteStory,
}: StoryViewerModalProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sentNotice, setSentNotice] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingStory, setDeletingStory] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    setConfirmingDelete(false);
    setDeleteError(null);
  }, [activeAuthorId]);

  useEffect(() => {
    if (activeItem) {
      onMarkViewed(activeItem.id);
      setImgFailed(false);
      setConfirmingDelete(false);
      setDeleteError(null);
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

  const handleConfirmDeleteStory = async () => {
    if (!onDeleteStory || !activeItem || deletingStory) return;
    setDeleteError(null);
    setDeletingStory(true);
    try {
      const remainingCount = activeGroup.items.length - 1;
      await onDeleteStory(activeItem);
      setConfirmingDelete(false);
      if (remainingCount <= 0) {
        onClose();
      } else {
        setFrameIndex((idx) => Math.max(0, Math.min(idx, remainingCount - 1)));
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete story.');
    } finally {
      setDeletingStory(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${activeGroup.authorName}'s story`}
      data-testid="story-viewer-fullscreen"
      className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between h-[100dvh] w-screen overflow-hidden select-none"
    >
      {/* Top Progress Bars, Header & Author Switcher */}
      <header className="relative z-30 px-4 pt-3 pb-4 sm:px-6 sm:pt-4 bg-gradient-to-b from-black/90 via-black/65 to-transparent space-y-3 shrink-0">
        <div className="flex items-center gap-1.5 max-w-3xl mx-auto w-full">
          {activeGroup.items.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFrameIndex(idx)}
              aria-label={`View story frame ${idx + 1} of ${activeGroup.items.length}`}
              className="h-1.5 flex-1 rounded-full bg-white/25 overflow-hidden cursor-pointer"
            >
              <div
                className={`h-full rounded-full transition-all ${
                  idx <= frameIndex ? 'w-full bg-white' : 'w-0 bg-white'
                }`}
              />
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto w-full">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAuthorProfile(activeGroup.authorId);
            }}
            className="flex items-center gap-3 min-w-0 text-left cursor-pointer group min-h-[44px]"
          >
            <Avatar
              src={activeGroup.authorAvatar}
              name={activeGroup.authorName}
              size="md"
            />
            <div className="min-w-0">
              <p className="font-display text-sm sm:text-base font-semibold text-white truncate group-hover:underline">
                {activeGroup.authorName}
              </p>
              <p className="text-xs text-slate-300 truncate tabular-nums">
                @{activeGroup.authorHandle} ·{' '}
                {formatRelativeTime(activeItem.createdAtMs)} ·{' '}
                {frameIndex + 1}/{activeGroup.items.length}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {isOwnStory && onDeleteStory && (
              confirmingDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={deletingStory}
                    onClick={handleConfirmDeleteStory}
                    className="min-h-[40px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {deletingStory ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    disabled={deletingStory}
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteError(null);
                    }}
                    className="min-h-[40px] px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete story"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-red-600/80 text-white flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close story viewer"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Full-screen Story Author Switcher */}
        {groups.length > 1 && (
          <div
            aria-label="Switch creator story"
            className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-3xl mx-auto w-full pt-0.5"
          >
            {groups.map((grp) => {
              const selected = grp.authorId === activeGroup.authorId;
              return (
                <button
                  key={grp.authorId}
                  type="button"
                  onClick={() => onSelectAuthor(grp.authorId)}
                  aria-current={selected ? 'true' : undefined}
                  className={`min-h-[38px] pl-1.5 pr-3 py-1 rounded-xl flex items-center gap-2 shrink-0 border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-white/20 border-white/40 text-white font-semibold'
                      : 'bg-black/35 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Avatar
                    src={grp.authorAvatar}
                    name={grp.authorName}
                    size="sm"
                  />
                  <span className="text-xs truncate max-w-[96px]">
                    {grp.authorId === currentUid
                      ? 'Your Story'
                      : grp.authorName.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {deleteError && (
          <p
            role="alert"
            className="max-w-3xl mx-auto text-xs text-red-200 bg-red-950/80 border border-red-800 rounded-xl px-3 py-2"
          >
            {deleteError}
          </p>
        )}
      </header>

      {/* Edge-to-Edge Full-Screen Visual Frame */}
      <div className="relative flex-1 min-h-0 bg-slate-950 flex items-center justify-center overflow-hidden">
        {!imgFailed && activeItem.imageUrl ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-45 scale-110 pointer-events-none"
              style={{ backgroundImage: `url(${activeItem.imageUrl})` }}
            />
            <img
              src={activeItem.imageUrl}
              alt={`${activeGroup.authorName}'s story`}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="relative z-10 w-full h-full object-contain px-0 sm:px-14"
            />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 flex items-center justify-center p-8 sm:p-14 text-center">
            <p className="font-display text-2xl sm:text-4xl font-bold text-white text-balance max-w-2xl leading-snug">
              {activeItem.caption || activeGroup.authorName}
            </p>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-20" />

        {/* Mobile Tap Navigation Zones */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous story"
          className="md:hidden absolute inset-y-4 left-0 w-1/4 z-20 cursor-pointer bg-transparent"
        />
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next story"
          className="md:hidden absolute inset-y-4 right-0 w-1/4 z-20 cursor-pointer bg-transparent"
        />

        {/* Desktop & Visible Prev / Next Overlay Controls */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous story"
          className="hidden md:flex absolute left-5 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/55 hover:bg-black/85 border border-white/15 text-white items-center justify-center cursor-pointer transition-colors shadow-xl"
        >
          <ChevronLeft className="w-6 h-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next story"
          className="hidden md:flex absolute right-5 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/55 hover:bg-black/85 border border-white/15 text-white items-center justify-center cursor-pointer transition-colors shadow-xl"
        >
          <ChevronRight className="w-6 h-6" aria-hidden="true" />
        </button>

        {activeItem.caption && activeItem.imageUrl && !imgFailed && (
          <div className="absolute bottom-5 sm:bottom-6 left-4 right-4 sm:left-16 sm:right-16 z-30 text-center pointer-events-none">
            <p className="inline-block px-4 py-2.5 rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 text-sm sm:text-base font-medium text-white leading-relaxed shadow-lg max-w-2xl">
              {activeItem.caption}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Reply Bar */}
      {!isOwnStory && (
        <footer className="relative z-40 px-4 py-3.5 sm:px-6 sm:py-4 bg-black/90 border-t border-white/10 shrink-0">
          <form
            onSubmit={handleSubmitReply}
            className="max-w-2xl mx-auto flex items-center gap-3"
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
              className="flex-1 min-h-[48px] px-4 rounded-2xl bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              aria-label="Send story reply"
              className="min-h-[48px] px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors shadow-lg shrink-0"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>Send</span>
            </button>
          </form>
        </footer>
      )}
    </div>
  );
}
