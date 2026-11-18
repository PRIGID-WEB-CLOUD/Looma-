import { useState } from 'react';
import { Award, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import { Avatar } from '../../src/components/Avatar';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import type { VerificationRequest } from '../adminLogic';

interface VerificationRequestsSectionProps {
  requests: VerificationRequest[];
  onReviewRequest: (
    requestId: string,
    targetUid: string,
    decision: 'approved' | 'rejected',
    note?: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function VerificationRequestsSection({
  requests,
  onReviewRequest,
}: VerificationRequestsSectionProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null
  );

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const filteredRequests = requests.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const handleAction = async (
    requestId: string,
    targetUid: string,
    decision: 'approved' | 'rejected'
  ) => {
    setFeedback(null);
    setProcessingId(requestId);
    try {
      const res = await onReviewRequest(
        requestId,
        targetUid,
        decision,
        noteById[requestId] || ''
      );
      if (!res.ok) {
        setFeedback({
          kind: 'error',
          text: res.error || 'Unable to process verification request.',
        });
      } else {
        setFeedback({
          kind: 'success',
          text:
            decision === 'approved'
              ? 'Verification badge granted and member notified.'
              : 'Verification request rejected and member notified.',
        });
        setNoteById((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to process verification request.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold">Verification Badge Requests</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review member reasons and reference links before granting official verification badges.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                filter === tab
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tab === 'pending' && pendingCount > 0 ? `${tab} (${pendingCount})` : tab}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-2xl border px-4 py-3 text-xs font-medium ${
            feedback.kind === 'error'
              ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
              : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {filteredRequests.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Award className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="font-display text-sm font-bold">No verification requests found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            There are no verification badge requests matching the selected filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRequests.map((req) => {
            const isProcessing = processingId === req.id;
            return (
              <div
                key={req.id}
                className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={req.avatarUrl} name={req.displayName} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                          {req.displayName}
                        </span>
                        {req.status === 'approved' && <VerifiedBadge size={14} />}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        @{req.handle}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize shrink-0 ${
                      req.status === 'approved'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : req.status === 'rejected'
                          ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>

                <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 p-3.5 space-y-2 border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Reason for Verification
                  </p>
                  <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {req.reason}
                  </p>
                </div>

                {req.links && req.links.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Reference Links
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {req.links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{link}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {req.status !== 'pending' && req.reviewerNote && (
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 px-3.5 py-2.5 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Reviewer note: <span className="text-slate-700 dark:text-slate-200">{req.reviewerNote}</span>
                    </p>
                  </div>
                )}

                {req.status === 'pending' && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <label htmlFor={`verify-note-${req.id}`} className="sr-only">
                        Optional reviewer note for {req.displayName}
                      </label>
                      <input
                        id={`verify-note-${req.id}`}
                        type="text"
                        maxLength={400}
                        value={noteById[req.id] || ''}
                        onChange={(e) =>
                          setNoteById((prev) => ({ ...prev, [req.id]: e.target.value }))
                        }
                        placeholder="Optional reviewer note (shown to user if rejected)..."
                        className="w-full min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleAction(req.id, req.uid, 'approved')}
                        className="flex-1 min-h-[38px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>{isProcessing ? 'Processing...' : 'Grant Badge'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleAction(req.id, req.uid, 'rejected')}
                        className="flex-1 min-h-[38px] px-4 rounded-xl border border-red-300 dark:border-red-800 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" aria-hidden="true" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
