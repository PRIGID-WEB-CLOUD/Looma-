import { useState } from 'react';
import { CheckCircle2, Flag, Scale, Search, XCircle } from 'lucide-react';
import { formatRelativeTime } from '../../src/utils/socialLogic';
import {
  filterAppeals,
  filterReports,
  type AppealStatus,
  type ContentReport,
  type ModerationAppeal,
  type ReportSeverity,
  type ReportStatus,
} from '../adminLogic';

interface ReportsAppealsSectionProps {
  reports: ContentReport[];
  appeals: ModerationAppeal[];
  onResolveReport: (
    reportId: string,
    status: ReportStatus,
    resolutionAction: string,
    extraAction?: 'hide-post' | 'restrict-author'
  ) => Promise<void>;
  onReviewAppeal: (
    appealId: string,
    decision: 'approved' | 'rejected',
    reviewerNote: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function ReportsAppealsSection({
  reports,
  appeals,
  onResolveReport,
  onReviewAppeal,
}: ReportsAppealsSectionProps) {
  const [tab, setTab] = useState<'reports' | 'appeals'>('reports');
  const [reportQuery, setReportQuery] = useState('');
  const [reportStatus, setReportStatus] = useState<'all' | ReportStatus>('all');
  const [reportSeverity, setReportSeverity] = useState<'all' | ReportSeverity>('all');
  const [appealQuery, setAppealQuery] = useState('');
  const [appealStatus, setAppealStatus] = useState<'all' | AppealStatus>('all');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const visibleReports = filterReports(reports, reportQuery, reportStatus, reportSeverity);
  const visibleAppeals = filterAppeals(appeals, appealQuery, appealStatus);

  const openCount = reports.filter((r) => r.status === 'open' || r.status === 'reviewing').length;
  const pendingAppealsCount = appeals.filter((a) => a.status === 'pending').length;

  const handleAppealDecision = async (
    appealId: string,
    decision: 'approved' | 'rejected'
  ) => {
    setFeedback(null);
    const note =
      reviewNotes[appealId] ||
      (decision === 'approved'
        ? 'Verified remediation; restoring account access.'
        : 'Policy violation confirmed upon second review.');
    const res = await onReviewAppeal(appealId, decision, note);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Could not update appeal.' });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Appeal ${appealId} marked as ${decision.toUpperCase()}.`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Reports &amp; Appeals Queue
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Triage member-submitted content reports, apply proportional enforcement, and adjudicate appeals.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start">
          <button
            type="button"
            onClick={() => setTab('reports')}
            className={`min-h-[34px] px-3 rounded-md text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 tabular-nums ${
              tab === 'reports'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Flag className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reports ({openCount} active)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('appeals')}
            className={`min-h-[34px] px-3 rounded-md text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 tabular-nums ${
              tab === 'appeals'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Scale className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Appeals ({pendingAppealsCount} pending)</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
            feedback.type === 'err'
              ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
              : 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {tab === 'reports' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search reports"
                value={reportQuery}
                onChange={(e) => setReportQuery(e.target.value)}
                placeholder="Search target, reason, or reporter"
                className="w-full min-h-[40px] pl-9 pr-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              aria-label="Filter reports by status"
              value={reportStatus}
              onChange={(e) => setReportStatus(e.target.value as 'all' | ReportStatus)}
              className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="reviewing">Reviewing</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>

            <select
              aria-label="Filter reports by severity"
              value={reportSeverity}
              onChange={(e) => setReportSeverity(e.target.value as 'all' | ReportSeverity)}
              className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {visibleReports.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No reports match the selected status or severity filter.
              </div>
            ) : (
              visibleReports.map((rep) => (
                <article
                  key={rep.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`font-mono uppercase font-bold ${
                          rep.severity === 'critical' || rep.severity === 'high'
                            ? 'text-red-600 dark:text-red-400'
                            : rep.severity === 'medium'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        [{rep.severity}]
                      </span>
                      <span className="font-mono uppercase text-slate-500 dark:text-slate-400">
                        {rep.targetType} · {rep.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-mono font-semibold uppercase ${
                          rep.status === 'open'
                            ? 'text-red-600 dark:text-red-400'
                            : rep.status === 'reviewing'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {rep.status}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {formatRelativeTime(rep.createdAtMs)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {rep.reason}
                    </p>

                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      Target ({rep.targetId}): &ldquo;{rep.targetSummary}&rdquo; · Reported by{' '}
                      {rep.reporterName}
                    </p>

                    {rep.resolutionAction && (
                      <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                        Resolution: {rep.resolutionAction}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {rep.status === 'open' && (
                      <button
                        type="button"
                        onClick={() =>
                          void onResolveReport(rep.id, 'reviewing', 'Assigned for moderator review')
                        }
                        className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Claim Review
                      </button>
                    )}

                    {(rep.status === 'open' || rep.status === 'reviewing') && (
                      <>
                        {rep.targetType === 'post' && (
                          <button
                            type="button"
                            onClick={() =>
                              void onResolveReport(
                                rep.id,
                                'resolved',
                                'Hidden reported post & logged enforcement',
                                'hide-post'
                              )
                            }
                            className="min-h-[36px] px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            Hide Content &amp; Resolve
                          </button>
                        )}
                        {rep.targetAuthorUid && (
                          <button
                            type="button"
                            onClick={() =>
                              void onResolveReport(
                                rep.id,
                                'resolved',
                                'Restricted target author & closed report',
                                'restrict-author'
                              )
                            }
                            className="min-h-[36px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                          >
                            Restrict Author
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void onResolveReport(
                              rep.id,
                              'dismissed',
                              'Reviewed and found within community guidelines'
                            )
                          }
                          className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search appeals"
                value={appealQuery}
                onChange={(e) => setAppealQuery(e.target.value)}
                placeholder="Search appellant or appeal note"
                className="w-full min-h-[40px] pl-9 pr-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              aria-label="Filter appeals by status"
              value={appealStatus}
              onChange={(e) => setAppealStatus(e.target.value as 'all' | AppealStatus)}
              className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm"
            >
              <option value="all">All Appeals</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {visibleAppeals.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No moderation appeals match the active filter.
              </div>
            ) : (
              visibleAppeals.map((appeal) => (
                <article key={appeal.id} className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {appeal.appellantName}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        @{appeal.appellantHandle}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-mono uppercase font-semibold ${
                          appeal.status === 'pending'
                            ? 'text-amber-700 dark:text-amber-400'
                            : appeal.status === 'approved'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {appeal.status}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatRelativeTime(appeal.createdAtMs)}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      Ref Report: {appeal.reportId || 'N/A'}
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300">{appeal.reason}</p>

                  {appeal.status === 'pending' ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                      <input
                        type="text"
                        aria-label={`Reviewer note for appeal ${appeal.id}`}
                        value={reviewNotes[appeal.id] || ''}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({
                            ...prev,
                            [appeal.id]: e.target.value,
                          }))
                        }
                        placeholder="Decision note (required, recorded in audit log)"
                        className="flex-1 min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAppealDecision(appeal.id, 'approved')}
                        className="min-h-[38px] px-3.5 rounded-lg border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Approve &amp; Restore</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAppealDecision(appeal.id, 'rejected')}
                        className="min-h-[38px] px-3.5 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Uphold Decision</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Reviewer decision note: {appeal.reviewerNote}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
