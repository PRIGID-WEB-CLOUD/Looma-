import { Plus } from 'lucide-react';
import type { BusinessProfile } from '../types/business';
import type { StoryGroup, UserProfile } from '../types/social';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

interface StoriesStripProps {
  profile: UserProfile;
  activeBusinessProfile?: BusinessProfile | null;
  storyGroups: StoryGroup[];
  onOpenStory: (group: StoryGroup) => void;
  onOpenAddStory: () => void;
}

export function StoriesStrip({
  profile,
  activeBusinessProfile = null,
  storyGroups,
  onOpenStory,
  onOpenAddStory,
}: StoriesStripProps) {
  const activeOwnerId = activeBusinessProfile
    ? activeBusinessProfile.id
    : profile.uid;
  const myGroup =
    storyGroups.find((g) => g.authorId === activeOwnerId) || null;
  const otherGroups = storyGroups.filter((g) => g.authorId !== activeOwnerId);
  const myAvatar = activeBusinessProfile
    ? activeBusinessProfile.logoUrl
    : profile.avatarUrl;
  const myName = activeBusinessProfile
    ? activeBusinessProfile.displayName
    : profile.displayName;
  const myVerified = activeBusinessProfile
    ? activeBusinessProfile.verified
    : profile.isVerified;

  return (
    <section
      aria-label="Stories"
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3.5"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Stories
          </h2>
          <button
            type="button"
            onClick={onOpenAddStory}
            aria-label={
              activeBusinessProfile
                ? `Add story as ${activeBusinessProfile.displayName}`
                : 'Add story'
            }
            className="w-7 h-7 rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 flex items-center justify-center cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {activeBusinessProfile && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Posting as {activeBusinessProfile.displayName}
          </span>
        )}
      </div>

      <div className="flex items-start gap-4 overflow-x-auto pb-1">
        {myGroup ? (
          <button
            type="button"
            onClick={() => onOpenStory(myGroup)}
            aria-label={`View your story (${myGroup.items.length} frames)`}
            className="flex flex-col items-center gap-1.5 shrink-0 w-16 group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <div
              className={`p-0.5 ${
                activeBusinessProfile ? 'rounded-2xl' : 'rounded-full'
              } ${
                myGroup.hasUnviewed
                  ? 'ring-2 ring-blue-600 dark:ring-blue-400'
                  : 'ring-1 ring-slate-300 dark:ring-slate-700'
              }`}
            >
              <Avatar
                src={myAvatar}
                name={myName}
                size="lg"
                shape={activeBusinessProfile ? 'business' : 'circle'}
              />
            </div>
            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-full inline-flex items-center gap-0.5">
              <span className="truncate">
                {activeBusinessProfile ? 'Brand Story' : 'Your Story'}
              </span>
              {(myGroup.authorVerified || myVerified) && (
                <VerifiedBadge size={11} />
              )}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAddStory}
            aria-label={
              activeBusinessProfile
                ? `Add story for ${activeBusinessProfile.displayName}`
                : 'Add your story'
            }
            className="flex flex-col items-center gap-1.5 shrink-0 w-16 cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <div className="relative">
              <Avatar
                src={myAvatar}
                name={myName}
                size="lg"
                shape={activeBusinessProfile ? 'business' : 'circle'}
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-blue-600 text-white ring-2 ring-white dark:ring-slate-900 flex items-center justify-center">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </div>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate max-w-full">
              Add Story
            </span>
          </button>
        )}

        {otherGroups.map((group) => {
          const isBiz = group.authorType === 'business';
          const shortLabel = isBiz
            ? group.authorName
            : group.authorName.split(' ')[0] || group.authorName;
          return (
            <button
              key={group.authorId}
              type="button"
              onClick={() => onOpenStory(group)}
              aria-label={`View ${group.authorName}'s story`}
              className="flex flex-col items-center gap-1.5 shrink-0 w-16 group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <div
                className={`p-0.5 ${isBiz ? 'rounded-2xl' : 'rounded-full'} ${
                  group.hasUnviewed
                    ? 'ring-2 ring-blue-600 dark:ring-blue-400'
                    : 'ring-1 ring-slate-300 dark:ring-slate-700 opacity-85'
                }`}
              >
                <Avatar
                  src={group.authorAvatar}
                  name={group.authorName}
                  size="lg"
                  shape={isBiz ? 'business' : 'circle'}
                />
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-full inline-flex items-center gap-0.5">
                <span className="truncate">{shortLabel}</span>
                {group.authorVerified && <VerifiedBadge size={11} />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
