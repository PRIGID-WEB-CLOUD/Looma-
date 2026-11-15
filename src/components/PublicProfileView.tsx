import { useMemo, useState } from 'react';
import { ArrowLeft, MapPin, MessageSquare, Phone, UserCheck, UserPlus, Users, Video } from 'lucide-react';
import type { ConnectionsTab, Post, PostComment, UserProfile } from '../types/social';
import { filterMediaPosts } from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { MediaGalleryGrid } from './MediaGalleryGrid';
import { MediaViewerModal } from './MediaViewerModal';
import { PostCard } from './PostCard';
import { RichText } from './RichText';

interface PublicProfileViewProps {
  creator: UserProfile;
  currentUserId?: string;
  loading?: boolean;
  isFollowing: boolean;
  followersCount?: number;
  followingCount?: number;
  friendsCount?: number;
  posts: Post[];
  likedPostIds: string[];
  bookmarkedPostIds: string[];
  commentsByPost: Record<string, PostComment[]>;
  backLabel?: string;
  onToggleFollow: (uid: string) => void;
  onMessage: (creator: UserProfile) => void;
  onStartCallWithUser?: (creator: UserProfile, isAudioOnly: boolean) => void;
  onOpenConnections: (tab: ConnectionsTab) => void;
  onBack: () => void;
  onToggleLike: (post: Post) => void;
  onToggleBookmark: (postId: string) => void;
  onAddComment: (post: Post, text: string) => Promise<void>;
  onDeletePost?: (post: Post) => Promise<void>;
  onDeleteComment?: (post: Post, commentId: string) => Promise<void>;
  onSelectHashtag?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
}

export function PublicProfileView({
  creator,
  currentUserId = '',
  loading = false,
  isFollowing,
  followersCount,
  followingCount,
  friendsCount,
  posts,
  likedPostIds,
  bookmarkedPostIds,
  commentsByPost,
  backLabel = 'Back to Feed',
  onToggleFollow,
  onMessage,
  onStartCallWithUser,
  onOpenConnections,
  onBack,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onDeletePost,
  onDeleteComment,
  onSelectHashtag,
  onMentionClick,
}: PublicProfileViewProps) {
  const [subTab, setSubTab] = useState<'posts' | 'media'>('posts');
  const [activeMediaPostId, setActiveMediaPostId] = useState<string | null>(null);
  const creatorPosts = posts.filter((p) => p.authorId === creator.uid);
  const creatorMediaEntries = useMemo(() => filterMediaPosts(creatorPosts), [creatorPosts]);
  const displayedFollowers =
    typeof followersCount === 'number'
      ? followersCount
      : creator.followersCount + (isFollowing ? 1 : 0);
  const displayedFollowing =
    typeof followingCount === 'number' ? followingCount : creator.followingCount;

  return (
    <section aria-label={`${creator.displayName} public profile`} className="space-y-5">
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3 -ml-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>{backLabel}</span>
        </button>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <Avatar
              src={creator.avatarUrl}
              name={creator.displayName}
              size="xl"
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white truncate">
                {creator.displayName}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                @{creator.handle}
                {creator.location && (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span>{' '}
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                      {creator.location}
                    </span>
                  </>
                )}
              </p>

              {loading ? (
                <p className="text-xs text-slate-400 mt-3">Loading profile details...</p>
              ) : (
                <>
                  {creator.bio && (
                    <div className="text-sm text-slate-700 dark:text-slate-300 mt-2.5 max-w-xl leading-relaxed">
                      <RichText
                        text={creator.bio}
                        onHashtagClick={onSelectHashtag}
                        onMentionClick={onMentionClick}
                      />
                    </div>
                  )}
                  {creator.interests.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">
                      {creator.interests.join(' · ')}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenConnections('followers')}
              className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4" aria-hidden="true" />
              <span>Connections</span>
            </button>

            <button
              type="button"
              aria-pressed={isFollowing}
              onClick={() => onToggleFollow(creator.uid)}
              className={`min-h-[42px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                isFollowing
                  ? 'border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white'
              }`}
            >
              {isFollowing ? (
                <>
                  <UserCheck className="w-4 h-4" aria-hidden="true" />
                  <span>Following</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  <span>Follow</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onMessage(creator)}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              <span>Message</span>
            </button>

            {onStartCallWithUser && (
              <>
                <button
                  type="button"
                  onClick={() => onStartCallWithUser(creator, true)}
                  aria-label={`Audio call with ${creator.displayName}`}
                  className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Audio</span>
                </button>
                <button
                  type="button"
                  onClick={() => onStartCallWithUser(creator, false)}
                  aria-label={`Video call with ${creator.displayName}`}
                  className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Video className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Video</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm tabular-nums">
          <div>
            <span className="font-bold text-slate-900 dark:text-white">
              {creatorPosts.length}
            </span>{' '}
            <span className="text-slate-500 dark:text-slate-400">
              {creatorPosts.length === 1 ? 'Post' : 'Posts'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenConnections('followers')}
            aria-label={`View ${creator.displayName}'s followers (${displayedFollowers})`}
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
            aria-label={`View who ${creator.displayName} is following (${displayedFollowing})`}
            className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            <span className="font-bold text-slate-900 dark:text-white">
              {displayedFollowing}
            </span>{' '}
            <span className="text-slate-500 dark:text-slate-400">
              Following
            </span>
          </button>
          {typeof friendsCount === 'number' && (
            <button
              type="button"
              onClick={() => onOpenConnections('friends')}
              aria-label={`View ${creator.displayName}'s mutual friends (${friendsCount})`}
              className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <span className="font-bold text-slate-900 dark:text-white">
                {friendsCount}
              </span>{' '}
              <span className="text-slate-500 dark:text-slate-400">
                Friends
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
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
              Posts ({creatorPosts.length})
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
              Media ({creatorMediaEntries.length})
            </button>
          </div>
        </div>

        {subTab === 'media' ? (
          <MediaGalleryGrid
            entries={creatorMediaEntries}
            emptyMessage={`${creator.displayName} has not shared any photos, videos, or audio yet.`}
            onSelectEntry={(postId) => setActiveMediaPostId(postId)}
          />
        ) : creatorPosts.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No public posts shared yet.
          </div>
        ) : (
          creatorPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              isLiked={likedPostIds.includes(post.id)}
              isBookmarked={bookmarkedPostIds.includes(post.id)}
              comments={commentsByPost[post.id] || []}
              onToggleLike={onToggleLike}
              onToggleBookmark={onToggleBookmark}
              onAddComment={onAddComment}
              onDeletePost={onDeletePost}
              onDeleteComment={onDeleteComment}
              onSelectHashtag={onSelectHashtag}
              onMentionClick={onMentionClick}
              onOpenMedia={(clickedPost) => setActiveMediaPostId(clickedPost.id)}
            />
          ))
        )}
      </div>

      <MediaViewerModal
        open={Boolean(activeMediaPostId)}
        entries={creatorMediaEntries}
        activePostId={activeMediaPostId}
        currentUserId={currentUserId}
        likedPostIds={likedPostIds}
        bookmarkedPostIds={bookmarkedPostIds}
        onClose={() => setActiveMediaPostId(null)}
        onSelectPostId={(postId) => setActiveMediaPostId(postId)}
        onToggleLike={onToggleLike}
        onToggleBookmark={onToggleBookmark}
        onSelectHashtag={onSelectHashtag}
        onMentionClick={onMentionClick}
      />
    </section>
  );
}
