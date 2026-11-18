import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Heart,
  ImageOff,
  Music,
  PictureInPicture2,
  PlusCircle,
  Repeat,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Post } from '../types/social';
import {
  canSharePostToStory,
  cyclePlaybackSpeed,
  cycleZoomLevel,
  deriveMediaDownloadName,
  formatRelativeTime,
  resolvePostMediaDescriptor,
  stepMediaIndex,
  type PostMediaDescriptor,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { RichText } from './RichText';
import { VerifiedBadge } from './VerifiedBadge';

export interface MediaGalleryEntry {
  post: Post;
  media: PostMediaDescriptor;
}

interface MediaViewerModalProps {
  open: boolean;
  entries: MediaGalleryEntry[];
  activePostId: string | null;
  currentUserId?: string;
  likedPostIds?: string[];
  bookmarkedPostIds?: string[];
  onClose: () => void;
  onSelectPostId: (postId: string) => void;
  onToggleLike?: (post: Post) => void;
  onToggleBookmark?: (postId: string) => void;
  onShareToStory?: (post: Post) => Promise<unknown> | void;
  onAuthorClick?: (post: Post) => void;
  onSelectHashtag?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
}

export function MediaViewerModal({
  open,
  entries,
  activePostId,
  currentUserId = '',
  likedPostIds = [],
  bookmarkedPostIds = [],
  onClose,
  onSelectPostId,
  onToggleLike,
  onToggleBookmark,
  onShareToStory,
  onAuthorClick,
  onSelectHashtag,
  onMentionClick,
}: MediaViewerModalProps) {
  const [zoom, setZoom] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loopMedia, setLoopMedia] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [sharingToStory, setSharingToStory] = useState(false);
  const [sharedToStory, setSharedToStory] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeIndex = useMemo(() => {
    if (!entries.length) return -1;
    const found = entries.findIndex((item) => item.post.id === activePostId);
    return found >= 0 ? found : 0;
  }, [entries, activePostId]);

  const activeEntry = activeIndex >= 0 ? entries[activeIndex] : null;
  const resolvedMedia = useMemo(() => {
    if (!activeEntry) return null;
    return activeEntry.media || resolvePostMediaDescriptor(activeEntry.post);
  }, [activeEntry]);

  useEffect(() => {
    setZoom(1);
    setPlaybackSpeed(1);
    setMediaError(false);
    setRetryNonce(0);
    setSharedToStory(false);
  }, [activePostId, open]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
      videoRef.current.muted = muted;
      videoRef.current.loop = loopMedia;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.muted = muted;
      audioRef.current.loop = loopMedia;
    }
  }, [playbackSpeed, muted, loopMedia, activePostId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (entries.length > 1 && e.key === 'ArrowLeft' && activeIndex > 0) {
        e.preventDefault();
        const prevIdx = stepMediaIndex(activeIndex, -1, entries.length);
        onSelectPostId(entries[prevIdx].post.id);
      }
      if (
        entries.length > 1 &&
        e.key === 'ArrowRight' &&
        activeIndex < entries.length - 1
      ) {
        e.preventDefault();
        const nextIdx = stepMediaIndex(activeIndex, 1, entries.length);
        onSelectPostId(entries[nextIdx].post.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, entries, activeIndex, onClose, onSelectPostId]);

  if (!open || !activeEntry || !resolvedMedia) return null;

  const { post } = activeEntry;
  const isLiked = likedPostIds.includes(post.id);
  const isBookmarked = bookmarkedPostIds.includes(post.id);
  const isOwnPost = canSharePostToStory(post.authorId, currentUserId);
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < entries.length - 1;
  const isDirectDownloadable =
    resolvedMedia.kind === 'image' ||
    resolvedMedia.kind === 'video' ||
    resolvedMedia.kind === 'audio';
  const downloadFilename = deriveMediaDownloadName(resolvedMedia, post.id);

  const handleCopyMediaUrl = async () => {
    try {
      const fullUrl = resolvedMedia.url.startsWith('/')
        ? `${window.location.origin}${resolvedMedia.url}`
        : resolvedMedia.url;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(fullUrl);
      }
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
    }
  };

  const handlePictureInPicture = async () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (typeof el.requestPictureInPicture === 'function') {
        await el.requestPictureInPicture();
      }
    } catch {
      // Ignore if PiP blocked by browser policy
    }
  };

  const handleShareToStory = async () => {
    if (!onShareToStory || sharingToStory) return;
    setSharingToStory(true);
    try {
      await onShareToStory(post);
      setSharedToStory(true);
      window.setTimeout(() => setSharedToStory(false), 2400);
    } finally {
      setSharingToStory(false);
    }
  };

  const handleStep = (delta: -1 | 1) => {
    const targetIdx = stepMediaIndex(activeIndex, delta, entries.length);
    if (targetIdx !== activeIndex && entries[targetIdx]) {
      onSelectPostId(entries[targetIdx].post.id);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Media viewer for ${post.authorName}'s post`}
      data-testid="media-viewer-modal"
      className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md text-white flex flex-col"
    >
      {/* Top Bar */}
      <header className="px-4 sm:px-6 py-3 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (onAuthorClick) {
              onClose();
              onAuthorClick(post);
            }
          }}
          className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
        >
          <Avatar src={post.authorAvatar} name={post.authorName} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white inline-flex items-center gap-1 max-w-full min-w-0 group-hover:text-blue-400 transition-colors">
              <span className="truncate">{post.authorName}</span>
              {post.authorVerified && <VerifiedBadge size={14} />}
            </p>
            <p className="text-xs text-slate-400 truncate">
              @{post.authorHandle} · {formatRelativeTime(post.createdAtMs)}
              {entries.length > 1 && (
                <span className="ml-2 text-slate-300 tabular-nums">
                  ({activeIndex + 1} of {entries.length})
                </span>
              )}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {resolvedMedia.kind === 'image' && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => cycleZoomLevel(z))}
                aria-label={`Zoom image (current ${zoom}x)`}
                className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer tabular-nums"
              >
                {zoom > 1 ? (
                  <ZoomOut className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ZoomIn className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{zoom}x</span>
              </button>
            </>
          )}

          {(resolvedMedia.kind === 'video' || resolvedMedia.kind === 'audio') && (
            <>
              <button
                type="button"
                onClick={() => setPlaybackSpeed((s) => cyclePlaybackSpeed(s))}
                aria-label={`Playback speed ${playbackSpeed}x`}
                className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors cursor-pointer tabular-nums"
              >
                {playbackSpeed}x
              </button>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute media' : 'Mute media'}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
              >
                {muted ? (
                  <VolumeX className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setLoopMedia((l) => !l)}
                aria-pressed={loopMedia}
                aria-label={loopMedia ? 'Disable loop' : 'Loop playback'}
                className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                  loopMedia
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <Repeat className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          )}

          {resolvedMedia.kind === 'video' &&
            typeof document !== 'undefined' &&
            document.pictureInPictureEnabled && (
              <button
                type="button"
                onClick={handlePictureInPicture}
                aria-label="Toggle picture-in-picture"
                className="hidden sm:flex min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/20 items-center justify-center transition-colors cursor-pointer"
              >
                <PictureInPicture2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

          {isDirectDownloadable && (
            <a
              href={resolvedMedia.url}
              download={downloadFilename}
              aria-label="Download media file"
              className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Download</span>
            </a>
          )}

          <button
            type="button"
            onClick={handleCopyMediaUrl}
            aria-label="Copy media link"
            className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copiedUrl ? (
              <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="w-4 h-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {copiedUrl ? 'Copied' : 'Copy link'}
            </span>
          </button>

          {!resolvedMedia.url.startsWith('data:') && (
            <a
              href={resolvedMedia.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open media in new tab"
              className="hidden sm:inline-flex min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/20 items-center justify-center transition-colors"
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close media viewer"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Center Stage */}
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8 overflow-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {entries.length > 1 && (
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => handleStep(-1)}
            aria-label="Previous media post"
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] rounded-full bg-black/60 hover:bg-black/80 border border-white/15 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" aria-hidden="true" />
          </button>
        )}

        {resolvedMedia.kind === 'image' && (
          mediaError ? (
            <div className="rounded-2xl bg-slate-900 border border-white/10 p-8 text-center space-y-3 max-w-sm">
              <ImageOff className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-200">
                Unable to load full image preview
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMediaError(false);
                    setRetryNonce((n) => n + 1);
                  }}
                  className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Retry</span>
                </button>
                <a
                  href={resolvedMedia.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open Original</span>
                </a>
              </div>
            </div>
          ) : (
            <img
              key={`${resolvedMedia.url}-${retryNonce}`}
              src={resolvedMedia.url}
              alt={resolvedMedia.title}
              referrerPolicy="no-referrer"
              onError={() => setMediaError(true)}
              onClick={() => setZoom((z) => cycleZoomLevel(z))}
              style={{ transform: `scale(${zoom})` }}
              className={`max-w-full max-h-full object-contain rounded-xl transition-transform duration-200 select-none ${
                zoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'
              }`}
            />
          )
        )}

        {(resolvedMedia.kind === 'youtube' || resolvedMedia.kind === 'vimeo') &&
          resolvedMedia.embedUrl && (
            <div className="w-full max-w-5xl aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
              <iframe
                src={resolvedMedia.embedUrl}
                title={resolvedMedia.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          )}

        {resolvedMedia.kind === 'video' && (
          mediaError ? (
            <div className="rounded-2xl bg-slate-900 border border-white/10 p-8 text-center space-y-3 max-w-sm">
              <p className="text-sm font-medium text-slate-200">
                Video could not be played in this browser
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMediaError(false);
                    setRetryNonce((n) => n + 1);
                  }}
                  className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Retry</span>
                </button>
                <a
                  href={resolvedMedia.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open Video</span>
                </a>
              </div>
            </div>
          ) : (
            <video
              key={`${resolvedMedia.url}-${retryNonce}`}
              ref={videoRef}
              src={resolvedMedia.url}
              controls
              autoPlay
              playsInline
              muted={muted}
              loop={loopMedia}
              onError={() => setMediaError(true)}
              className="max-w-full max-h-full rounded-2xl bg-black shadow-2xl"
            />
          )
        )}

        {resolvedMedia.kind === 'audio' && (
          <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-white/10 p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                <Music className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white truncate">
                  {resolvedMedia.title}
                </h2>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {resolvedMedia.subtitle}
                </p>
              </div>
            </div>
            {mediaError ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-red-950/40 border border-red-900 px-4 py-3 text-xs text-red-200">
                <span>Unable to play audio track.</span>
                <button
                  type="button"
                  onClick={() => {
                    setMediaError(false);
                    setRetryNonce((n) => n + 1);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : (
              <audio
                key={`${resolvedMedia.url}-${retryNonce}`}
                ref={audioRef}
                src={resolvedMedia.url}
                controls
                autoPlay
                muted={muted}
                loop={loopMedia}
                onError={() => setMediaError(true)}
                className="w-full"
              />
            )}
          </div>
        )}

        {entries.length > 1 && (
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => handleStep(1)}
            aria-label="Next media post"
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] rounded-full bg-black/60 hover:bg-black/80 border border-white/15 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Footer Metadata & Actions */}
      <footer className="px-4 sm:px-6 py-3.5 border-t border-white/10 bg-slate-950/90 shrink-0">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {post.caption ? (
              <div className="text-sm text-slate-200 line-clamp-2">
                <RichText
                  text={post.caption}
                  onHashtagClick={(tag) => {
                    onClose();
                    onSelectHashtag?.(tag);
                  }}
                  onMentionClick={(handle) => {
                    onClose();
                    onMentionClick?.(handle);
                  }}
                />
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-300 truncate">
                {resolvedMedia.title}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onToggleLike && (
              <button
                type="button"
                onClick={() => onToggleLike(post)}
                aria-label={
                  isLiked
                    ? `Unlike post (${post.likesCount})`
                    : `Like post (${post.likesCount})`
                }
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer tabular-nums ${
                  isLiked
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <Heart
                  className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`}
                  aria-hidden="true"
                />
                <span>{post.likesCount}</span>
              </button>
            )}

            {onToggleBookmark && (
              <button
                type="button"
                onClick={() => onToggleBookmark(post.id)}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark post'}
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isBookmarked
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <Bookmark
                  className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`}
                  aria-hidden="true"
                />
                <span>{isBookmarked ? 'Saved' : 'Save'}</span>
              </button>
            )}

            {isOwnPost && onShareToStory && (
              <button
                type="button"
                disabled={sharingToStory}
                onClick={handleShareToStory}
                aria-label="Share to story"
                className="min-h-[40px] px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                {sharedToStory ? (
                  <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                ) : (
                  <PlusCircle className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{sharedToStory ? 'In Story' : 'To Story'}</span>
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
