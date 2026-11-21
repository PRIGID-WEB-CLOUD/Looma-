import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Building2,
  FileText,
  Paperclip,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import type { BusinessProfile } from '../types/business';
import type { ThemeMode, VerificationTargetType } from '../types/social';
import { uploadMediaToCloudflareR2 } from '../services/storage';
import { validateVerificationRequestInput } from '../../admin/adminLogic';

interface RequestVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    reason: string,
    links: string[],
    documentUrls?: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  theme: ThemeMode;
  targetType?: VerificationTargetType;
  businessProfile?: BusinessProfile | null;
  initialReason?: string;
  initialLinks?: string[];
  initialDocumentUrls?: string[];
}

export function RequestVerificationModal({
  isOpen,
  onClose,
  onSubmit,
  targetType = 'personal',
  businessProfile = null,
  initialReason = '',
  initialLinks = [],
  initialDocumentUrls = [],
}: RequestVerificationModalProps) {
  const [reason, setReason] = useState('');
  const [link1, setLink1] = useState('');
  const [link2, setLink2] = useState('');
  const [documentUrls, setDocumentUrls] = useState<string[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isBusiness = targetType === 'business' && Boolean(businessProfile);

  useEffect(() => {
    if (isOpen) {
      setReason(initialReason || '');
      setLink1(initialLinks[0] || '');
      setLink2(initialLinks[1] || '');
      setDocumentUrls(
        Array.isArray(initialDocumentUrls) ? initialDocumentUrls.slice(0, 5) : []
      );
      setUploadingDoc(false);
      setUploadProgress(0);
      setError(null);
      setSuccess(false);
      setSubmitting(false);
    }
  }, [isOpen, initialReason, initialLinks, initialDocumentUrls]);

  if (!isOpen) return null;

  const handleDocumentUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (documentUrls.length >= 5) {
      setError('Maximum of 5 supporting documents allowed.');
      return;
    }

    setError(null);
    setUploadingDoc(true);
    setUploadProgress(0);
    try {
      const uploaded = await uploadMediaToCloudflareR2(file, 'posts', (pct) =>
        setUploadProgress(pct)
      );
      setDocumentUrls((prev) => [...prev, uploaded.url].slice(0, 5));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to upload supporting document. You can still provide URL links below.'
      );
    } finally {
      setUploadingDoc(false);
      setUploadProgress(0);
    }
  };

  const handleRemoveDocument = (index: number) => {
    setDocumentUrls((prev) => prev.filter((_, idx) => idx !== index));
  };

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
      const res = await onSubmit(
        check.cleanReason || reason.trim(),
        check.cleanLinks || links,
        documentUrls
      );
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
      className="fixed inset-0 z-50 h-[100dvh] w-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden looma-stage-enter"
    >
      <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-950">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close verification request modal"
            className="min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-center gap-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
            <span className="hidden sm:inline text-xs font-semibold">Back</span>
          </button>
          <div className="min-w-0">
            <h2
              id="verify-modal-title"
              className="font-display text-base sm:text-lg font-bold truncate"
            >
              {isBusiness
                ? 'Request Business Verification'
                : 'Request Verification Badge'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {isBusiness && businessProfile
                ? `Submitting credentials for ${businessProfile.displayName} (@${businessProfile.slug})`
                : 'Submit your reason, reference links, and optional supporting documents for admin review'}
            </p>
          </div>
        </div>

        {!success && (
          <button
            type="submit"
            form="verification-form"
            disabled={submitting || uploadingDoc}
            className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60 transition-colors shrink-0"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Context Banner */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              {isBusiness ? (
                <Building2 className="w-5 h-5" aria-hidden="true" />
              ) : (
                <UserCheck className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 text-xs">
              <p className="font-bold text-slate-900 dark:text-white">
                {isBusiness && businessProfile
                  ? `${businessProfile.displayName} (@${businessProfile.slug})`
                  : 'Personal Account Verification'}
              </p>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                {isBusiness
                  ? 'Business verification applies strictly to this Business Profile ID. Your personal handle remains separate.'
                  : 'Verification badges are granted only after administrator review.'}
              </p>
            </div>
          </div>

          {success ? (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="font-display text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Verification Request Submitted
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-md mx-auto">
                Your submission is now in the review queue with Pending status. A badge will appear only once approved by Looma administrators.
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
            <form
              onSubmit={handleSubmit}
              id="verification-form"
              noValidate
              className="space-y-5"
            >
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
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {isBusiness
                      ? 'Business Overview & Authenticity Reason'
                      : 'Reason for Verification'}
                  </label>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {reason.length}/500
                  </span>
                </div>
                <textarea
                  id="verify-reason"
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder={
                    isBusiness
                      ? 'Describe your registered business, domain ownership, commerce footprint, or official brand channels...'
                      : 'Explain why your account should be verified (e.g. notable creator, public figure, studio, or organization)...'
                  }
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 resize-none focus:outline-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="verify-link1"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Official Website / Reference 1 (Required)
                  </label>
                  <input
                    id="verify-link1"
                    type="url"
                    value={link1}
                    onChange={(e) => setLink1(e.target.value)}
                    maxLength={500}
                    placeholder="https://example.com"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="verify-link2"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Reference Link 2 (Optional)
                  </label>
                  <input
                    id="verify-link2"
                    type="url"
                    value={link2}
                    onChange={(e) => setLink2(e.target.value)}
                    maxLength={500}
                    placeholder="https://registry.example.org/entity"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-blue-600"
                  />
                </div>
              </div>

              {/* Supporting Documents Upload */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span>Supporting Documents ({documentUrls.length}/5)</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Upload business registration, trademark proof, tax certificate, or domain verification screenshot (images or files).
                    </p>
                  </div>

                  <label className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {uploadingDoc
                        ? `Uploading ${uploadProgress}%`
                        : 'Upload Document'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={uploadingDoc || documentUrls.length >= 5}
                      onChange={handleDocumentUpload}
                      className="sr-only"
                    />
                  </label>
                </div>

                {documentUrls.length > 0 && (
                  <ul className="space-y-2">
                    {documentUrls.map((docUrl, index) => (
                      <li
                        key={`${docUrl}_${index}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                      >
                        <a
                          href={docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline min-w-0 truncate"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            Supporting Document #{index + 1}
                          </span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocument(index)}
                          aria-label={`Remove document ${index + 1}`}
                          className="min-h-[32px] min-w-[32px] rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingDoc}
                  className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
