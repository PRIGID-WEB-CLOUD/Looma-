import { useState } from 'react';
import { BookOpen, CheckCircle2, Megaphone, Plus, ShieldCheck } from 'lucide-react';
import { formatRelativeTime } from '../../src/utils/socialLogic';
import {
  ADMIN_EMAILS,
  type AdminAccessInquiry,
  type AnnouncementAudience,
  type AnnouncementSeverity,
  type CommunityGuidelinesConfig,
  type PlatformAnnouncement,
} from '../adminLogic';

interface GovernanceSectionProps {
  announcements: PlatformAnnouncement[];
  guidelines: CommunityGuidelinesConfig;
  inquiries: AdminAccessInquiry[];
  onPublishAnnouncement: (input: {
    title: string;
    body: string;
    severity: AnnouncementSeverity;
    audience: AnnouncementAudience;
  }) => Promise<{ ok: boolean; error?: string }>;
  onToggleAnnouncement: (id: string) => Promise<void>;
  onSaveGuidelines: (input: {
    version: string;
    summary: string;
    rulesText: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onUpdateInquiryStatus: (id: string, status: AdminAccessInquiry['status']) => void;
}

export function GovernanceSection({
  announcements,
  guidelines,
  inquiries,
  onPublishAnnouncement,
  onToggleAnnouncement,
  onSaveGuidelines,
  onUpdateInquiryStatus,
}: GovernanceSectionProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<AnnouncementSeverity>('info');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');

  const [version, setVersion] = useState(guidelines.version);
  const [summary, setSummary] = useState(guidelines.summary);
  const [rulesText, setRulesText] = useState(guidelines.rulesText);

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await onPublishAnnouncement({ title, body, severity, audience });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Could not publish announcement.' });
      return;
    }
    setTitle('');
    setBody('');
    setFeedback({ type: 'ok', text: 'Platform announcement published and logged.' });
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await onSaveGuidelines({ version, summary, rulesText });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Could not update community guidelines.' });
      return;
    }
    setFeedback({ type: 'ok', text: `Community Guidelines updated to v${version}.` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Governance, Announcements &amp; Approvals
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Publish workspace-wide announcements, maintain Community Guidelines, and review access requests.
        </p>
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

      {/* Platform Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <form
          onSubmit={handlePublish}
          className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Publish Announcement
            </h2>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Title</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Scheduled R2 Storage Upgrade"
              className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Message</span>
            <textarea
              required
              rows={3}
              minLength={10}
              maxLength={600}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Provide concise member guidance and timing."
              className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Severity
              </span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as AnnouncementSeverity)}
                className="w-full min-h-[38px] px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Audience
              </span>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
                className="w-full min-h-[38px] px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <option value="all">All Members</option>
                <option value="verified">Verified Only</option>
                <option value="admins">Admins Only</option>
              </select>
            </label>
          </div>

          <button
            type="submit"
            className="w-full min-h-[40px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Broadcast Announcement</span>
          </button>
        </form>

        <section className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Published Announcements
            </h2>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {announcements.length} total
            </span>
          </div>

          {announcements.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No announcements created yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {announcements.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </span>
                      <span
                        className={`font-mono uppercase font-semibold ${
                          item.severity === 'maintenance'
                            ? 'text-red-600 dark:text-red-400'
                            : item.severity === 'warning'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {item.severity}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        · audience:{item.audience}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        · {formatRelativeTime(item.createdAtMs)}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                      {item.body}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onToggleAnnouncement(item.id)}
                    className={`min-h-[34px] px-3 rounded-lg border text-xs font-semibold shrink-0 cursor-pointer ${
                      item.active
                        ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {item.active ? 'Active (Pause)' : 'Paused (Activate)'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Community Guidelines Editor */}
      <form
        onSubmit={handleSavePolicy}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Community Guidelines Policy
            </h2>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Current revision: v{guidelines.version}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Policy Version
            </span>
            <input
              type="text"
              required
              maxLength={32}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>
          <label className="md:col-span-3 block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Executive Summary
            </span>
            <input
              type="text"
              required
              minLength={10}
              maxLength={300}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Community Standards Clauses
          </span>
          <textarea
            rows={5}
            required
            minLength={20}
            maxLength={5000}
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            className="min-h-[40px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Save Guidelines Revision
          </button>
        </div>
      </form>

      {/* Allowlist + Workspace Access Inquiries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Bootstrap Allowlist
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Verified operator accounts allowed direct console bootstrap:
          </p>
          <ul className="space-y-2 text-xs font-mono text-slate-800 dark:text-slate-200">
            {ADMIN_EMAILS.map((addr) => (
              <li
                key={addr}
                className="flex items-center gap-2 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                <CheckCircle2
                  className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">{addr}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Workspace Access Requests
            </h2>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {inquiries.length} total
            </span>
          </div>

          {inquiries.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No pending workspace access inquiries.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {inquiries.map((inq) => (
                <div
                  key={inq.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {inq.fullName}
                      </span>
                      <span>{inq.email}</span>
                      <span aria-hidden="true">·</span>
                      <span>{inq.organization}</span>
                      <span aria-hidden="true">·</span>
                      <span className="uppercase font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {inq.status}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {inq.note}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onUpdateInquiryStatus(inq.id, 'approved')}
                      className="min-h-[34px] px-3 rounded-lg border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateInquiryStatus(inq.id, 'archived')}
                      className="min-h-[34px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
