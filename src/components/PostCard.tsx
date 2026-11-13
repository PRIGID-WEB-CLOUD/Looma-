import { useMemo, useState, type FormEvent } from 'react';
import {
  Bookmark,
  Check,
  ExternalLink,
  Globe,
  Heart,
  ImageOff,
  MessageCircle,
  Music,
  PlusCircle,
  Send,
  Share2,
} from 'lucide-react';
import type { Post, PostComment } from '../types/social';
import {
  canSharePostToStory,
  extractFirstUrl,
  formatRelativeTime,
  parseRichUrl,
  validateCommentInput,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';
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
  onShareToStory?: (post: Post) => Promise<unknown> | void;
  onAuthorClick?: (post: Post) => void;
  onSelectHashtag?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
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
  onShareToStory,
  onAuthorClick,
  onSelectHashtag,
  onMentionClick,
}: PostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharingToStory, setSharingToStory] = useState(false);
  const [sharedToStory, setSharedToStory] = useState(false);

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
              <span className="mx-1" aria-hidden="true">·</span>
              <span>{post.category}</span>
            </p>
          </div>
        </button>

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

      {/* Media Frame with zero-broken-image fallback */}
      {resolvedImageUrl && (
        <div className="mt-3.5 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-800">
          {imgFailed ? (
            <div className="h-56 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
              <ImageOff className="w-6 h-6" aria-hidden="true" />
              <span className="text-xs">{post.category} photo unavailable</span>
            </div>
          ) : (
            <img
              src={resolvedImageUrl}
              alt={`${post.category} post by ${post.authorName}`}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full max-h-[440px] object-cover block"
            />
          )}
        </div>
      )}

      {/* Video Player (YouTube / Vimeo Iframe Embed or Direct HTML5 Video) */}
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
          ) : (
            <video
              src={parsedVideo.url}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-[440px] object-contain bg-black block"
            />
          )}
          {!parsedVideo.url.startsWith('data:') && (
            <a
              href={parsedVideo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {parsedVideo.displayTitle}
              </span>
              <span className="text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 shrink-0">
                <span>{parsedVideo.hostname}</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </span>
            </a>
          )}
        </div>
      )}

      {/* Audio Player Card */}
      {parsedAudio && (
        <div
          data-testid="post-audio-player"
          className="mt-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2.5"
        >
          <div className="flex items-center gap-2.5">
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
          <audio src={parsedAudio.url} controls className="w-full" />
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
              {comments.map((cmt) => (
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
                </div>
              ))}
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
    </article>
  );
}
