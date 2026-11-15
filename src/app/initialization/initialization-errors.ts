import type {
  InitializationStepId,
  SafeInitializationError,
} from './initialization-state';

export type InitializationErrorCode =
  | 'CONFIG_INVALID'
  | 'SECURITY_CONTEXT_INVALID'
  | 'SDK_INIT_FAILED'
  | 'AUTH_FAILED'
  | 'DATABASE_FAILED'
  | 'STORAGE_FAILED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'OFFLINE'
  | 'UNKNOWN';

export class AppInitializationError extends Error {
  readonly code: InitializationErrorCode;
  readonly title: string;
  readonly step?: InitializationStepId;
  readonly recoverable: boolean;

  constructor(params: {
    code: InitializationErrorCode;
    title: string;
    message: string;
    step?: InitializationStepId;
    recoverable?: boolean;
  }) {
    super(params.message);
    this.name = 'AppInitializationError';
    this.code = params.code;
    this.title = params.title;
    this.step = params.step;
    this.recoverable = params.recoverable ?? true;
  }
}

const SECRET_OR_INTERNAL_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z\-_]{20,}/g,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /CLOUDFLARE_[A-Z0-9_]+/g,
  /R2_[A-Z0-9_]+/g,
  /CALLS_STATE_SECRET/g,
  /\bat\s+[^\n]+\([^)]+\)/g,
  /\/(?:Users|home|app|var|src)\/[^\s:]+/g,
];

export function sanitizeInitializationMessage(
  raw: unknown,
  fallback: string = 'An unexpected error occurred while starting Looma. Please try again.'
): string {
  const base =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
        ? raw
        : '';

  let cleaned = base.split('\n')[0]?.trim() || '';
  if (!cleaned) return fallback;

  for (const pattern of SECRET_OR_INTERNAL_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[redacted]');
  }

  if (
    cleaned.startsWith('{') ||
    cleaned.includes('[redacted]') ||
    cleaned.length > 220
  ) {
    return fallback;
  }

  return cleaned;
}

export function normalizeInitializationError(
  error: unknown,
  fallbackStep?: InitializationStepId
): SafeInitializationError {
  const now = Date.now();

  if (error instanceof AppInitializationError) {
    return {
      code: error.code,
      title: error.title,
      message: sanitizeInitializationMessage(error.message),
      step: error.step ?? fallbackStep,
      recoverable: error.recoverable,
      timestampMs: now,
    };
  }

  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message.toLowerCase().includes('cancelled') ||
      error.message.toLowerCase().includes('aborted'))
  ) {
    return {
      code: 'CANCELLED',
      title: 'Initialization Cancelled',
      message: 'Startup was interrupted before completion. Retry to continue.',
      step: fallbackStep,
      recoverable: true,
      timestampMs: now,
    };
  }

  if (
    error instanceof Error &&
    (error.name === 'TimeoutError' ||
      error.message.toLowerCase().includes('timed out'))
  ) {
    return {
      code: 'TIMEOUT',
      title: 'Startup Timed Out',
      message:
        'Connecting to Looma services took longer than expected. Check your connection and retry.',
      step: fallbackStep,
      recoverable: true,
      timestampMs: now,
    };
  }

  return {
    code: 'UNKNOWN',
    title: 'Startup Interrupted',
    message: sanitizeInitializationMessage(error),
    step: fallbackStep,
    recoverable: true,
    timestampMs: now,
  };
}
