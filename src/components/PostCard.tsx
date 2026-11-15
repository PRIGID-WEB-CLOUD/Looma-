import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Bookmark,
  Check,
  Download,
  ExternalLink,
  Globe,
  Heart,
  ImageOff,
  Maximize2,
  MessageCircle,
  Music,
  PictureInPicture2,
  PlusCircle,
  RotateCcw,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';
import type { Post, PostComment } from '../types/social';
import {
  canSharePostToStory,
  cyclePlaybackSpeed,
  deriveMediaDownloadName,
  extractFirstUrl,
  formatRelativeTime,
  parseRichUrl,
  resolvePostMediaDescriptor,
  sanitizeMediaTitle,
  validateCommentInput,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { MediaViewerModal } from './MediaViewerModal';
import { RichText } from './RichText';

interface PostCardProps {
  post: Post;
  currentUserId?: string;
  isLiked: boolean;
  isBookmarked: boolean;
  comments: PostComment[];
  onToggleLike: (post: Post) => void;
  onToggleBookmark: (postId: string) => void;
  onAddComment: (post: Post, text: string) => Promise<void>;
  onDeletePost?: (post: Post) => Promise<void>;
  onDeleteComment?: (post: Post, commentId: string) => Promise<void>;
  onShareToStory?: (post: Post) => Promise<unknown> | void;
  onAuthorClick?: (post: Post) => void;
  onSelectHashtag?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
  onOpenMedia?: (post: Post) => void;
}

export function PostCard({
  post,
  currentUserId = '',
  isLiked,
  isBookmarked,
  comments,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onDeletePost,
  onDeleteComment,
  onShareToStory,
  onAuthorClick,
  onSelectHashtag,
  onMentionClick,
  onOpenMedia,
}: PostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [mediaRetryNonce, setMediaRetryNonce] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [localViewerOpen, setLocalViewerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharingToStory, setSharingToStory] = useState(false);
  const [sharedToStory, setSharedToStory] = useState(false);
  const [confirmingDeletePost, setConfirmingDeletePost] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const isOwnPost = canSharePostToStory(post.authorId, currentUserId);

  const handleSubmitComment = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateCommentInput(commentText);
    if (!check.valid) {
      setCommentError(check.error || 'Enter a valid comment.');
      return;
    }
    setCommentError(null);
    setSubmitting(true);
    try {
      await onAddComment(post, commentText);
      setCommentText('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          `${post.authorName}: "${post.caption.slice(0, 100)}"`
        );
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleShareToStory = async () => {
    if (!onShareToStory || sharingToStory) return;
    setSharingToStory(true);
    try {
      await onShareToStory(post);
      setSharedToStory(true);
      window.setTimeout(() => setSharedToStory(false), 2500);
    } finally {
      setSharingToStory(false);
    }
  };

  const handleConfirmDeletePost = async () => {
    if (!onDeletePost || deletingPost) return;
    setDeleteError(null);
    setDeletingPost(true);
    try {
      await onDeletePost(post);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete post.');
      setDeletingPost(false);
    }
  };

  const handleDeleteCommentItem = async (commentId: string) => {
    if (!onDeleteComment || deletingCommentId) return;
    setCommentError(null);
    setDeletingCommentId(commentId);
    try {
      await onDeleteComment(post, commentId);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Unable to delete comment.');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const captionUrl = useMemo(() => extractFirstUrl(post.caption), [post.caption]);

  const parsedVideo = useMemo(() => {
    const raw = post.videoUrl || post.linkUrl || captionUrl || '';
    if (!raw) return null;
    const parsed = parseRichUrl(raw, post.mediaTitle || undefined);
    if (
      parsed &&
      (parsed.kind === 'youtube' ||
        parsed.kind === 'vimeo' ||
        parsed.kind === 'video')
    ) {
      return parsed;
    }
    return null;
  }, [captionUrl, post.linkUrl, post.mediaTitle, post.videoUrl]);

  const parsedAudio = useMemo(() => {
    const raw = post.audioUrl || post.linkUrl || captionUrl || '';
    if (!raw) return null;
    const parsed = parseRichUrl(raw, post.mediaTitle || undefined);
    return parsed && parsed.kind === 'audio' ? parsed : null;
  }, [captionUrl, post.audioUrl, post.linkUrl, post.mediaTitle]);

  const parsedLink = useMemo(() => {
    const raw = post.linkUrl || captionUrl || '';
    if (!raw) return null;
    const parsed = parseRichUrl(raw, post.mediaTitle || undefined);
    if (!parsed) return null;
    if (
      parsed.kind === 'youtube' ||
      parsed.kind === 'vimeo' ||
      parsed.kind === 'video' ||
      parsed.kind === 'audio'
    ) {
      return null;
    }
    return parsed;
  }, [captionUrl, post.linkUrl, post.mediaTitle]);

  const resolvedImageUrl =
    post.imageUrl || (parsedLink?.kind === 'image' ? parsedLink.url : '');

  const localMediaDescriptor = useMemo(
    () => resolvePostMediaDescriptor(post),
    [post]
  );

  const openMediaViewer = () => {
    if (onOpenMedia) {
      onOpenMedia(post);
    } else if (localMediaDescriptor) {
      setLocalViewerOpen(true);
    }
  };

  const handleVideoPiP = async () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (typeof el.requestPictureInPicture === 'function') {
        await el.requestPictureInPicture();
      }
    } catch {
      // Ignore if PiP blocked by browser
    }
  };

  return (
    <article
      data-testid="post-card"
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 transition-colors"
    >
      {/* Author Header with unboxed metadata */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onAuthorClick?.(post)}
          aria-label={`View ${post.authorName}'s profile`}
          className="flex items-center gap-3 text-left min-w-0 cursor-pointer group"
        >
          <Avatar src={post.authorAvatar} name={post.authorName} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {post.authorName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              <span>@{post.authorHandle}</span>
              <span className="mx-1" aria-hidden="true">·</span>
              <span>{formatRelativeTime(post.createdAtMs)}</span>
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {isOwnPost && onDeletePost && (
            confirmingDeletePost ? (
              <div className="flex items-center gap-1.5 mr-1">
                <button
                  type="button"
                  disabled={deletingPost}
                  onClick={handleConfirmDeletePost}
                  className="min-h-[34px] px-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {deletingPost ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  disabled={deletingPost}
                  onClick={() => {
                    setConfirmingDeletePost(false);
                    setDeleteError(null);
                  }}
                  className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDeletePost(true)}
                aria-label="Delete post"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onToggleBookmark(post.id)}
            aria-label={
              isBookmarked
                ? `Remove bookmark for ${post.authorName}'s post`
                : `Bookmark ${post.authorName}'s post`
            }
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
              isBookmarked
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bookmark
              className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {deleteError && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {deleteError}
        </p>
      )}

      {/* Caption */}
      {post.caption && (
        <div className="mt-3 text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line break-words">
          <RichText
            text={post.caption}
            onHashtagClick={onSelectHashtag}
            onMentionClick={onMentionClick}
          />
        </div>
      )}

      {/* Interactive Media Frame: Click to open full-screen viewer */}
      {resolvedImageUrl && (
        <div className="relative group mt-3.5 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-800">
          {imgFailed ? (
            <div className="h-56 flex flex-col items-center justify-center gap-2.5 text-slate-500 dark:text-slate-400 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
              <ImageOff className="w-6 h-6" aria-hidden="true" />
              <span className="text-xs">Photo unavailable right now</span>
              <button
                type="button"
                onClick={() => {
                  setImgFailed(false);
                  setMediaRetryNonce((n) => n + 1);
                }}
                className="min-h-[34px] px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={openMediaViewer}
                aria-label={`View full photo posted by ${post.authorName}`}
                className="w-full block text-left cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <img
                  key={`${resolvedImageUrl}-${mediaRetryNonce}`}
                  src={resolvedImageUrl}
                  alt={
                    sanitizeMediaTitle(post.mediaTitle) ||
                    `Photo post by ${post.authorName}`
                  }
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full max-h-[440px] object-cover block"
                />
              </button>
              <button
                type="button"
                onClick={openMediaViewer}
                aria-label={`Expand photo by ${post.authorName}`}
                className="absolute top-2.5 right-2.5 min-h-[36px] px-2.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-semibold inline-flex items-center gap-1.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>View</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Video Player (YouTube / Vimeo Iframe Embed or Direct HTML5 Video with speed, PiP, download, theater mode) */}
      {parsedVideo && (
        <div
          data-testid="post-video-embed"
          className="mt-3.5 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black"
        >
          {(parsedVideo.kind === 'youtube' || parsedVideo.kind === 'vimeo') &&
          parsedVideo.embedUrl ? (
            <div className="aspect-video w-full">
              <iframe
                src={parsedVideo.embedUrl}
                title={parsedVideo.displayTitle}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          ) : videoFailed ? (
            <div className="h-56 flex flex-col items-center justify-center gap-2.5 text-slate-300 bg-slate-950 p-4 text-center">
              <p className="text-xs">Unable to load inline video stream.</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVideoFailed(false);
                    setMediaRetryNonce((n) => n + 1);
                  }}
                  className="min-h-[34px] px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Retry</span>
                </button>
                <a
                  href={parsedVideo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[34px] px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open</span>
                </a>
              </div>
            </div>
          ) : (
            <video
              key={`${parsedVideo.url}-${mediaRetryNonce}`}
              ref={videoRef}
              src={parsedVideo.url}
              controls
              playsInline
              preload="metadata"
              onError={() => setVideoFailed(true)}
              className="w-full max-h-[440px] object-contain bg-black block"
            />
          )}
          <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-900 dark:text-white truncate">
              {parsedVideo.displayTitle}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {parsedVideo.kind === 'video' && (
                <>
                  <button
                    type="button"
                    onClick={() => setPlaybackSpeed((s) => cyclePlaybackSpeed(s))}
                    aria-label={`Cycle video speed (current ${playbackSpeed}x)`}
                    className="min-h-[32px] px-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 font-semibold tabular-nums cursor-pointer"
                  >
                    {playbackSpeed}x
                  </button>
                  {typeof document !== 'undefined' &&
                    document.pictureInPictureEnabled && (
                      <button
                        type="button"
                        onClick={handleVideoPiP}
                        aria-label="Picture in picture"
                        className="min-h-[32px] min-w-[32px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                      >
                        <PictureInPicture2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  <a
                    href={parsedVideo.url}
                    download={deriveMediaDownloadName(
                      {
                        kind: 'video',
                        title: parsedVideo.displayTitle,
                        url: parsedVideo.url,
                      },
                      post.id
                    )}
                    aria-label="Download video"
                    className="min-h-[32px] min-w-[32px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center justify-center"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={openMediaViewer}
                aria-label="Open video in theater viewer"
                className="min-h-[32px] px-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 inline-flex items-center gap-1 font-medium cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Theater</span>
              </button>
              {!parsedVideo.url.startsWith('data:') && (
                <a
                  href={parsedVideo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open video source"
                  className="min-h-[32px] min-w-[32px] rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 inline-flex items-center justify-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Audio Player Card */}
      {parsedAudio && (
        <div
          data-testid="post-audio-player"
          className="mt-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Music className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {parsedAudio.displayTitle}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {parsedAudio.subtitle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setPlaybackSpeed((s) => cyclePlaybackSpeed(s))}
                aria-label={`Cycle audio speed (current ${playbackSpeed}x)`}
                className="min-h-[32px] px-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 tabular-nums cursor-pointer"
              >
                {playbackSpeed}x
              </button>
              <a
                href={parsedAudio.url}
                download={deriveMediaDownloadName(
                  {
                    kind: 'audio',
                    title: parsedAudio.displayTitle,
                    url: parsedAudio.url,
                  },
                  post.id
                )}
                aria-label="Download audio track"
                className="min-h-[32px] min-w-[32px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={openMediaViewer}
                aria-label="Expand audio player"
                className="min-h-[32px] min-w-[32px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {audioFailed ? (
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
              <span>Unable to load audio stream.</span>
              <button
                type="button"
                onClick={() => {
                  setAudioFailed(false);
                  setMediaRetryNonce((n) => n + 1);
                }}
                className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 font-semibold cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : (
            <audio
              key={`${parsedAudio.url}-${mediaRetryNonce}`}
              ref={audioRef}
              src={parsedAudio.url}
              controls
              preload="metadata"
              onError={() => setAudioFailed(true)}
              className="w-full"
            />
          )}
        </div>
      )}

      {/* Rich External Link Preview Card */}
      {parsedLink && parsedLink.kind === 'link' && (
        <a
          data-testid="post-link-preview"
          href={parsedLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3.5 block rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 hover:bg-slate-100 dark:hover:bg-slate-900 transition group"
        >
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="inline-flex items-center gap-1.5 truncate uppercase tracking-wider font-semibold">
              <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              {parsedLink.hostname}
            </span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
            {parsedLink.displayTitle}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {parsedLink.url}
          </p>
        </a>
      )}

      {/* Action Bar */}
      <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => onToggleLike(post)}
            aria-label={
              isLiked
                ? `Unlike post by ${post.authorName} (${post.likesCount} likes)`
                : `Like post by ${post.authorName} (${post.likesCount} likes)`
            }
            className={`min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium tabular-nums transition-colors cursor-pointer ${
              isLiked
                ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Heart
              className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span>{post.likesCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setCommentsOpen((prev) => !prev)}
            aria-expanded={commentsOpen}
            aria-label={`Comments on ${post.authorName}'s post (${comments.length || post.commentsCount})`}
            className="min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums transition-colors cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            <span>{Math.max(post.commentsCount, comments.length)}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {isOwnPost && onShareToStory && (
            <button
              type="button"
              disabled={sharingToStory}
              onClick={handleShareToStory}
              aria-label="Share post to story"
              className={`min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-60 ${
                sharedToStory
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {sharedToStory ? (
                <Check className="w-4 h-4" aria-hidden="true" />
              ) : (
                <PlusCircle className="w-4 h-4" aria-hidden="true" />
              )}
              <span>
                {sharingToStory
                  ? 'Sharing...'
                  : sharedToStory
                    ? 'In Story'
                    : 'To Story'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleShare}
            aria-label={`Share post by ${post.authorName}`}
            className="min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* Expandable Comments Section */}
      {commentsOpen && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {comments.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No replies yet. Start the conversation below.
            </p>
          ) : (
            <div className="space-y-2.5">
              {comments.map((cmt) => {
                const canDeleteComment =
                  Boolean(onDeleteComment) &&
                  (cmt.authorId === currentUserId || isOwnPost);
                return (
                  <div key={cmt.id} className="flex items-start gap-2.5">
                    <Avatar
                      src={cmt.authorAvatar}
                      name={cmt.authorName}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {cmt.authorName}
                        </span>{' '}
                        <span aria-hidden="true">·</span>{' '}
                        <span>{formatRelativeTime(cmt.createdAtMs)}</span>
                      </p>
                      <div className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                        <RichText
                          text={cmt.text}
                          onHashtagClick={onSelectHashtag}
                          onMentionClick={onMentionClick}
                        />
                      </div>
                    </div>
                    {canDeleteComment && (
                      <button
                        type="button"
                        disabled={deletingCommentId === cmt.id}
                        onClick={() => handleDeleteCommentItem(cmt.id)}
                        aria-label={`Delete comment by ${cmt.authorName}`}
                        className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0 disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={handleSubmitComment} className="flex items-center gap-2 pt-1">
            <label htmlFor={`comment-${post.id}`} className="sr-only">
              Write a reply
            </label>
            <input
              id={`comment-${post.id}`}
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a reply..."
              maxLength={500}
              className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={submitting}
              aria-label={`Send reply to ${post.authorName}`}
              className="min-h-[40px] min-w-[40px] px-3 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white flex items-center justify-center cursor-pointer disabled:opacity-60"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
          {commentError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {commentError}
            </p>
          )}
        </div>
      )}

      {!onOpenMedia && localMediaDescriptor && (
        <MediaViewerModal
          open={localViewerOpen}
          entries={[{ post, media: localMediaDescriptor }]}
          activePostId={post.id}
          currentUserId={currentUserId}
          likedPostIds={isLiked ? [post.id] : []}
          bookmarkedPostIds={isBookmarked ? [post.id] : []}
          onClose={() => setLocalViewerOpen(false)}
          onSelectPostId={() => {}}
          onToggleLike={onToggleLike}
          onToggleBookmark={onToggleBookmark}
          onShareToStory={onShareToStory}
          onAuthorClick={onAuthorClick}
          onSelectHashtag={onSelectHashtag}
          onMentionClick={onMentionClick}
        />
      )}
    </article>
  );
}
