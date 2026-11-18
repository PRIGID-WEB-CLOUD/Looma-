import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  FolderKanban,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { Post, PostCategoryRecord } from '../../src/types/social';
import { POST_CATEGORIES } from '../../src/utils/socialLogic';
import { validateCategoryInput } from '../adminLogic';

interface CategoriesSectionProps {
  categories: PostCategoryRecord[];
  posts: Post[];
  onCreateCategory: (
    name: string,
    description: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteCategory: (categoryId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function CategoriesSection({
  categories,
  posts,
  onCreateCategory,
  onDeleteCategory,
}: CategoriesSectionProps) {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Combine system default categories with custom Firestore categories
  const allCategoryCards = useMemo(() => {
    const postCounts = new Map<string, number>();
    for (const p of posts) {
      const cat = p.category || 'Journal';
      postCounts.set(cat, (postCounts.get(cat) || 0) + 1);
    }

    const systemItems = POST_CATEGORIES.map((catName) => ({
      id: `sys_${catName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: catName,
      description: `Default Looma community editorial channel for ${catName.toLowerCase()} discussions and inspiration.`,
      isSystem: true,
      postCount: postCounts.get(catName) || 0,
    }));

    const customItems = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description || 'Custom administrator configured category.',
      isSystem: false,
      postCount: postCounts.get(cat.name) || 0,
      createdAtMs: cat.createdAtMs,
      createdBy: cat.createdBy,
    }));

    // Avoid duplicates if a custom category matches a system category
    const systemNames = new Set(systemItems.map((s) => s.name.toLowerCase()));
    const filteredCustom = customItems.filter((c) => !systemNames.has(c.name.toLowerCase()));

    return [...systemItems, ...filteredCustom];
  }, [categories, posts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCategoryCards;
    return allCategoryCards.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [allCategoryCards, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const check = validateCategoryInput(name, description, allCategoryCards);
    if (!check.valid) {
      setFeedback({ type: 'err', text: check.error || 'Invalid category inputs.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await onCreateCategory(check.name, check.description);
      if (res.ok) {
        setName('');
        setDescription('');
        setIsModalOpen(false);
        setFeedback({ type: 'ok', text: `Created category "${check.name}" successfully.` });
      } else {
        setFeedback({ type: 'err', text: res.error || 'Failed to create category.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (cat: { id: string; name: string }) => {
    if (!window.confirm(`Are you sure you want to delete category "${cat.name}"?`)) {
      return;
    }
    setDeletingId(cat.id);
    setFeedback(null);
    try {
      const res = await onDeleteCategory(cat.id);
      if (res.ok) {
        setFeedback({ type: 'ok', text: `Deleted category "${cat.name}".` });
      } else {
        setFeedback({ type: 'err', text: res.error || 'Failed to delete category.' });
      }
    } finally {
      setDeletingId(null);
    }
  };

  const totalPosts = posts.length;
  const customCount = categories.length;

  return (
    <div className="space-y-6" data-testid="admin-categories-section">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Categories Management</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Create, classify, and organize post taxonomy for feeds, story filters, and community channels.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFeedback(null);
            setIsModalOpen(true);
          }}
          className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Category</span>
        </button>
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

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Total Topics</p>
          <p className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-1 tabular-nums">
            {allCategoryCards.length}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            Active in post composer
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">System Defaults</p>
          <p className="text-2xl font-bold font-display text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
            {POST_CATEGORIES.length}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            Protected core pillars
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Custom Admin</p>
          <p className="text-2xl font-bold font-display text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            {customCount}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            Live from Firestore
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Tagged Posts</p>
          <p className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-1 tabular-nums">
            {totalPosts}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            Distributed across feed
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
          placeholder="Filter categories by name or description..."
          className="w-full min-h-[42px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((cat) => {
          const pct = totalPosts > 0 ? Math.round((cat.postCount / totalPosts) * 100) : 0;
          return (
            <div
              key={cat.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4 transition-shadow hover:shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold text-xs">
                    {cat.name}
                  </span>
                  {cat.isSystem ? (
                    <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800 text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400">
                      System Core
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                      Custom Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                  {cat.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  <span className="font-semibold text-slate-900 dark:text-white">{cat.postCount}</span>{' '}
                  posts ({pct}%)
                </div>

                {!cat.isSystem && (
                  <button
                    type="button"
                    onClick={() => handleDelete(cat)}
                    disabled={deletingId === cat.id}
                    aria-label={`Delete category ${cat.name}`}
                    className="min-h-[32px] px-2.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingId === cat.id ? 'Deleting...' : 'Delete'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
          <Layers className="w-8 h-8 mx-auto text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No categories found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No category matches "{search}". Create a new category to expand your taxonomy.
          </p>
        </div>
      )}

      {/* Create Category Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create New Category"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden looma-stage-enter">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Create Post Category
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
                  htmlFor="category-name-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Category Name *
                </label>
                <input
                  id="category-name-input"
                  type="text"
                  required
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Technology, Fashion, Health"
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  1-40 characters. Will appear in post composer dropdown and feed filter chips.
                </span>
              </div>

              <div>
                <label
                  htmlFor="category-desc-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Description
                </label>
                <textarea
                  id="category-desc-input"
                  rows={3}
                  maxLength={160}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of what creators should share in this category..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Up to 160 characters.
                </span>
              </div>

              {/* Preview */}
              {name.trim() && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
                    Preview
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold text-xs">
                      {name.trim()}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {description.trim() || 'No description entered'}
                    </span>
                  </div>
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
                  disabled={submitting || !name.trim()}
                  className="min-h-[40px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? 'Creating...' : 'Create Category'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
