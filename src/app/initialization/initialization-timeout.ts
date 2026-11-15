import { AppInitializationError } from './initialization-errors';
import type { InitializationStepId } from './initialization-state';

export interface TimeoutOptions {
  signal?: AbortSignal;
  label?: string;
  step?: InitializationStepId;
}

export function createCancelledError(step?: InitializationStepId): AppInitializationError {
  return new AppInitializationError({
    code: 'CANCELLED',
    title: 'Initialization Cancelled',
    message: 'Startup was cancelled before finishing.',
    step,
    recoverable: true,
  });
}

export function createTimeoutError(
  label: string,
  timeoutMs: number,
  step?: InitializationStepId
): AppInitializationError {
  return new AppInitializationError({
    code: 'TIMEOUT',
    title: 'Initialization Timed Out',
    message: `${label} did not respond within ${Math.max(1, Math.round(timeoutMs / 1000))} seconds.`,
    step,
    recoverable: true,
  });
}

export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  options: TimeoutOptions = {}
): Promise<T> {
  const { signal: outerSignal, label = 'Startup step', step } = options;

  if (outerSignal?.aborted) {
    throw createCancelledError(step);
  }

  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let onOuterAbort: (() => void) | null = null;

  const racePromise = new Promise<T>((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (outerSignal && onOuterAbort) {
        outerSignal.removeEventListener('abort', onOuterAbort);
      }
      fn();
    };

    onOuterAbort = () => {
      controller.abort();
      finish(() => reject(createCancelledError(step)));
    };

    if (outerSignal) {
      outerSignal.addEventListener('abort', onOuterAbort, { once: true });
    }

    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      timerId = setTimeout(() => {
        controller.abort();
        finish(() => reject(createTimeoutError(label, timeoutMs, step)));
      }, timeoutMs);
    }

    Promise.resolve()
      .then(() => work(controller.signal))
      .then(
        (value) => finish(() => resolve(value)),
        (err) => {
          if (controller.signal.aborted && !outerSignal?.aborted) {
            finish(() => reject(createTimeoutError(label, timeoutMs, step)));
            return;
          }
          finish(() => reject(err));
        }
      );
  });

  return racePromise;
}
