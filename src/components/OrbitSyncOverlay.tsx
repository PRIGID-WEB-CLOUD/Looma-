import { LoomaLogoMark } from './LoomaLogo';

interface OrbitSyncOverlayProps {
  label?: string;
  sublabel?: string;
}

export function OrbitSyncOverlay({
  label = 'Switching platform...',
  sublabel = 'Synchronizing profile workspace',
}: OrbitSyncOverlayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      data-testid="orbit-sync-overlay"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-md transition-opacity duration-200"
    >
      <div className="relative rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800/80 shadow-2xl p-7 flex flex-col items-center gap-5 max-w-xs w-full text-center select-none looma-stage-enter">
        {/* Animated dual-orbital rings */}
        <div className="relative w-16 h-16 flex items-center justify-center">
          {/* Outer orbital ring */}
          <svg
            viewBox="0 0 64 64"
            className="w-16 h-16 looma-orbit-spin"
            fill="none"
          >
            <circle
              cx="32"
              cy="32"
              r="28"
              strokeWidth="2.5"
              className="stroke-slate-200 dark:stroke-slate-800"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="50 126"
              className="stroke-blue-600 dark:stroke-blue-400"
            />
          </svg>

          {/* Inner counter-rotating orbital ring */}
          <svg
            viewBox="0 0 48 48"
            className="absolute w-12 h-12 looma-orbit-spin-reverse"
            fill="none"
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="36 90"
              className="stroke-amber-500 dark:stroke-amber-400 opacity-90"
            />
          </svg>

          {/* Central brand mark */}
          <div className="absolute inset-0 flex items-center justify-center">
            <LoomaLogoMark size="sm" />
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
            {label}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {sublabel}
          </p>
        </div>
      </div>
    </div>
  );
}
