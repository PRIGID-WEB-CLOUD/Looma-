import { LoomaLogoMark } from '../../components/LoomaLogo';
import type { InitializationSnapshot } from '../initialization';

interface InitializationScreenProps {
  snapshot?: InitializationSnapshot;
  messageOverride?: string;
}

export function InitializationScreen({
  snapshot,
  messageOverride,
}: InitializationScreenProps) {
  const statusLabel =
    messageOverride ||
    (snapshot?.isOffline ? 'Opening Looma offline' : 'Opening Looma');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusLabel}
      data-testid="initialization-screen"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6 transition-colors"
    >
      <div className="flex flex-col items-center gap-7 select-none">
        {/* Compact brand identity lockup */}
        <div className="flex items-center gap-2.5">
          <LoomaLogoMark size="md" />
          <span className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Looma
          </span>
        </div>

        {/* Classic 3-dot wave inside a continuously turning circular orbit */}
        <div
          aria-hidden="true"
          data-testid="looma-orbit-loader"
          className="relative w-14 h-14 flex items-center justify-center"
        >
          <svg
            viewBox="0 0 56 56"
            className="w-14 h-14 looma-orbit-spin"
            fill="none"
          >
            <circle
              cx="28"
              cy="28"
              r="24"
              strokeWidth="2.25"
              className="stroke-slate-200 dark:stroke-slate-800"
            />
            <circle
              cx="28"
              cy="28"
              r="24"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="44 112"
              className="stroke-blue-600 dark:stroke-amber-400"
            />
          </svg>

          <div className="absolute inset-0 flex items-center justify-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-amber-400 looma-fb-dot"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-amber-400 looma-fb-dot"
              style={{ animationDelay: '160ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-amber-400 looma-fb-dot"
              style={{ animationDelay: '320ms' }}
            />
          </div>
        </div>
      </div>

      <span className="sr-only">{statusLabel}</span>
    </div>
  );
}
