import { useState } from 'react';
import { Activity, Cpu, Flag, History, Play, RefreshCw, Search } from 'lucide-react';
import { formatRelativeTime } from '../../src/utils/socialLogic';
import {
  filterAuditLogs,
  type AdminAuditEntry,
  type AdminFeatureFlags,
  type BackgroundJobItem,
  type SystemHealthProbe,
} from '../adminLogic';

interface SystemOpsSectionProps {
  featureFlags: AdminFeatureFlags;
  auditLogs: AdminAuditEntry[];
  healthProbes: SystemHealthProbe[];
  jobs: BackgroundJobItem[];
  checkingHealth: boolean;
  onToggleFlag: (key: keyof Omit<AdminFeatureFlags, 'updatedBy' | 'updatedAtMs'>) => Promise<void>;
  onRunHealthProbes: () => Promise<void>;
  onRunBackgroundJob: (jobId: string) => Promise<void>;
}

const FLAG_DEFS: Array<{
  key: keyof Omit<AdminFeatureFlags, 'updatedBy' | 'updatedAtMs'>;
  label: string;
  description: string;
}> = [
  {
    key: 'storiesEnabled',
    label: '24-Hour Stories',
    description: 'Allow verified members to publish ephemeral 24-hour visual frames.',
  },
  {
    key: 'voiceNotesEnabled',
    label: 'Voice Notes & Audio Pipeline',
    description: 'Enable microphone recording & R2 audio uploads in posts and messages.',
  },
  {
    key: 'callsEnabled',
    label: 'Cloudflare WebRTC Calls',
    description: 'Enable live audio/video SFU call rooms across group and direct chats.',
  },
  {
    key: 'registrationsOpen',
    label: 'New Member Registrations',
    description: 'Allow new accounts to complete profile onboarding.',
  },
  {
    key: 'strictModerationQueue',
    label: 'Strict Link Moderation Queue',
    description: 'Hold posts with unknown external URLs for moderator review.',
  },
  {
    key: 'maintenanceMode',
    label: 'Maintenance Mode Banner',
    description: 'Display read-only maintenance warning across workspace sessions.',
  },
];

export function SystemOpsSection({
  featureFlags,
  auditLogs,
  healthProbes,
  jobs,
  checkingHealth,
  onToggleFlag,
  onRunHealthProbes,
  onRunBackgroundJob,
}: SystemOpsSectionProps) {
  const [logSearch, setLogSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const uniqueActions = Array.from(new Set(auditLogs.map((l) => l.action))).sort();
  const visibleLogs = filterAuditLogs(auditLogs, logSearch, actionFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            System Health, Feature Flags &amp; Audit Logs
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Run live infrastructure probes, trigger background maintenance jobs, toggle runtime feature flags, and inspect the immutable audit trail.
          </p>
        </div>

        <button
          type="button"
          disabled={checkingHealth}
          onClick={() => void onRunHealthProbes()}
          className="min-h-[38px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{checkingHealth ? 'Probing...' : 'Run Live Probes'}</span>
        </button>
      </div>

      {/* System Health Probes */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Infrastructure Health Checks
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
          {healthProbes.map((probe) => (
            <div key={probe.id} className="p-5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  {probe.service}
                </span>
                <span
                  className={`font-mono text-[11px] uppercase font-bold ${
                    probe.status === 'healthy'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : probe.status === 'degraded'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {probe.status}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{probe.detail}</p>
              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {probe.latencyMs !== null ? `Latency: ${probe.latencyMs}ms · ` : ''}
                Checked {formatRelativeTime(probe.checkedAtMs)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Flags & Background Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Flag className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Feature Flags
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {FLAG_DEFS.map((item) => {
              const enabled = featureFlags[item.key];
              return (
                <div
                  key={item.key}
                  className="p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={item.label}
                    onClick={() => void onToggleFlag(item.key)}
                    className={`min-h-[34px] px-3 rounded-lg border font-mono text-xs font-semibold shrink-0 cursor-pointer ${
                      enabled
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {enabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Background Maintenance Jobs
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                      {job.name}
                    </span>
                    <span className="font-mono text-[11px] uppercase text-blue-600 dark:text-blue-400">
                      {job.lastStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{job.description}</p>
                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {job.lastSummary} · Schedule: {job.cadence}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={job.lastStatus === 'running'}
                  onClick={() => void onRunBackgroundJob(job.id)}
                  className="min-h-[34px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <Play className="w-3 h-3" aria-hidden="true" />
                  <span>{job.lastStatus === 'running' ? 'Running' : 'Execute'}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Immutable Admin Audit Logs */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Immutable Administrator Audit Trail
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search audit logs"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search actor, target, summary"
                className="min-h-[36px] pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              aria-label="Filter audit logs by action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="min-h-[36px] px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
            >
              <option value="all">All Actions</option>
              {uniqueActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        </div>

        {visibleLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No audit events match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5 font-semibold">Timestamp</th>
                  <th className="py-3 px-4 font-semibold">Actor</th>
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">Target</th>
                  <th className="py-3 px-5 font-semibold">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleLogs.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="py-2.5 px-5 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {formatRelativeTime(entry.createdAtMs)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {entry.actorEmail}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {entry.action}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {entry.targetType}:{entry.targetId}
                    </td>
                    <td className="py-2.5 px-5 text-xs text-slate-700 dark:text-slate-300">
                      {entry.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
