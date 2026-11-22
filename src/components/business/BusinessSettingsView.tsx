import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageSquare,
  Pencil,
  Plus,
  ShieldCheck,
  Store,
  Trash2,
} from 'lucide-react';
import type { BusinessMembershipRole, BusinessProfile } from '../../types/business';
import type { BusinessMessagingSettings, QuickReplyItem } from '../../types/businessChat';
import type { ThemeMode, VerificationRequest, VerificationRequestStatus } from '../../types/social';
import {
  launchCommerceDashboardSso,
  provisionCommerceStoreForBusiness,
  saveBusinessMessagingSettings,
  subscribeBusinessMessagingSettings,
  subscribeBusinessVerificationRequests,
} from '../../services/businessProfiles';
import { RequestVerificationModal } from '../RequestVerificationModal';
import { VerifiedBadge } from '../VerifiedBadge';
import { Avatar } from '../Avatar';

interface BusinessSettingsViewProps {
  businessProfile: BusinessProfile;
  role: BusinessMembershipRole;
  viewerUid: string;
  theme: ThemeMode;
  onEditBusinessProfile: (bp: BusinessProfile) => void;
  onSubmitVerificationRequest: (
    bp: BusinessProfile,
    reason: string,
    links: string[],
    documentUrls?: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  onResubmitVerificationRequest: (
    requestId: string,
    reason: string,
    links: string[],
    documentUrls?: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  onStoreProvisioned?: (storeId: string, storeSlug: string) => void;
}

function getVerificationStatusMeta(status: VerificationRequestStatus): {
  label: string;
  tone: string;
} {
  switch (status) {
    case 'approved':
      return {
        label: 'Verified',
        tone: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      };
    case 'under_review':
      return {
        label: 'Under Review',
        tone: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      };
    case 'more_info_required':
      return {
        label: 'More Info Required',
        tone: 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        tone: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
      };
    default:
      return {
        label: 'Pending Review',
        tone: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      };
  }
}

export function BusinessSettingsView({
  businessProfile,
  role,
  viewerUid,
  theme,
  onEditBusinessProfile,
  onSubmitVerificationRequest,
  onResubmitVerificationRequest,
  onStoreProvisioned,
}: BusinessSettingsViewProps) {
  const [messagingSettings, setMessagingSettings] = useState<BusinessMessagingSettings | null>(
    null
  );
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [awayEnabled, setAwayEnabled] = useState(false);
  const [awayMessage, setAwayMessage] = useState('');
  const [quickReplies, setQuickReplies] = useState<QuickReplyItem[]>([]);
  const [newQrLabel, setNewQrLabel] = useState('');
  const [newQrText, setNewQrText] = useState('');
  const [savingMsg, setSavingMsg] = useState(false);

  const [verificationHistory, setVerificationHistory] = useState<VerificationRequest[]>([]);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState<VerificationRequest | null>(null);

  const [portalBusy, setPortalBusy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdminOrOwner = role === 'OWNER' || role === 'ADMIN';
  const canEditMessaging = role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';

  useEffect(() => {
    return subscribeBusinessMessagingSettings(businessProfile.id, (settings) => {
      setMessagingSettings(settings);
      setWelcomeEnabled(settings.welcomeEnabled);
      setWelcomeMessage(settings.welcomeMessage);
      setAwayEnabled(settings.awayEnabled);
      setAwayMessage(settings.awayMessage);
      setQuickReplies(settings.quickReplies || []);
    });
  }, [businessProfile.id]);

  useEffect(() => {
    return subscribeBusinessVerificationRequests(
      businessProfile.id,
      businessProfile.ownerUid,
      setVerificationHistory
    );
  }, [businessProfile.id, businessProfile.ownerUid]);

  const latestVerification = verificationHistory[0] || null;
  const canRequestVerification =
    isAdminOrOwner &&
    !businessProfile.verified &&
    (!latestVerification ||
      latestVerification.status === 'rejected' ||
      latestVerification.status === 'more_info_required');

  const handleSaveMessaging = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditMessaging || savingMsg) return;
    setError(null);
    setNotice(null);
    setSavingMsg(true);
    try {
      await saveBusinessMessagingSettings(businessProfile.id, viewerUid, {
        welcomeEnabled,
        welcomeMessage,
        awayEnabled,
        awayMessage,
        quickReplies,
      });
      setNotice('Automated business messaging settings saved.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save messaging settings.'
      );
    } finally {
      setSavingMsg(false);
    }
  };

  const handleAddQuickReply = () => {
    if (!newQrLabel.trim() || !newQrText.trim()) return;
    setQuickReplies((prev) =>
      [
        ...prev,
        {
          id: `qr_${Date.now()}`,
          label: newQrLabel.trim().slice(0, 60),
          text: newQrText.trim().slice(0, 500),
        },
      ].slice(0, 20)
    );
    setNewQrLabel('');
    setNewQrText('');
  };

  const handleCopyBusinessLink = async () => {
    const url = `${window.location.origin}/business/${businessProfile.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handlePortalLaunch = async () => {
    if (!isAdminOrOwner || portalBusy) return;
    setError(null);
    setPortalBusy(true);
    try {
      if (!businessProfile.commerceStoreId) {
        const res = await provisionCommerceStoreForBusiness(businessProfile.id);
        onStoreProvisioned?.(res.storeId, res.storeSlug);
      }
      await launchCommerceDashboardSso(businessProfile.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to authorize Seller Portal.'
      );
      setPortalBusy(false);
    }
  };

  return (
    <section aria-label="Business Profile Settings" className="space-y-6">
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2 w-full">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {/* Business Identity Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <Avatar
              src={businessProfile.logoUrl}
              name={businessProfile.displayName}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  {businessProfile.displayName}
                </h2>
                {businessProfile.verified && <VerifiedBadge size={16} />}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                @{businessProfile.slug} · {businessProfile.category} · {businessProfile.currency}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyBusinessLink()}
              className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
            </button>
            {isAdminOrOwner && (
              <button
                type="button"
                onClick={() => onEditBusinessProfile(businessProfile)}
                className="min-h-[38px] px-3.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Edit Business Details</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Exclusive Business Commerce Seller Portal Card */}
      {isAdminOrOwner && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
              <Store className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Merchant Storefront & Seller Portal</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {businessProfile.commerceStoreId
                ? `Connected Storefront: ${businessProfile.commerceStoreSlug || businessProfile.slug}`
                : 'Storefront is ready to provision exclusively for this Business Profile.'}
            </p>
          </div>

          <button
            type="button"
            disabled={portalBusy}
            onClick={() => void handlePortalLaunch()}
            title={
              portalBusy
                ? 'Authorizing...'
                : businessProfile.commerceStoreId
                  ? 'Launch Seller Portal'
                  : 'Activate & Launch Store'
            }
            aria-label={
              portalBusy
                ? 'Authorizing...'
                : businessProfile.commerceStoreId
                  ? 'Launch Seller Portal'
                  : 'Activate & Launch Store'
            }
            className="min-h-[40px] w-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center justify-center cursor-pointer disabled:opacity-60 shrink-0"
          >
            <Store className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Business Verification Application Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Business Verification</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Submit official entity details and documents to earn a verified Business badge on @{businessProfile.slug}.
            </p>
          </div>

          {businessProfile.verified ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <VerifiedBadge size={14} />
              <span>Verified Business</span>
            </span>
          ) : canRequestVerification ? (
            <button
              type="button"
              onClick={() => {
                setResubmitTarget(
                  latestVerification &&
                    (latestVerification.status === 'more_info_required' ||
                      latestVerification.status === 'rejected')
                    ? latestVerification
                    : null
                );
                setVerifyModalOpen(true);
              }}
              title={
                latestVerification?.status === 'more_info_required'
                  ? 'Submit Additional Info'
                  : latestVerification?.status === 'rejected'
                    ? 'Resubmit Verification'
                    : 'Request Verification'
              }
              aria-label={
                latestVerification?.status === 'more_info_required'
                  ? 'Submit Additional Info'
                  : latestVerification?.status === 'rejected'
                    ? 'Resubmit Verification'
                    : 'Request Verification'
              }
              className="min-h-[40px] w-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center justify-center cursor-pointer shrink-0"
            >
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : latestVerification ? (
            <span
              className={`px-3 py-1 rounded-xl text-xs font-semibold border ${
                getVerificationStatusMeta(latestVerification.status).tone
              }`}
            >
              {getVerificationStatusMeta(latestVerification.status).label}
            </span>
          ) : null}
        </div>

        {verificationHistory.length > 0 && (
          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Verification Request History
            </p>
            {verificationHistory.map((item) => {
              const meta = getVerificationStatusMeta(item.status);
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.tone}`}>
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {new Date(item.createdAtMs).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-200">{item.reason}</p>
                  {item.reviewerNote && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Reviewer note: <span className="font-medium text-slate-700 dark:text-slate-200">{item.reviewerNote}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Business Messaging Automations & Quick Replies */}
      <form
        onSubmit={handleSaveMessaging}
        className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Business Inbox Automations & Quick Replies</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configure automated welcome/away replies and saved canned responses for customer conversations.
            </p>
          </div>
          {canEditMessaging && messagingSettings && (
            <button
              type="submit"
              disabled={savingMsg}
              className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {savingMsg ? 'Saving...' : 'Save Messaging'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
            <label className="flex items-center justify-between gap-2 text-xs font-semibold cursor-pointer">
              <span>Automated Welcome Message</span>
              <input
                type="checkbox"
                disabled={!canEditMessaging}
                checked={welcomeEnabled}
                onChange={(e) => setWelcomeEnabled(e.target.checked)}
                className="rounded border-slate-300"
              />
            </label>
            <textarea
              rows={3}
              maxLength={500}
              disabled={!canEditMessaging}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Hi! Thanks for messaging our store..."
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs resize-none"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
            <label className="flex items-center justify-between gap-2 text-xs font-semibold cursor-pointer">
              <span>Automated Away Message</span>
              <input
                type="checkbox"
                disabled={!canEditMessaging}
                checked={awayEnabled}
                onChange={(e) => setAwayEnabled(e.target.checked)}
                className="rounded border-slate-300"
              />
            </label>
            <textarea
              rows={3}
              maxLength={500}
              disabled={!canEditMessaging}
              value={awayMessage}
              onChange={(e) => setAwayMessage(e.target.value)}
              placeholder="Our support hours are..."
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs resize-none"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-900 dark:text-white">
            Saved Quick Replies ({quickReplies.length}/20)
          </p>
          {quickReplies.length > 0 && (
            <div className="space-y-2">
              {quickReplies.map((qr) => (
                <div
                  key={qr.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white">{qr.label}</p>
                    <p className="text-slate-600 dark:text-slate-300 mt-0.5">{qr.text}</p>
                  </div>
                  {canEditMessaging && (
                    <button
                      type="button"
                      onClick={() =>
                        setQuickReplies((prev) => prev.filter((item) => item.id !== qr.id))
                      }
                      aria-label={`Delete quick reply ${qr.label}`}
                      className="min-h-[30px] min-w-[30px] rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canEditMessaging && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                maxLength={60}
                value={newQrLabel}
                onChange={(e) => setNewQrLabel(e.target.value)}
                placeholder="Label (e.g. Shipping Time)"
                aria-label="Quick reply label"
                className="sm:w-48 min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
              <input
                type="text"
                maxLength={500}
                value={newQrText}
                onChange={(e) => setNewQrText(e.target.value)}
                placeholder="Full response message..."
                aria-label="Quick reply text"
                className="flex-1 min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
              <button
                type="button"
                onClick={handleAddQuickReply}
                className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Reply</span>
              </button>
            </div>
          )}
        </div>
      </form>

      <RequestVerificationModal
        isOpen={verifyModalOpen}
        onClose={() => {
          setVerifyModalOpen(false);
          setResubmitTarget(null);
        }}
        theme={theme}
        targetType="business"
        businessProfile={businessProfile}
        initialReason={resubmitTarget?.reason || ''}
        initialLinks={resubmitTarget?.links || []}
        initialDocumentUrls={resubmitTarget?.documentUrls || []}
        onSubmit={async (reason, links, documentUrls) => {
          if (resubmitTarget && resubmitTarget.status === 'more_info_required') {
            return onResubmitVerificationRequest(
              resubmitTarget.id,
              reason,
              links,
              documentUrls
            );
          }
          return onSubmitVerificationRequest(
            businessProfile,
            reason,
            links,
            documentUrls
          );
        }}
      />
    </section>
  );
}
