import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CornerDownRight,
  Heart,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { BusinessProfile, PlatformMode } from '../types/business';
import type { Post, PostComment, UserProfile } from '../types/social';
import {
  buildNestedCommentTree,
  type CommentSortOrder,
} from '../utils/identityResolver';
import { formatRelativeTime } from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { RichText } from './RichText';
import { VerifiedBadge } from './VerifiedBadge';

interface CommentThreadViewProps {
  post: Post | null;
  comments: PostComment[];
  currentProfile: UserProfile;
  platformMode: PlatformMode;
  activeBusinessProfile: BusinessProfile | null;
  onBack: () => void;
  onSubscribeComments: (postId: string) => () => void;
  onAddComment: (
    post: Post,
    text: string,
    options?: {
      parentCommentId?: string;
      asBusinessProfile?: BusinessProfile | null;
    }
  ) => Promise<void>;
  onUpdateComment: (
    postId: string,
    commentId: string,
    nextText: string
  ) => Promise<void>;
  onDeleteComment: (post: Post, commentId: string) => Promise<void>;
  onToggleCommentLike: (postId: string, commentId: string) => Promise<void>;
  onOpenAuthor?: (post: Post) => void;
  onSelectHashtag?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
}

export function CommentThreadView({
  post,
  comments,
  currentProfile,
  platformMode,
  activeBusinessProfile,
  onBack,
  onSubscribeComments,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onToggleCommentLike,
  onOpenAuthor,
  onSelectHashtag,
  onMentionClick,
}: CommentThreadViewProps) {
  const [sortOrder, setSortOrder] = useState<CommentSortOrder>('top');
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [draftText, setDraftText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!post?.id) return;
    return onSubscribeComments(post.id);
  }, [onSubscribeComments, post?.id]);

  const threadNodes = useMemo(
    () => buildNestedCommentTree(comments, sortOrder),
    [comments, sortOrder]
  );

  const actingBusiness =
    platformMode === 'business' && activeBusinessProfile
      ? activeBusinessProfile
      : null;

  const canModifyComment = (cmt: PostComment): boolean => {
    if (cmt.authorId === currentProfile.uid || cmt.actorUid === currentProfile.uid) {
      return true;
    }
    if (
      actingBusiness &&
      cmt.authorType === 'business' &&
      cmt.businessProfileId === actingBusiness.id
    ) {
      return true;
    }
    if (
      post &&
      (post.authorId === currentProfile.uid ||
        (actingBusiness && post.businessProfileId === actingBusiness.id))
    ) {
      return true;
    }
    return false;
  };

  const canEditComment = (cmt: PostComment): boolean => {
    if (cmt.authorId === currentProfile.uid || cmt.actorUid === currentProfile.uid) {
      return true;
    }
    if (
      actingBusiness &&
      cmt.authorType === 'business' &&
      cmt.businessProfileId === actingBusiness.id
    ) {
      return true;
    }
    return false;
  };

  const handleSubmitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!post || !draftText.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onAddComment(post, draftText.trim(), {
        parentCommentId: replyTo?.id,
        asBusinessProfile: actingBusiness,
      });
      setDraftText('');
      setReplyTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!post || !editDraft.trim() || savingEdit) return;
    setError(null);
    setSavingEdit(true);
    try {
      await onUpdateComment(post.id, commentId, editDraft.trim());
      setEditingId(null);
      setEditDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update comment.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async (commentId: string) => {
    if (!post) return;
    setError(null);
    try {
      await onDeleteComment(post, commentId);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete comment.');
    }
  };

  if (!post) {
    return (
      <section aria-label="Post Comments" className="max-w-3xl mx-auto space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </button>
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
          <MessageCircle className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            Conversation Not Available
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            This post could not be located or is still loading.
          </p>
        </div>
      </section>
    );
  }

  const renderCommentRow = (cmt: PostComment, isReply = false) => {
    const isEditing = editingId === cmt.id;
    const likesCount = Number(cmt.likesCount || 0);
    return (
      <div
        key={cmt.id}
        className={`flex items-start gap-3 ${isReply ? 'pl-8 sm:pl-11 pt-2' : 'pt-4 first:pt-0'}`}
      >
        {isReply && (
          <CornerDownRight
            className="w-3.5 h-3.5 text-slate-400 mt-2 shrink-0"
            aria-hidden="true"
          />
        )}
        <Avatar src={cmt.authorAvatar} name={cmt.authorName} size="sm" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 text-xs">
                <span className="font-bold text-slate-900 dark:text-white truncate">
                  {cmt.authorName}
                </span>
                {cmt.authorVerified && <VerifiedBadge size={13} />}
                <span className="text-slate-500 dark:text-slate-400 truncate">
                  @{cmt.authorHandle}
                </span>
                <span className="text-slate-400 tabular-nums">
                  · {formatRelativeTime(cmt.createdAtMs)}
                </span>
                {cmt.edited && (
                  <span className="text-[11px] text-slate-400">(edited)</span>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="mt-2 space-y-2">
                <textarea
                  rows={2}
                  maxLength={500}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  aria-label="Edit comment text"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs resize-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft('');
                    }}
                    className="min-h-[32px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => void handleSaveEdit(cmt.id)}
                    className="min-h-[32px] px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {savingEdit ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-1 leading-relaxed break-words">
                <RichText
                  text={cmt.text}
                  onHashtagClick={onSelectHashtag}
                  onMentionClick={onMentionClick}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 px-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => void onToggleCommentLike(post.id, cmt.id)}
              className={`inline-flex items-center gap-1 cursor-pointer tabular-nums ${
                cmt.likedByCurrentUser
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Heart
                className={`w-3.5 h-3.5 ${cmt.likedByCurrentUser ? 'fill-current' : ''}`}
                aria-hidden="true"
              />
              <span>{likesCount > 0 ? likesCount : 'Like'}</span>
            </button>

            <button
              type="button"
              onClick={() => setReplyTo(cmt)}
              className="hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
            >
              Reply
            </button>

            {canEditComment(cmt) && !isEditing && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(cmt.id);
                  setEditDraft(cmt.text);
                }}
                className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <Pencil className="w-3 h-3" aria-hidden="true" />
                <span>Edit</span>
              </button>
            )}

            {canModifyComment(cmt) && (
              confirmDeleteId === cmt.id ? (
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleConfirmDelete(cmt.id)}
                    className="text-rose-600 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-slate-500 hover:underline cursor-pointer"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(cmt.id)}
                  className="inline-flex items-center gap-1 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Full-Screen Comment Thread"
      className="max-w-3xl mx-auto space-y-5"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {(
            [
              { id: 'top', label: 'Top' },
              { id: 'newest', label: 'Newest' },
              { id: 'oldest', label: 'Oldest' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSortOrder(item.id)}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                sortOrder === item.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pinned Original Post Summary */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex items-start gap-4">
        <button
          type="button"
          onClick={() => onOpenAuthor?.(post)}
          className="flex items-start gap-3 min-w-0 flex-1 text-left cursor-pointer"
        >
          <Avatar src={post.authorAvatar} name={post.authorName} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-900 dark:text-white">
                {post.authorName}
              </span>
              {post.authorVerified && <VerifiedBadge size={14} />}
              <span className="text-slate-500 dark:text-slate-400">
                @{post.authorHandle} · {formatRelativeTime(post.createdAtMs)}
              </span>
            </div>
            {post.caption && (
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 mt-1.5 line-clamp-3 leading-relaxed">
                {post.caption}
              </p>
            )}
          </div>
        </button>

        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt="Post attachment thumbnail"
            className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-slate-200 dark:border-slate-800"
          />
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmitComment}
        className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3"
      >
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Commenting as{' '}
            <strong className="text-slate-900 dark:text-white">
              {actingBusiness
                ? `${actingBusiness.displayName} (@${actingBusiness.slug})`
                : `${currentProfile.displayName} (@${currentProfile.handle})`}
            </strong>
          </span>
          <span className="tabular-nums">{comments.length} comments</span>
        </div>

        {replyTo && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
            <span className="truncate">
              Replying to <strong>@{replyTo.authorHandle}</strong>: {replyTo.text}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="shrink-0 p-1 hover:text-blue-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2.5">
          <Avatar
            src={actingBusiness ? actingBusiness.logoUrl : currentProfile.avatarUrl}
            name={actingBusiness ? actingBusiness.displayName : currentProfile.displayName}
            size="sm"
          />
          <textarea
            rows={2}
            maxLength={500}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder={
              replyTo
                ? `Write a reply to @${replyTo.authorHandle}...`
                : 'Add to the conversation...'
            }
            aria-label="Write a comment"
            className="flex-1 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={submitting || !draftText.trim()}
            aria-label="Post comment"
            className="min-h-[44px] px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">{submitting ? 'Posting...' : 'Post'}</span>
          </button>
        </div>
      </form>

      {/* Threaded Comments List */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5">
        {threadNodes.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <MessageCircle className="w-7 h-7 text-slate-400 mx-auto" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              No comments yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Start the discussion above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-4">
            {threadNodes.map((node) => (
              <div key={node.comment.id} className="pt-4 first:pt-0 space-y-2">
                {renderCommentRow(node.comment, false)}
                {node.replies.map((reply) => renderCommentRow(reply, true))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
