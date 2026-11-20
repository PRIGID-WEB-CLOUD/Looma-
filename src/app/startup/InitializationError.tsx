import { AlertTriangle, RefreshCw } from 'lucide-react';
import { LoomaLogoMark } from '../../components/LoomaLogo';
import type { SafeInitializationError } from '../initialization';

interface InitializationErrorProps {
  error: SafeInitializationError | null;
  isTimeout?: boolean;
  retryCount?: number;
  onRetry: () => void;
}

export function InitializationError({
  error,
  isTimeout = false,
  onRetry,
}: InitializationErrorProps) {
  const title =
    error?.title ||
    (isTimeout ? 'Connection Timed Out' : 'Unable to Open Looma');
  const message =
    error?.message ||
    (isTimeout
      ? 'Connecting took longer than expected. Check your connection and try again.'
      : 'Something interrupted startup. Please try again.');

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="initialization-error"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6 transition-colors looma-stage-enter"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-7 shadow-sm space-y-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2.5">
            <LoomaLogoMark size="md" />
            <span className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Looma
            </span>
          </div>

          <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-300 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onRetry}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Try Again</span>
          </button>
        </div>
      </div>
    </div>
  );
}
