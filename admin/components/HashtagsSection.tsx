import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Hash,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type { Post } from '../../src/types/social';
import { normalizeHashtag, POPULAR_HASHTAGS } from '../../src/utils/socialLogic';

interface HashtagsSectionProps {
  savedHashtags: string[];
  dynamicHashtags: string[];
  posts: Post[];
  onCreateHashtag?: (
    rawTag: string
  ) => Promise<{ ok: boolean; tag?: string; error?: string }>;
  onDeleteHashtag?: (tag: string) => Promise<{ ok: boolean; error?: string }>;
}

export function HashtagsSection({
  savedHashtags,
  dynamicHashtags,
  posts,
  onCreateHashtag,
  onDeleteHashtag,
}: HashtagsSectionProps) {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  // Compute live post usage for each hashtag
  const hashtagStats = useMemo(() => {
    const postTagCounts = new Map<string, number>();
    for (const p of posts) {
      const text = `${p.caption || ''} ${p.mediaTitle || ''}`.toLowerCase();
      // Match all #words
      const tagsInPost = text.match(/#([a-z0-9_]+)/g) || [];
      const seenForPost = new Set<string>();
      for (const raw of tagsInPost) {
        const clean = raw.slice(1).toLowerCase();
        if (!seenForPost.has(clean)) {
          seenForPost.add(clean);
          postTagCounts.set(clean, (postTagCounts.get(clean) || 0) + 1);
        }
      }
    }

    const dynamicSet = new Set(dynamicHashtags.map((t) => t.toLowerCase()));
    const allTags = Array.from(new Set([...POPULAR_HASHTAGS, ...savedHashtags, ...dynamicHashtags]));

    return allTags.map((tag) => {
      const clean = tag.toLowerCase().replace(/^#+/, '');
      const isDynamic = dynamicSet.has(clean);
      const isDefault = POPULAR_HASHTAGS.includes(clean);
      const count = postTagCounts.get(clean) || 0;
      return {
        tag: clean,
        isDynamic,
        isDefault,
        count,
      };
    }).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [dynamicHashtags, posts, savedHashtags]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#+/, '');
    if (!q) return hashtagStats;
    return hashtagStats.filter((item) => item.tag.includes(q));
  }, [hashtagStats, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateHashtag) return;
    setFeedback(null);
    const clean = normalizeHashtag(newTagInput);
    if (!clean) {
      setFeedback({
        type: 'err',
        text: 'Enter 1-40 lowercase letters, numbers, or underscores.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await onCreateHashtag(clean);
      if (res.ok) {
        setNewTagInput('');
        setIsModalOpen(false);
        setFeedback({ type: 'ok', text: `Saved #${clean} to community hashtags.` });
      } else {
        setFeedback({ type: 'err', text: res.error || 'Failed to create hashtag.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tag: string) => {
    if (!onDeleteHashtag) return;
    if (!window.confirm(`Delete hashtag #${tag} from community dynamic hashtags?`)) {
      return;
    }
    setDeletingTag(tag);
    setFeedback(null);
    try {
      const res = await onDeleteHashtag(tag);
      if (res.ok) {
        setFeedback({ type: 'ok', text: `Removed #${tag} from dynamic hashtags.` });
      } else {
        setFeedback({ type: 'err', text: res.error || 'Failed to delete hashtag.' });
      }
    } finally {
      setDeletingTag(null);
    }
  };

  const handleCopy = (tag: string) => {
    navigator.clipboard.writeText(`#${tag}`);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const totalTags = hashtagStats.length;
  const dynamicCount = dynamicHashtags.length;
  const totalMentions = hashtagStats.reduce((sum, h) => sum + h.count, 0);

  return (
    <div className="space-y-6" data-testid="admin-hashtags-section">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Hash className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Hashtags Management</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Curate trending topics, search tags, and manage dynamic hashtags synchronized to member discovery and composer suggestions.
          </p>
        </div>

        {onCreateHashtag && (
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setIsModalOpen(true);
            }}
            className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create Hashtag</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          role={feedback.type === 'err' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-xs flex items-center gap-2.5 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
          }`}
        >
          {feedback.type === 'ok' ? (
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Total Hashtags</p>
          <p className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-1 tabular-nums">
            {totalTags}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            Registry index
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Popular Core</p>
          <p className="text-2xl font-bold font-display text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
            {POPULAR_HASHTAGS.length}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            Default platform seeds
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Dynamic Community</p>
          <p className="text-2xl font-bold font-display text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            {dynamicCount}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            Firestore synchronized
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Total Tag Mentions</p>
          <p className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-1 tabular-nums">
            {totalMentions}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            Occurrences in posts
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter hashtags by tag name (e.g. design, travel, looma)..."
          className="w-full min-h-[42px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      {/* Hashtags Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {filtered.map((item) => (
          <div
            key={item.tag}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between gap-3 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400 truncate block">
                  #{item.tag}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 inline-flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-slate-400" />
                  <span>{item.count} {item.count === 1 ? 'post' : 'posts'}</span>
                </span>
              </div>

              {item.isDynamic ? (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                  Dynamic
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800 text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400 shrink-0">
                  Default
                </span>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleCopy(item.tag)}
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedTag === item.tag ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              {item.isDynamic && onDeleteHashtag && (
                <button
                  type="button"
                  onClick={() => handleDelete(item.tag)}
                  disabled={deletingTag === item.tag}
                  aria-label={`Delete hashtag #${item.tag}`}
                  className="min-h-[28px] px-2 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{deletingTag === item.tag ? 'Deleting...' : 'Delete'}</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
          <Hash className="w-8 h-8 mx-auto text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No hashtags found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No hashtag matches "#{search}". Add a new dynamic tag above to register it.
          </p>
        </div>
      )}

      {/* Create Hashtag Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create New Hashtag"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden looma-stage-enter">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Add Dynamic Hashtag
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="new-hashtag-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Hashtag Name *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400">
                    #
                  </span>
                  <input
                    id="new-hashtag-input"
                    type="text"
                    required
                    maxLength={40}
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="e.g. artificialintelligence, travelgram"
                    className="w-full min-h-[42px] pl-8 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  1-40 characters. Lowercase letters, numbers, and underscores only.
                </span>
              </div>

              {/* Preview */}
              {newTagInput.trim() && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
                    Normalized Tag
                  </span>
                  <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                    #{normalizeHashtag(newTagInput) || 'invalid'}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newTagInput.trim()}
                  className="min-h-[40px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? 'Saving...' : 'Save Hashtag'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
