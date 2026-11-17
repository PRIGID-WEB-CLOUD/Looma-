import { useMemo, useState } from 'react';
import {
  Clock,
  Edit3,
  Eye,
  EyeOff,
  FileAudio,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  Search,
  Trash2,
  Video,
} from 'lucide-react';
import type { Post, PostCategory, StoryGroup } from '../../src/types/social';
import { formatRelativeTime, POST_CATEGORIES } from '../../src/utils/socialLogic';
import { filterAdminComments, type AdminCommentItem } from '../adminLogic';

interface ContentModerationSectionProps {
  posts: Post[];
  storyGroups: StoryGroup[];
  comments?: AdminCommentItem[];
  hiddenSet: Set<string>;
  postSearch: string;
  postCategory: 'All' | PostCategory | 'Hidden';
  onChangePostSearch: (q: string) => void;
  onChangePostCategory: (cat: 'All' | PostCategory | 'Hidden') => void;
  onToggleHidePost: (postId: string) => void;
  onEditPost?: (
    postId: string,
    updates: {
      caption: string;
      category: PostCategory;
      imageUrl: string;
      linkUrl?: string;
      mediaTitle?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeletePost: (postId: string) => Promise<void>;
  onDeleteStory: (storyId: string) => Promise<void>;
  onDeleteComment?: (
    postId: string,
    commentId: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function ContentModerationSection({
  posts,
  storyGroups,
  comments = [],
  hiddenSet,
  postSearch,
  postCategory,
  onChangePostSearch,
  onChangePostCategory,
  onToggleHidePost,
  onEditPost,
  onDeletePost,
  onDeleteStory,
  onDeleteComment,
}: ContentModerationSectionProps) {
  const [subTab, setSubTab] = useState<'posts' | 'stories' | 'comments'>('posts');
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editCategory, setEditCategory] = useState<PostCategory>('Architecture');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editLinkUrl, setEditLinkUrl] = useState('');
  const [editMediaTitle, setEditMediaTitle] = useState('');
  const [commentSearch, setCommentSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const flatStories = storyGroups.flatMap((group) => group.items);
  const nowMs = Date.now();
  const visibleComments = useMemo(
    () => filterAdminComments(comments, commentSearch),
    [commentSearch, comments]
  );

  const handleConfirmDeletePost = async (postId: string) => {
    setBusyId(postId);
    await onDeletePost(postId);
    setBusyId(null);
    setConfirmDeletePostId(null);
  };

  const startEditingPost = (post: Post) => {
    setEditingPostId(post.id);
    setEditCaption(post.caption || '');
    setEditCategory(post.category);
    setEditImageUrl(post.imageUrl || '');
    setEditLinkUrl(post.linkUrl || '');
    setEditMediaTitle(post.mediaTitle || '');
    setFeedback(null);
  };

  const handleSavePostEdit = async (postId: string) => {
    if (!onEditPost) return;
    setBusyId(postId);
    setFeedback(null);
    const res = await onEditPost(postId, {
      caption: editCaption,
      category: editCategory,
      imageUrl: editImageUrl,
      linkUrl: editLinkUrl,
      mediaTitle: editMediaTitle,
    });
    setBusyId(null);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Could not save post updates.' });
      return;
    }
    setEditingPostId(null);
    setFeedback({ type: 'ok', text: 'Updated post content and saved audit trail entry.' });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Feed, Stories &amp; Comments Moderation
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Edit, hide, restore, or remove feed posts, 24-hour stories, and user comments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start">
          <button
            type="button"
            onClick={() => setSubTab('posts')}
            className={`min-h-[34px] px-3 rounded-md text-xs font-semibold cursor-pointer tabular-nums whitespace-nowrap ${
              subTab === 'posts'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Feed Posts ({posts.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('stories')}
            className={`min-h-[34px] px-3 rounded-md text-xs font-semibold cursor-pointer tabular-nums whitespace-nowrap ${
              subTab === 'stories'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Stories ({flatStories.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('comments')}
            className={`min-h-[34px] px-3 rounded-md text-xs font-semibold cursor-pointer tabular-nums whitespace-nowrap inline-flex items-center gap-1.5 ${
              subTab === 'comments'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Comments ({comments.length})</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
            feedback.type === 'err'
              ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
              : 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {subTab === 'posts' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search posts for moderation"
                value={postSearch}
                onChange={(e) => onChangePostSearch(e.target.value)}
                placeholder="Search caption or author"
                className="w-full min-h-[40px] pl-9 pr-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              aria-label="Filter posts by category"
              value={postCategory}
              onChange={(e) =>
                onChangePostCategory(e.target.value as 'All' | PostCategory | 'Hidden')
              }
              className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="All">All Categories</option>
              <option value="Hidden">Hidden Only</option>
              {POST_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {posts.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No posts match the current moderation filter.
              </div>
            ) : (
              posts.map((post) => {
                const isHidden = hiddenSet.has(post.id);
                const confirming = confirmDeletePostId === post.id;
                const isEditing = editingPostId === post.id;
                return (
                  <article key={post.id} className="p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {post.authorName}
                          </span>
                          <span>@{post.authorHandle}</span>
                          <span aria-hidden="true">·</span>
                          <span>{post.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatRelativeTime(post.createdAtMs)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-mono font-semibold ${
                              isHidden
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {isHidden ? 'HIDDEN' : 'LIVE'}
                          </span>
                        </div>

                        <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 max-w-[68ch]">
                          {post.caption || post.mediaTitle || 'Media post'}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          <span>
                            {post.likesCount} likes · {post.commentsCount} comments
                          </span>
                          {post.imageUrl && (
                            <span className="inline-flex items-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" /> Image
                            </span>
                          )}
                          {post.videoUrl && (
                            <span className="inline-flex items-center gap-1">
                              <Video className="w-3.5 h-3.5" aria-hidden="true" /> Video
                            </span>
                          )}
                          {post.audioUrl && (
                            <span className="inline-flex items-center gap-1">
                              <FileAudio className="w-3.5 h-3.5" aria-hidden="true" /> Voice Note
                            </span>
                          )}
                          {post.linkUrl && (
                            <span className="inline-flex items-center gap-1">
                              <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> Rich Link
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {onEditPost && (
                          <button
                            type="button"
                            onClick={() =>
                              isEditing ? setEditingPostId(null) : startEditingPost(post)
                            }
                            className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{isEditing ? 'Close Editor' : 'Edit Post'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onToggleHidePost(post.id)}
                          className="min-h-[38px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          {isHidden ? (
                            <>
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Restore Post</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Hide Post</span>
                            </>
                          )}
                        </button>

                        {confirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busyId === post.id}
                              onClick={() => void handleConfirmDeletePost(post.id)}
                              className="min-h-[38px] px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePostId(null)}
                              className="min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePostId(post.id)}
                            aria-label={`Delete post by ${post.authorName}`}
                            className="min-h-[38px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing && onEditPost && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Category
                          </span>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as PostCategory)}
                            className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                          >
                            {POST_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Image URL
                          </span>
                          <input
                            type="text"
                            value={editImageUrl}
                            onChange={(e) => setEditImageUrl(e.target.value)}
                            className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Link URL (optional)
                          </span>
                          <input
                            type="url"
                            value={editLinkUrl}
                            onChange={(e) => setEditLinkUrl(e.target.value)}
                            className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Media Title (optional)
                          </span>
                          <input
                            type="text"
                            maxLength={120}
                            value={editMediaTitle}
                            onChange={(e) => setEditMediaTitle(e.target.value)}
                            className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                          />
                        </label>

                        <label className="md:col-span-2 block space-y-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Caption
                          </span>
                          <textarea
                            rows={2}
                            maxLength={1200}
                            value={editCaption}
                            onChange={(e) => setEditCaption(e.target.value)}
                            className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white resize-none"
                          />
                        </label>

                        <div className="md:col-span-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingPostId(null)}
                            className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={busyId === post.id}
                            onClick={() => void handleSavePostEdit(post.id)}
                            className="min-h-[36px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Save Post Changes
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </>
      ) : subTab === 'stories' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {flatStories.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No active stories found in the workspace.
            </div>
          ) : (
            flatStories.map((story) => {
              const expired = story.expiresAtMs <= nowMs;
              return (
                <div
                  key={story.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {story.authorName}
                      </span>
                      <span>@{story.authorHandle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {formatRelativeTime(story.createdAtMs)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-mono font-semibold ${
                          expired
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {expired ? 'EXPIRED TTL' : 'ACTIVE 24H'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {story.caption || 'Visual story frame'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onDeleteStory(story.id)}
                    className="min-h-[38px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Remove Story</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search comments for moderation"
              value={commentSearch}
              onChange={(e) => setCommentSearch(e.target.value)}
              placeholder="Search comment text, author, or post"
              className="w-full min-h-[40px] pl-9 pr-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {visibleComments.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No comments match the active filter.
              </div>
            ) : (
              visibleComments.map((comment) => (
                <article
                  key={`${comment.postId}:${comment.id}`}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {comment.authorName}
                      </span>
                      <span>@{comment.authorHandle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatRelativeTime(comment.createdAtMs)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 max-w-[68ch]">
                      {comment.text}
                    </p>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate max-w-[68ch]">
                      On post {comment.postId}
                      {comment.postCaption ? `: "${comment.postCaption}"` : ''}
                    </p>
                  </div>

                  {onDeleteComment && (
                    <button
                      type="button"
                      disabled={busyId === comment.id}
                      onClick={async () => {
                        setBusyId(comment.id);
                        const res = await onDeleteComment(comment.postId, comment.id);
                        setBusyId(null);
                        setFeedback(
                          res.ok
                            ? { type: 'ok', text: `Deleted comment by @${comment.authorHandle}.` }
                            : { type: 'err', text: res.error || 'Could not delete comment.' }
                        );
                      }}
                      className="min-h-[38px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Delete Comment</span>
                    </button>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

