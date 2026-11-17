import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  MessageSquare,
  Search,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ConnectionsTab, UserProfile } from '../types/social';
import { filterUsersByQuery } from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

interface ConnectionsViewProps {
  initialTab?: ConnectionsTab;
  targetUser?: UserProfile | null;
  currentUserId: string;
  followers: UserProfile[];
  following: UserProfile[];
  friends: UserProfile[];
  followerIds: string[];
  followedUserIds: string[];
  onBack: () => void;
  onToggleFollow: (uid: string) => void;
  onMessage: (user: UserProfile) => void;
  onOpenPublicProfile: (user: UserProfile) => void;
}

export function ConnectionsView({
  initialTab = 'followers',
  targetUser = null,
  currentUserId,
  followers,
  following,
  friends,
  followerIds,
  followedUserIds,
  onBack,
  onToggleFollow,
  onMessage,
  onOpenPublicProfile,
}: ConnectionsViewProps) {
  const [activeTab, setActiveTab] = useState<ConnectionsTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, targetUser?.uid]);

  const isViewingOther = Boolean(targetUser && targetUser.uid !== currentUserId);

  const tabItems: { id: ConnectionsTab; label: string; count: number }[] = [
    { id: 'followers', label: 'Followers', count: followers.length },
    { id: 'following', label: 'Following', count: following.length },
    { id: 'friends', label: 'Friends', count: friends.length },
  ];

  const sourceList =
    activeTab === 'followers'
      ? followers
      : activeTab === 'following'
        ? following
        : friends;

  const filteredUsers = filterUsersByQuery(sourceList, searchQuery);

  const emptyMessage = searchQuery.trim()
    ? `No ${activeTab} match "${searchQuery.trim()}".`
    : activeTab === 'followers'
      ? isViewingOther
        ? `${targetUser?.displayName} has no followers yet.`
        : 'No followers yet.'
      : activeTab === 'following'
        ? isViewingOther
          ? `${targetUser?.displayName} is not following anyone yet.`
          : 'You are not following anyone yet.'
        : 'Mutual friends appear here when two creators follow each other.';

  return (
    <section aria-label="Followers, Following, and Friends" className="space-y-5">
      {/* Header & Summary Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] px-3 -ml-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>
              {isViewingOther ? `Back to ${targetUser?.displayName}` : 'Back to Profile'}
            </span>
          </button>

          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-2">
            {isViewingOther
              ? `${targetUser?.displayName}'s Connections`
              : 'People & Connections'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {followers.length} Followers · {following.length} Following · {friends.length} Friends
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="connections-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, @handle, city, or topic..."
            aria-label="Search followers, following, and friends"
            className="w-full min-h-[44px] pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Segmented Tabs: Followers | Following | Friends */}
        <div
          role="tablist"
          aria-label="Connection categories"
          className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800"
        >
          {tabItems.map((item) => {
            const selected = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[40px] px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                  selected
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label} ({item.count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Results List */}
      {filteredUsers.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <Users
            className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto"
            aria-hidden="true"
          />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {emptyMessage}
          </p>
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3" aria-label={`${activeTab} list`}>
          {filteredUsers.map((person) => {
            const isSelf = person.uid === currentUserId;
            const isFollowing = followedUserIds.includes(person.uid);
            const isFollower = followerIds.includes(person.uid);
            const isMutualFriend = isFollowing && isFollower;

            return (
              <li
                key={person.uid}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <button
                  type="button"
                  onClick={() => onOpenPublicProfile(person)}
                  className="flex items-start gap-3.5 min-w-0 text-left cursor-pointer group flex-1"
                >
                  <Avatar
                    src={person.avatarUrl}
                    name={person.displayName}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors inline-flex items-center gap-1.5">
                        <span className="truncate">{person.displayName}</span>
                        {person.isVerified && <VerifiedBadge size={14} />}
                        {isSelf ? ' (You)' : ''}
                      </span>
                      {!isSelf && isMutualFriend && (
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          · Mutual friend
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      @{person.handle}
                      {person.location ? ` · ${person.location}` : ''}
                    </p>
                    {person.bio && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">
                        {person.bio}
                      </p>
                    )}
                    {person.interests.length > 0 && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 truncate">
                        {person.interests.slice(0, 3).join(' · ')}
                      </p>
                    )}
                  </div>
                </button>

                {!isSelf && (
                  <div className="flex items-center gap-2 shrink-0 sm:self-center">
                    <button
                      type="button"
                      onClick={() => onMessage(person)}
                      aria-label={`Message ${person.displayName}`}
                      className="flex-1 sm:flex-initial min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Message</span>
                    </button>

                    <button
                      type="button"
                      aria-pressed={isFollowing}
                      onClick={() => onToggleFollow(person.uid)}
                      className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        isFollowing
                          ? 'border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700'
                          : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isFollower ? 'Follow Back' : 'Follow'}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
