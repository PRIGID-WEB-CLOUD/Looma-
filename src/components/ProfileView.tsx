import { useMemo, useState, type ReactNode } from 'react';
import { MapPin, Settings, Users } from 'lucide-react';
import type {
  ChatThread,
  ConnectionsTab,
  Post,
  PostCategory,
  PostComment,
  UserProfile,
} from '../types/social';
import { filterMediaPosts } from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { MediaGalleryGrid } from './MediaGalleryGrid';
import { MediaViewerModal } from './MediaViewerModal';
import { PostCard } from './PostCard';
import { RichText } from './RichText';
import { VerifiedBadge } from './VerifiedBadge';

interface ProfileViewProps {
  profile: UserProfile;
  profileSwitcherSlot?: ReactNode;
  posts: Post[];
  canManageBusinessIds?: string[];
  followersCount?: number;
  followingCount?: number;
  friendsCount: number;
  likedPostIds: string[];
  bookmarkedPostIds: string[];
  commentsByPost: Record<string, PostComment[]>;
  shareThreads?: ChatThread[];
  categories?: string[];
  onToggleLike: (post: Post) => void;
  onToggleBookmark: (postId: string) => void;
  onAddComment: (post: Post, text: string) => Promise<void>;
  onOpenComments?: (post: Post) => void;
  onUpdatePost?: (
    post: Post,
    updates: { caption: string; category: PostCategory }
  ) => Promise<void>;
  onDeletePost?: (post: Post) => Promise<void>;
  onDeleteComment?: (post: Post, commentId: string) => Promise<void>;
  onShareToStory?: (post: Post) => Promise<unknown> | void;
  onShareToChat?: (thread: ChatThread, post: Post) => Promise<void>;
  onReportPost?: (
    post: Post,
    category: 'spam' | 'harassment' | 'misinformation' | 'nudity' | 'copyright' | 'other',
    reason: string
  ) => Promise<void>;
  storiesEnabled?: boolean;
  onOpenSettings: () => void;
  onOpenConnections: (tab: ConnectionsTab) => void;
  onAuthorClick: (post: Post) => void;
  onSelectHashtag?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
}

export function ProfileView({
  profile,
  profileSwitcherSlot,
  posts,
  canManageBusinessIds = [],
  followersCount,
  followingCount,
  friendsCount,
  likedPostIds,
  bookmarkedPostIds,
  commentsByPost,
  shareThreads = [],
  categories,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onOpenComments,
  onUpdatePost,
  onDeletePost,
  onDeleteComment,
  onShareToStory,
  onShareToChat,
  onReportPost,
  storiesEnabled = true,
  onOpenSettings,
  onOpenConnections,
  onAuthorClick,
  onSelectHashtag,
  onMentionClick,
}: ProfileViewProps) {
  const [subTab, setSubTab] = useState<'posts' | 'media' | 'saved'>('posts');
  const [activeMediaPostId, setActiveMediaPostId] = useState<string | null>(null);

  // Strictly Personal Profile posts only (Business posts live inside Business Platform / Public Business Profile)
  const myPosts = useMemo(
    () =>
      posts.filter(
        (p) => p.authorId === profile.uid && p.authorType !== 'business'
      ),
    [posts, profile.uid]
  );
  const myMediaEntries = useMemo(() => filterMediaPosts(myPosts), [myPosts]);
  const savedPosts = useMemo(
    () => posts.filter((p) => bookmarkedPostIds.includes(p.id)),
    [bookmarkedPostIds, posts]
  );
  const savedMediaEntries = useMemo(() => filterMediaPosts(savedPosts), [savedPosts]);
  const activeGalleryEntries =
    subTab === 'saved' ? savedMediaEntries : myMediaEntries;
  const displayedPosts = subTab === 'posts' ? myPosts : savedPosts;

  const displayedFollowers =
    typeof followersCount === 'number' ? followersCount : profile.followersCount;
  const displayedFollowing =
    typeof followingCount === 'number' ? followingCount : profile.followingCount;

  return (
    <section aria-label="Personal Profile" className="space-y-5">
      <div
        data-testid="profile-card"
        className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <Avatar
              src={profile.avatarUrl}
              name={profile.displayName}
              size="xl"
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span className="truncate">{profile.displayName}</span>
                {profile.isVerified && <VerifiedBadge size={16} />}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                @{profile.handle}
                {profile.location && (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span>{' '}
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                      {profile.location}
                    </span>
                  </>
                )}
              </p>

              {profile.bio && (
                <div className="text-sm text-slate-700 dark:text-slate-300 mt-2.5 max-w-xl leading-relaxed">
                  <RichText
                    text={profile.bio}
                    onHashtagClick={onSelectHashtag}
                    onMentionClick={onMentionClick}
                  />
                </div>
              )}

              {profile.interests.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">
                  {profile.interests.join(' · ')}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenConnections('followers')}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Users className="w-4 h-4" aria-hidden="true" />
              <span>Connections</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              <span>Profile Settings</span>
            </button>
            {profileSwitcherSlot}
          </div>
        </div>

        {/* Personal Profile Stats */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm tabular-nums">
          <div>
            <span className="font-bold text-slate-900 dark:text-white">
              {myPosts.length}
            </span>{' '}
            <span className="text-slate-500 dark:text-slate-400">
              {myPosts.length === 1 ? 'Post' : 'Posts'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenConnections('followers')}
            className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            <span className="font-bold text-slate-900 dark:text-white">
              {displayedFollowers}
            </span>{' '}
            <span className="text-slate-500 dark:text-slate-400">
              Followers
            </span>
          </button>
          <button
            type="button"
            onClick={() => onOpenConnections('following')}
            className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            <span className="font-bold text-slate-900 dark:text-white">
              {displayedFollowing}
            </span>{' '}
            <span className="text-slate-500 dark:text-slate-400">
              Following
            </span>
          </button>
          <button
            type="button"
            onClick={() => onOpenConnections('friends')}
            className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            <span className="font-bold text-slate-900 dark:text-white">
              {friendsCount}
            </span>{' '}
            <span className="text-slate-500 dark:text-slate-400">
              Friends
            </span>
          </button>
        </div>
      </div>

      {/* Posts / Media / Saved Segmented Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setSubTab('posts')}
          className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
            subTab === 'posts'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Posts ({myPosts.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('media')}
          className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
            subTab === 'media'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Media ({myMediaEntries.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('saved')}
          className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
            subTab === 'saved'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Saved ({savedPosts.length})
        </button>
      </div>

      {subTab === 'media' ? (
        <MediaGalleryGrid
          entries={myMediaEntries}
          emptyMessage="No posted photos, videos, or audio tracks yet."
          onSelectEntry={(postId) => setActiveMediaPostId(postId)}
        />
      ) : displayedPosts.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {subTab === 'posts'
            ? 'You have not published any personal posts yet. Share a note or photo from your Feed.'
            : 'No saved posts yet. Bookmark posts in your feed to find them here.'}
        </div>
      ) : (
        <div className="space-y-4">
          {displayedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={profile.uid}
              canManageBusinessIds={canManageBusinessIds}
              canManagePost={post.authorId === profile.uid}
              categories={categories}
              isLiked={likedPostIds.includes(post.id)}
              isBookmarked={bookmarkedPostIds.includes(post.id)}
              comments={commentsByPost[post.id] || []}
              shareThreads={shareThreads}
              onToggleLike={onToggleLike}
              onToggleBookmark={onToggleBookmark}
              onAddComment={onAddComment}
              onOpenComments={onOpenComments}
              onUpdatePost={onUpdatePost}
              onDeletePost={onDeletePost}
              onDeleteComment={onDeleteComment}
              onShareToStory={storiesEnabled ? onShareToStory : undefined}
              onShareToChat={onShareToChat}
              onReportPost={onReportPost}
              onAuthorClick={onAuthorClick}
              onSelectHashtag={onSelectHashtag}
              onMentionClick={onMentionClick}
              onOpenMedia={(clickedPost) => setActiveMediaPostId(clickedPost.id)}
            />
          ))}
        </div>
      )}

      <MediaViewerModal
        open={Boolean(activeMediaPostId)}
        entries={activeGalleryEntries}
        activePostId={activeMediaPostId}
        currentUserId={profile.uid}
        canManageBusinessIds={canManageBusinessIds}
        likedPostIds={likedPostIds}
        bookmarkedPostIds={bookmarkedPostIds}
        onClose={() => setActiveMediaPostId(null)}
        onSelectPostId={(postId) => setActiveMediaPostId(postId)}
        onToggleLike={onToggleLike}
        onToggleBookmark={onToggleBookmark}
        onShareToStory={onShareToStory}
        onAuthorClick={onAuthorClick}
        onSelectHashtag={onSelectHashtag}
        onMentionClick={onMentionClick}
      />
    </section>
  );
}
