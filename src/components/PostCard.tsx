import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Bookmark,
  Check,
  Download,
  ExternalLink,
  Flag,
  Globe,
  Heart,
  ImageOff,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Music,
  Pencil,
  PictureInPicture2,
  PlusCircle,
  RotateCcw,
  Search,
  Send,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import type { ChatThread, Post, PostCategory, PostComment } from '../types/social';
import {
  buildPostSharePayload,
  canSharePostToStory,
  cyclePlaybackSpeed,
  deriveMediaDownloadName,
  extractFirstUrl,
  formatRelativeTime,
  mergeCategoryNames,
  normalizeAssetUrl,
  parseRichUrl,
  POST_CATEGORIES,
  resolvePostLinkPreview,
  resolvePostMediaDescriptor,
  sanitizeMediaTitle,
  validateCommentInput,
  validatePostInput,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { ExpandablePostText } from './ExpandablePostText';
import { MediaViewerModal } from './MediaViewerModal';
import { RichText } from './RichText';
import { VerifiedBadge } from './VerifiedBadge';

interface PostCardProps {
  post: Post;
  currentUserId?: string;
  isLiked: boolean;
  isBookmarked: boolean;
  comments: PostComment[];
  shareThreads?: ChatThread[];
  categories?: string[];
  onToggleLike: (post: Post) => void;
  onToggleBookmark: (postId: string) => void;
  onAddComment: (post: Post, text: string) => Promise<void>;
  onUpdatePost?: (
    post: Post,
    updates: { caption: string; category: PostCategory }
  ) => Promise<void>;
  onDeletePost?: (post: Post) => Promise<void>;
  onDeleteComment?: (post: Post, commentId: string) => Promise<void>;
  onShareToStory?: (post: Post) => Promise<unknown> | void;
  onShareToChat?: (thread: ChatThread, post: Post) => Promise<void>;
  onAuthorClick?: (post: Post) => void;
  onSelectHashtag?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
  onOpenMedia?: (post: Post) => void;
  onReportPost?: (
    post: Post,
    category: 'spam' | 'harassment' | 'misinformation' | 'nudity' | 'copyright' | 'other',
    reason: string
  ) => Promise<void>;
}

export function PostCard({
  post,
  currentUserId = '',
  isLiked,
  isBookmarked,
  comments,
  shareThreads = [],
  categories = POST_CATEGORIES,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onUpdatePost,
  onDeletePost,
  onDeleteComment,
  onShareToStory,
  onShareToChat,
  onAuthorClick,
  onSelectHashtag,
  onMentionClick,
  onOpenMedia,
  onReportPost,
}: PostCardProps) {
  const editCategoryOptions = useMemo(
    () => mergeCategoryNames([...categories, post.category], POST_CATEGORIES),
    [categories, post.category]
  );
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
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareThreadSearch, setShareThreadSearch] = useState('');
  const [sharingChatId, setSharingChatId] = useState<string | null>(null);
  const [sharedChatIds, setSharedChatIds] = useState<string[]>([]);
  const [shareStatusMessage, setShareStatusMessage] = useState<string | null>(null);
  const [sharingToStory, setSharingToStory] = useState(false);
  const [sharedToStory, setSharedToStory] = useState(false);
  const [confirmingDeletePost, setConfirmingDeletePost] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption);
  const [editCategory, setEditCategory] = useState<PostCategory>(post.category);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<
    'spam' | 'harassment' | 'misinformation' | 'nudity' | 'copyright' | 'other'
  >('spam');
  const [reportReason, setReportReason] = useState('');
  const [reportingPost, setReportingPost] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);

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

  const handleOpenShareModal = () => {
    setShareStatusMessage(null);
    setShareThreadSearch('');
    setShareModalOpen(true);
  };

  const handleShareToChatThread = async (thread: ChatThread) => {
    if (!onShareToChat || sharingChatId) return;
    setSharingChatId(thread.id);
    setShareStatusMessage(null);
    try {
      await onShareToChat(thread, post);
      setSharedChatIds((prev) =>
        prev.includes(thread.id) ? prev : [...prev, thread.id]
      );
      setShareStatusMessage(`Shared to ${thread.title}`);
    } catch (err) {
      setShareStatusMessage(
        err instanceof Error ? err.message : 'Unable to share post right now.'
      );
    } finally {
      setSharingChatId(null);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      return;
    }
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await navigator.share(buildPostSharePayload(post, origin));
      setShareStatusMessage('Shared via device sheet');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setShareStatusMessage('Device share was unavailable.');
    }
  };

  const filteredShareThreads = useMemo(() => {
    const clean = shareThreadSearch.trim().toLowerCase();
    if (!clean) return shareThreads;
    return shareThreads.filter(
      (t) =>
        t.title.toLowerCase().includes(clean) ||
        t.partnerHandle.toLowerCase().includes(clean)
    );
  }, [shareThreadSearch, shareThreads]);

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

  const handleOpenEdit = () => {
    setEditCaption(post.caption);
    setEditCategory(post.category);
    setEditError(null);
    setConfirmingDeletePost(false);
    setEditingPost(true);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!onUpdatePost || savingEdit) return;
    const hasAttachment = Boolean(
      post.imageUrl || post.videoUrl || post.audioUrl || post.linkUrl
    );
    const check = validatePostInput(
      editCaption,
      editCategory,
      hasAttachment,
      editCategoryOptions
    );
    if (!check.valid) {
      setEditError(check.error || 'Enter valid post content.');
      return;
    }
    setEditError(null);
    setSavingEdit(true);
    try {
      await onUpdatePost(post, {
        caption: editCaption.trim(),
        category: editCategory,
      });
      setEditingPost(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to save post changes.');
    } finally {
      setSavingEdit(false);
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

  const handleSubmitPostReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!onReportPost || reportingPost) return;
    if (!reportReason.trim()) {
      setReportError('Please describe why you are reporting this post.');
      return;
    }
    setReportError(null);
    setReportingPost(true);
    try {
      await onReportPost(post, reportCategory, reportReason.trim());
      setReportSubmitted(true);
      setReportReason('');
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setReportingPost(false);
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

  const parsedLink = useMemo(() => resolvePostLinkPreview(post), [post]);

  const resolvedImageUrl = normalizeAssetUrl(
    post.imageUrl || (parsedLink?.kind === 'image' ? parsedLink.url : '')
  );

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
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors inline-flex items-center gap-1.5">
              <span>{post.authorName}</span>
              {post.authorVerified && <VerifiedBadge size={14} />}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              <span>@{post.authorHandle}</span>
              <span className="mx-1" aria-hidden="true">·</span>
              <span>{formatRelativeTime(post.createdAtMs)}</span>
              <span className="mx-1" aria-hidden="true">·</span>
              <span>{post.category}</span>
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {isOwnPost && onUpdatePost && !editingPost && !confirmingDeletePost && (
            <button
              type="button"
              onClick={handleOpenEdit}
              aria-label="Edit post"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

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
        </div>
      </div>

      {deleteError && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {deleteError}
        </p>
      )}

      {/* Caption or Inline Edit Form */}
      {editingPost ? (
        <form
          onSubmit={handleSaveEdit}
          data-testid={`edit-post-form-${post.id}`}
          className="mt-3 rounded-2xl border border-blue-200 dark:border-blue-900/70 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-3"
        >
          <div>
            <label
              htmlFor={`edit-caption-${post.id}`}
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Edit Caption
            </label>
            <textarea
              id={`edit-caption-${post.id}`}
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              rows={3}
              maxLength={1200}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor={`edit-category-${post.id}`}
                className="text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                Category
              </label>
              <select
                id={`edit-category-${post.id}`}
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as PostCategory)}
                className="min-h-[36px] px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {editCategoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => {
                  setEditingPost(false);
                  setEditError(null);
                }}
                className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="min-h-[36px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
          {editError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {editError}
            </p>
          )}
        </form>
      ) : (
        post.caption && (
          <div className="mt-3">
            <ExpandablePostText
              text={post.caption}
              onHashtagClick={onSelectHashtag}
              onMentionClick={onMentionClick}
            />
          </div>
        )
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
      <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={() => onToggleLike(post)}
            aria-label={
              isLiked
                ? `Unlike post by ${post.authorName} (${post.likesCount} likes)`
                : `Like post by ${post.authorName} (${post.likesCount} likes)`
            }
            className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium tabular-nums whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              isLiked
                ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Heart
              className={`w-4 h-4 shrink-0 ${isLiked ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span>{post.likesCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setCommentsOpen((prev) => !prev)}
            aria-expanded={commentsOpen}
            aria-label={`Comments on ${post.authorName}'s post (${comments.length || post.commentsCount})`}
            className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{Math.max(post.commentsCount, comments.length)}</span>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isOwnPost && onShareToStory && (
            <button
              type="button"
              disabled={sharingToStory}
              onClick={handleShareToStory}
              aria-label="Share post to story"
              className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-60 ${
                sharedToStory
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {sharedToStory ? (
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <PlusCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {sharingToStory
                  ? 'Sharing...'
                  : sharedToStory
                    ? 'In Story'
                    : 'To Story'}
              </span>
              <span className="sm:hidden">
                {sharingToStory ? '...' : sharedToStory ? 'Added' : 'Story'}
              </span>
            </button>
          )}

          {!isOwnPost && onReportPost && (
            <button
              type="button"
              onClick={() => {
                setReportError(null);
                setReportSubmitted(false);
                setReportModalOpen(true);
              }}
              aria-label={`Report post by ${post.authorName}`}
              className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Flag className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Report</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenShareModal}
            aria-label={`Share post by ${post.authorName}`}
            className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Share</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleBookmark(post.id)}
            aria-label={
              isBookmarked
                ? `Remove bookmark for post by ${post.authorName}`
                : `Bookmark post by ${post.authorName}`
            }
            className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              isBookmarked
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bookmark
              className={`w-4 h-4 shrink-0 ${isBookmarked ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{isBookmarked ? 'Saved' : 'Save'}</span>
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
                      <p className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {cmt.authorName}
                        </span>
                        {cmt.authorVerified && <VerifiedBadge size={12} />}
                        <span aria-hidden="true">·</span>
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

      {shareModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Share post by ${post.authorName}`}
          data-testid="share-post-modal"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Share Post
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Post by {post.authorName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                aria-label="Close share modal"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 text-xs text-slate-700 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1 max-w-full min-w-0">
                  <span className="truncate">{post.authorName}</span>
                  {post.authorVerified && <VerifiedBadge size={12} />}
                  <span className="font-normal text-slate-500 dark:text-slate-400 shrink-0">
                    · @{post.authorHandle}
                  </span>
                </p>
                {post.caption && (
                  <p className="mt-1 line-clamp-2 text-slate-600 dark:text-slate-400">
                    {post.caption}
                  </p>
                )}
              </div>

              {(isOwnPost && onShareToStory) ||
              (typeof navigator !== 'undefined' &&
                typeof navigator.share === 'function') ? (
                <div className="flex flex-wrap gap-2">
                  {isOwnPost && onShareToStory && (
                    <button
                      type="button"
                      disabled={sharingToStory}
                      onClick={handleShareToStory}
                      className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <PlusCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span>
                        {sharingToStory
                          ? 'Sharing...'
                          : sharedToStory
                            ? 'Shared to Story'
                            : 'Share to Story'}
                      </span>
                    </button>
                  )}

                  {typeof navigator !== 'undefined' &&
                    typeof navigator.share === 'function' && (
                      <button
                        type="button"
                        onClick={handleNativeShare}
                        className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Share2 className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                        <span>Share via Device...</span>
                      </button>
                    )}
                </div>
              ) : null}

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Send to Looma Chat
                  </p>
                  {shareStatusMessage && (
                    <span
                      role="status"
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      {shareStatusMessage}
                    </span>
                  )}
                </div>

                {shareThreads.length > 4 && (
                  <div className="relative">
                    <Search
                      className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={shareThreadSearch}
                      onChange={(e) => setShareThreadSearch(e.target.value)}
                      placeholder="Filter conversations..."
                      className="w-full min-h-[38px] pl-8 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                )}

                {!onShareToChat || filteredShareThreads.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                    {shareThreads.length === 0
                      ? 'Start a chat in Messages to share posts directly with friends.'
                      : 'No matching conversations found.'}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {filteredShareThreads.map((thread) => {
                      const alreadySent = sharedChatIds.includes(thread.id);
                      const isSending = sharingChatId === thread.id;
                      return (
                        <div
                          key={thread.id}
                          className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-slate-900"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              src={thread.partnerAvatar}
                              name={thread.title}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {thread.title}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {thread.isGroup ? thread.partnerHandle : `@${thread.partnerHandle}`}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isSending}
                            onClick={() => handleShareToChatThread(thread)}
                            className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-60 ${
                              alreadySent
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white'
                            }`}
                          >
                            {alreadySent ? (
                              <>
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Sent</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{isSending ? 'Sending...' : 'Send'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {reportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Report post by ${post.authorName}`}
          data-testid="report-post-modal"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Report Post
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Flag content by @{post.authorHandle} for moderation review
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                aria-label="Close report modal"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {reportSubmitted ? (
              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                  <p className="font-semibold">Report submitted to moderators</p>
                  <p>Thank you for helping keep the Looma community safe. Our trust &amp; safety team will review this post.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="w-full min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitPostReport} className="p-5 space-y-4">
                <div>
                  <label
                    htmlFor={`report-cat-${post.id}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Category
                  </label>
                  <select
                    id={`report-cat-${post.id}`}
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value as any)}
                    className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="spam">Spam or unsolicited promotion</option>
                    <option value="harassment">Harassment or abusive language</option>
                    <option value="misinformation">Misinformation</option>
                    <option value="nudity">Inappropriate or sensitive media</option>
                    <option value="copyright">Copyright or attribution issue</option>
                    <option value="other">Other guideline violation</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`report-reason-${post.id}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Details for moderators
                  </label>
                  <textarea
                    id={`report-reason-${post.id}`}
                    rows={3}
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    maxLength={500}
                    placeholder="Share context so reviewers can act quickly..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
                  />
                </div>
                {reportError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {reportError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={reportingPost}
                    onClick={() => setReportModalOpen(false)}
                    className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reportingPost}
                    className="min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {reportingPost ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </form>
            )}
          </div>
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
