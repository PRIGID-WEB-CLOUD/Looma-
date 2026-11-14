import { Film, Music, Play, ZoomIn } from 'lucide-react';
import type { MediaGalleryEntry } from './MediaViewerModal';

interface MediaGalleryGridProps {
  entries: MediaGalleryEntry[];
  emptyMessage: string;
  onSelectEntry: (postId: string) => void;
}

export function MediaGalleryGrid({
  entries,
  emptyMessage,
  onSelectEntry,
}: MediaGalleryGridProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      data-testid="media-gallery-grid"
      className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3"
    >
      {entries.map(({ post, media }) => {
        const isVideo =
          media.kind === 'video' ||
          media.kind === 'youtube' ||
          media.kind === 'vimeo';
        const isAudio = media.kind === 'audio';

        return (
          <button
            key={post.id}
            type="button"
            onClick={() => onSelectEntry(post.id)}
            aria-label={`Open ${media.kind} from ${post.authorName}: ${media.title}`}
            className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
          >
            {media.kind === 'image' && (
              <img
                src={media.url}
                alt={media.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 block"
              />
            )}

            {isVideo && media.thumbnailUrl && (
              <img
                src={media.thumbnailUrl}
                alt={media.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 block"
              />
            )}

            {media.kind === 'video' && (
              <video
                src={media.url}
                muted
                playsInline
                preload="metadata"
                className="w-full h-full object-cover bg-black block"
              />
            )}

            {media.kind === 'vimeo' && !media.thumbnailUrl && (
              <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center gap-2 p-3 text-slate-200">
                <Film className="w-7 h-7 text-blue-400" aria-hidden="true" />
                <span className="text-xs font-semibold text-center line-clamp-2">
                  {media.title}
                </span>
              </div>
            )}

            {isAudio && (
              <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 flex flex-col items-center justify-center gap-2.5 p-4 text-white">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                  <Music className="w-5 h-5" aria-hidden="true" />
                </div>
                <span className="text-xs font-semibold text-center line-clamp-2 text-slate-100">
                  {media.title}
                </span>
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity w-10 h-10 rounded-full bg-black/70 text-white flex items-center justify-center">
                {isVideo || isAudio ? (
                  <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
                ) : (
                  <ZoomIn className="w-4 h-4" aria-hidden="true" />
                )}
              </span>
            </div>

            {/* Kind corner indicator */}
            {(isVideo || isAudio) && (
              <span className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/70 text-white text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1">
                {isVideo ? (
                  <>
                    <Play className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
                    <span>Video</span>
                  </>
                ) : (
                  <>
                    <Music className="w-2.5 h-2.5" aria-hidden="true" />
                    <span>Audio</span>
                  </>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
