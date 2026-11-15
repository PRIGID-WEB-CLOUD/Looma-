import { useMemo, useState, useEffect, useRef } from 'react';
import { X, Search, Sparkles } from 'lucide-react';
import {
  CURATED_GIFS,
  CURATED_GIF_CATEGORIES,
  filterGifs,
  type CuratedGif,
} from '../utils/socialLogic';

interface GifPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelectGif: (gif: CuratedGif) => void;
  title?: string;
}

export function GifPickerModal({
  open,
  onClose,
  onSelectGif,
  title = 'Choose a GIF',
}: GifPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery('');
      setActiveCategory('All');
    }
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const filteredGifs = useMemo(() => {
    return filterGifs(searchQuery, activeCategory);
  }, [searchQuery, activeCategory]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gif-picker-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[640px] animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/80 bg-neutral-900/90 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-pink-500/10 text-pink-400 flex items-center justify-center font-bold text-xs tracking-wider">
              GIF
            </div>
            <div>
              <h3 id="gif-picker-title" className="text-sm font-semibold text-neutral-100">
                {title}
              </h3>
              <p className="text-xs text-neutral-400">Curated high-res reaction GIFs</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition"
            aria-label="Close GIF picker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-neutral-800/80 bg-neutral-900">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search GIFs (e.g., party, lol, clap, win)..."
              className="w-full pl-9 pr-9 py-2 bg-neutral-800/90 border border-neutral-700/70 rounded-full text-sm text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2.5 pb-1 scrollbar-none">
            {CURATED_GIF_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition ${
                    isActive
                      ? 'bg-neutral-100 text-neutral-900 shadow-sm'
                      : 'bg-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* GIFs Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredGifs.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-neutral-500 opacity-60" />
              <p className="text-sm font-medium text-neutral-300">No GIFs found</p>
              <p className="text-xs text-neutral-500 mt-1">
                Try searching for keywords like "clap", "dance", "love", or "laugh".
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('All');
                }}
                className="mt-3 px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-full transition"
              >
                View all GIFs
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredGifs.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => {
                    onSelectGif(gif);
                    onClose();
                  }}
                  className="group relative aspect-video sm:aspect-square rounded-xl overflow-hidden bg-neutral-800 border border-neutral-800 hover:border-sky-500/50 hover:ring-2 hover:ring-sky-500/30 transition text-left focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <img
                    src={gif.previewUrl || gif.url}
                    alt={gif.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-[11px] font-medium text-white truncate drop-shadow">
                      {gif.title}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
