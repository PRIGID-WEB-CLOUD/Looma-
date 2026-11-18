import { useEffect, useState, type FormEvent } from 'react';
import { Award, ShieldCheck, X } from 'lucide-react';
import type { ThemeMode } from '../types/social';
import { validateVerificationRequestInput } from '../../admin/adminLogic';

interface RequestVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    reason: string,
    links: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  theme: ThemeMode;
}

export function RequestVerificationModal({
  isOpen,
  onClose,
  onSubmit,
}: RequestVerificationModalProps) {
  const [reason, setReason] = useState('');
  const [link1, setLink1] = useState('');
  const [link2, setLink2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setLink1('');
      setLink2('');
      setError(null);
      setSuccess(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const links = [link1.trim(), link2.trim()].filter(Boolean);
    const check = validateVerificationRequestInput(reason, links);
    if (!check.valid) {
      setError(check.error || 'Please review your verification details.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await onSubmit(check.cleanReason || reason.trim(), check.cleanLinks || links);
      if (!res.ok) {
        setError(res.error || 'Failed to submit verification request.');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error submitting request.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs looma-stage-enter"
    >
      <div className="max-w-lg w-full rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Award className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="verify-modal-title" className="font-display text-base font-bold">
                Request Verification Badge
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Submit your reason and 1–2 reference links for admin review.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close verification request modal"
            className="min-h-[38px] min-w-[38px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {success ? (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="font-display text-sm font-bold text-emerald-900 dark:text-emerald-200">
              Request Submitted Successfully
            </h3>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Your verification request has been sent to the admin dashboard. We will review your reason and links shortly.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400"
              >
                {error}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="verify-reason"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Reason for Verification
                </label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {reason.length}/500
                </span>
              </div>
              <textarea
                id="verify-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="Explain why your account should be verified (e.g. notable creator, studio, organization, or public figure)..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 resize-none focus:outline-blue-600"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="verify-link1"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Reference Link 1 (Required)
                </label>
                <input
                  id="verify-link1"
                  type="url"
                  value={link1}
                  onChange={(e) => setLink1(e.target.value)}
                  maxLength={500}
                  placeholder="https://example.com/your-portfolio"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="verify-link2"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Reference Link 2 (Optional)
                </label>
                <input
                  id="verify-link2"
                  type="url"
                  value={link2}
                  onChange={(e) => setLink2(e.target.value)}
                  maxLength={500}
                  placeholder="https://instagram.com/yourhandle"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-blue-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[40px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shadow-xs inline-flex items-center gap-1.5"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
