import { Plus } from 'lucide-react';
import type { StoryGroup, UserProfile } from '../types/social';
import { Avatar } from './Avatar';

interface StoriesStripProps {
  profile: UserProfile;
  storyGroups: StoryGroup[];
  onOpenStory: (group: StoryGroup) => void;
  onOpenAddStory: () => void;
}

export function StoriesStrip({
  profile,
  storyGroups,
  onOpenStory,
  onOpenAddStory,
}: StoriesStripProps) {
  const myGroup = storyGroups.find((g) => g.authorId === profile.uid) || null;
  const otherGroups = storyGroups.filter((g) => g.authorId !== profile.uid);

  return (
    <section
      aria-label="Stories"
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3.5"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="font-display text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Stories
        </h2>
        <button
          type="button"
          onClick={onOpenAddStory}
          aria-label="Add story"
          title="Add story"
          className="w-6 h-6 rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 inline-flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {!myGroup && otherGroups.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
          No active stories yet.
        </p>
      ) : (
        <div className="flex items-start gap-3.5 overflow-x-auto pb-1">
          {/* Current User Active Story Tile (view-only when user has an active story) */}
          {myGroup && (
            <button
              type="button"
              onClick={() => onOpenStory(myGroup)}
              aria-label="View your story"
              className="flex flex-col items-center gap-1.5 shrink-0 w-[68px] cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <div className="p-0.5">
                <div
                  className={`rounded-full p-0.5 ${
                    myGroup.hasUnviewed
                      ? 'ring-2 ring-blue-600 dark:ring-blue-400'
                      : 'ring-2 ring-slate-300 dark:ring-slate-700'
                  }`}
                >
                  <Avatar
                    src={profile.avatarUrl}
                    name={profile.displayName}
                    size="lg"
                  />
                </div>
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-full group-hover:text-blue-600 dark:group-hover:text-blue-400">
                Your Story
              </span>
            </button>
          )}

          {/* Community Stories */}
          {otherGroups.map((group) => {
            const firstName = group.authorName.split(' ')[0] || group.authorName;
            return (
              <button
                key={group.authorId}
                type="button"
                onClick={() => onOpenStory(group)}
                aria-label={`View ${group.authorName}'s story`}
                className="flex flex-col items-center gap-1.5 shrink-0 w-[68px] cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <div className="p-0.5">
                  <div
                    className={`rounded-full p-0.5 transition-colors ${
                      group.hasUnviewed
                        ? 'ring-2 ring-blue-600 dark:ring-blue-400'
                        : 'ring-2 ring-slate-300 dark:ring-slate-700'
                    }`}
                  >
                    <Avatar
                      src={group.authorAvatar}
                      name={group.authorName}
                      size="lg"
                    />
                  </div>
                </div>
                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-full group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {firstName}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
