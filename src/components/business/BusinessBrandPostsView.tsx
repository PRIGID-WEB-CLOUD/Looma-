import { useMemo } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import type { BusinessMembershipRole, BusinessProfile } from '../../types/business';
import type {
  ChatThread,
  Post,
  PostCategory,
  PostComment,
} from '../../types/social';
import { PostCard } from '../PostCard';

interface BusinessBrandPostsViewProps {
  businessProfile: BusinessProfile;
  role: BusinessMembershipRole;
  currentUserId: string;
  posts: Post[];
  commentsByPost: Record<string, PostComment[]>;
  likedPostIds: string[];
  bookmarkedPostIds: string[];
  shareThreads: ChatThread[];
  categories: string[];
  onCreateBrandPost: () => void;
  onToggleLike: (post: Post) => void;
  onToggleBookmark: (postId: string) => void;
  onAddComment: (post: Post, text: string) => Promise<void>;
  onUpdatePost: (
    post: Post,
    updates: { caption: string; category: PostCategory }
  ) => Promise<void>;
  onDeletePost: (post: Post) => Promise<void>;
  onDeleteComment: (post: Post, commentId: string) => Promise<void>;
  onShareToStory: (post: Post) => Promise<unknown> | void;
  onShareToChat: (thread: ChatThread, post: Post) => Promise<void>;
  onSelectHashtag: (tag: string) => void;
  onMentionClick: (handle: string) => void;
  onOpenComments?: (post: Post) => void;
}

export function BusinessBrandPostsView({
  businessProfile,
  role,
  currentUserId,
  posts,
  commentsByPost,
  likedPostIds,
  bookmarkedPostIds,
  shareThreads,
  categories,
  onCreateBrandPost,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onUpdatePost,
  onDeletePost,
  onDeleteComment,
  onShareToStory,
  onShareToChat,
  onSelectHashtag,
  onMentionClick,
  onOpenComments,
}: BusinessBrandPostsViewProps) {
  const canPublish = role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';

  const brandPosts = useMemo(
    () =>
      posts.filter(
        (p) =>
          p.businessProfileId === businessProfile.id ||
          (p.authorType === 'business' && p.authorId === businessProfile.id)
      ),
    [businessProfile.id, posts]
  );

  return (
    <section aria-label="Business Brand Posts" className="space-y-5">
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Brand Posts ({brandPosts.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Posts published strictly under {businessProfile.displayName} (@{businessProfile.slug}). Personal posts never appear here.
          </p>
        </div>

        {canPublish && (
          <button
            type="button"
            onClick={onCreateBrandPost}
            className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Create Brand Post</span>
          </button>
        )}
      </div>

      {brandPosts.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Megaphone className="w-6 h-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            No brand announcements yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Share product launches, service updates, and brand stories with your followers.
          </p>
          {canPublish && (
            <button
              type="button"
              onClick={onCreateBrandPost}
              className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Publish First Post</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {brandPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              canManagePost={canPublish}
              categories={categories}
              isLiked={likedPostIds.includes(post.id)}
              isBookmarked={bookmarkedPostIds.includes(post.id)}
              comments={commentsByPost[post.id] || []}
              shareThreads={shareThreads}
              onToggleLike={onToggleLike}
              onToggleBookmark={onToggleBookmark}
              onAddComment={onAddComment}
              onUpdatePost={canPublish ? onUpdatePost : undefined}
              onDeletePost={canPublish ? onDeletePost : undefined}
              onDeleteComment={onDeleteComment}
              onShareToStory={onShareToStory}
              onShareToChat={onShareToChat}
              onSelectHashtag={onSelectHashtag}
              onMentionClick={onMentionClick}
              onOpenComments={onOpenComments}
            />
          ))}
        </div>
      )}
    </section>
  );
}
