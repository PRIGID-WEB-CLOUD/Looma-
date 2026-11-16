import { AlertTriangle, BarChart3, Lock, Megaphone, ShieldCheck, TrendingUp } from 'lucide-react';
import type { Post } from '../../src/types/social';
import {
  type CategoryMetric,
  type ExtendedWorkspaceMetrics,
  type PlatformAnnouncement,
} from '../adminLogic';
import type { AdminSectionId } from '../AdminView';

interface OverviewAnalyticsSectionProps {
  metrics: ExtendedWorkspaceMetrics;
  categoryBreakdown: CategoryMetric[];
  posts: Post[];
  hiddenSet: Set<string>;
  announcements: PlatformAnnouncement[];
  accountLabel: string;
  onNavigateSection: (section: AdminSectionId) => void;
}

export function OverviewAnalyticsSection({
  metrics,
  categoryBreakdown,
  posts,
  hiddenSet,
  announcements,
  accountLabel,
  onNavigateSection,
}: OverviewAnalyticsSectionProps) {
  const activeBanners = announcements.filter((a) => a.active);
  const maxCategoryCount = Math.max(1, ...categoryBreakdown.map((c) => c.count));
  const activationRate =
    metrics.totalMembers > 0
      ? Math.round((metrics.onboardedMembers / metrics.totalMembers) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Workspace Overview &amp; Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Live platform posture across member directories, content moderation queues, governance, and engagement.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          {accountLabel}
        </span>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Community Members
          </p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
            {metrics.totalMembers}
          </p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {metrics.onlineMembers} online · {activationRate}% onboarded
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Feed &amp; Stories
          </p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
            {metrics.totalPosts}
          </p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {metrics.hiddenPosts} hidden · {metrics.activeStoryAuthors} story authors
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Moderation Queue
          </p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
            {metrics.openReports}
          </p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {metrics.criticalReports} urgent · {metrics.pendingAppeals} appeals
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Account Enforcement
          </p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
            {metrics.restrictedMembers + metrics.suspendedMembers}
          </p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {metrics.restrictedMembers} restricted · {metrics.suspendedMembers} suspended
          </p>
        </div>
      </div>

      {/* Category Analytics + Active Broadcasts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Content &amp; Engagement by Category
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {metrics.totalEngagement} total interactions
            </span>
          </div>

          <div className="space-y-3">
            {categoryBreakdown.map((item) => {
              const barPct = Math.max(4, Math.round((item.count / maxCategoryCount) * 100));
              return (
                <div key={item.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.category}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {item.count} {item.count === 1 ? 'post' : 'posts'} ({item.sharePct}%) · {item.totalLikes} likes ·{' '}
                      {item.totalComments} replies
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-sm bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-500 transition-all"
                      style={{ width: `${item.count === 0 ? 0 : barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Active Announcements
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('governance')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>

            {activeBanners.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                No active platform announcements are currently displayed to members.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeBanners.slice(0, 3).map((banner) => (
                  <li key={banner.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {banner.title}
                      </span>
                      <span
                        className={`text-[11px] font-mono uppercase shrink-0 ${
                          banner.severity === 'maintenance'
                            ? 'text-red-600 dark:text-red-400'
                            : banner.severity === 'warning'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {banner.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {banner.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Operators
            </span>
            <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
              {metrics.adminOperators} active
            </span>
          </div>
        </section>
      </div>

      {/* Priority Queue Summary + Security Posture */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-between">
          <div className="p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Pending Administrative Actions
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('reports')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
            >
              Open Triage Queue
            </button>
          </div>
          <div className="grid grid-cols-3 border-t border-slate-100 dark:border-slate-800 divide-x divide-slate-100 dark:divide-slate-800 text-xs">
            <button
              type="button"
              onClick={() => onNavigateSection('reports')}
              className="text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
            >
              <span className="text-slate-500 dark:text-slate-400 block">Open Reports</span>
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {metrics.openReports}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateSection('reports')}
              className="text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
            >
              <span className="text-slate-500 dark:text-slate-400 block">User Appeals</span>
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {metrics.pendingAppeals}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateSection('governance')}
              className="text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
            >
              <span className="text-slate-500 dark:text-slate-400 block">Access Queue</span>
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {metrics.pendingInquiries}
              </span>
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Workspace Access &amp; Rules Enforcement
              </h2>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400">
              ACTIVE
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Member feeds, chat threads, Cloudflare R2 media uploads, and Admin RBAC collections enforce verified Firebase Auth, bounded schemas, and immutable audit trails in Firestore rules.
          </p>
        </section>
      </div>

      {/* Recent Feed Submissions */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Recent Feed Submissions
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigateSection('moderation')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Moderate all
          </button>
        </div>

        {posts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No member posts have been published yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6 font-semibold">Author</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Excerpt</th>
                  <th className="py-3 px-4 font-semibold text-right">Engagement</th>
                  <th className="py-3 px-6 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {posts.slice(0, 6).map((post) => {
                  const isHidden = hiddenSet.has(post.id);
                  return (
                    <tr
                      key={post.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="py-3 px-6 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {post.authorName}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {post.category}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                        {post.caption || post.mediaTitle || 'Media attachment'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {post.likesCount} likes · {post.commentsCount} comments
                      </td>
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <span
                          className={`text-xs font-mono font-semibold ${
                            isHidden
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {isHidden ? 'HIDDEN' : 'LIVE'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
