export enum InitializationState {
  INITIALIZING = 'INITIALIZING',
  LOADING_CONFIG = 'LOADING_CONFIG',
  INITIALIZING_SDKS = 'INITIALIZING_SDKS',
  INITIALIZING_AUTH = 'INITIALIZING_AUTH',
  RESTORING_SESSION = 'RESTORING_SESSION',
  INITIALIZING_DATABASE = 'INITIALIZING_DATABASE',
  INITIALIZING_STORAGE = 'INITIALIZING_STORAGE',
  INITIALIZING_CACHE = 'INITIALIZING_CACHE',
  INITIALIZING_NETWORK = 'INITIALIZING_NETWORK',
  INITIALIZING_SECURITY = 'INITIALIZING_SECURITY',
  INITIALIZING_ROUTER = 'INITIALIZING_ROUTER',
  INITIALIZATION_COMPLETE = 'INITIALIZATION_COMPLETE',
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  INITIALIZATION_TIMEOUT = 'INITIALIZATION_TIMEOUT',
  OFFLINE_INITIALIZATION = 'OFFLINE_INITIALIZATION',
}

export const ALL_INITIALIZATION_STATES: readonly InitializationState[] = [
  InitializationState.INITIALIZING,
  InitializationState.LOADING_CONFIG,
  InitializationState.INITIALIZING_SDKS,
  InitializationState.INITIALIZING_AUTH,
  InitializationState.RESTORING_SESSION,
  InitializationState.INITIALIZING_DATABASE,
  InitializationState.INITIALIZING_STORAGE,
  InitializationState.INITIALIZING_CACHE,
  InitializationState.INITIALIZING_NETWORK,
  InitializationState.INITIALIZING_SECURITY,
  InitializationState.INITIALIZING_ROUTER,
  InitializationState.INITIALIZATION_COMPLETE,
  InitializationState.INITIALIZATION_FAILED,
  InitializationState.INITIALIZATION_TIMEOUT,
  InitializationState.OFFLINE_INITIALIZATION,
] as const;

export type InitializationStepId =
  | 'config'
  | 'security'
  | 'cache'
  | 'network'
  | 'sdks'
  | 'auth'
  | 'session'
  | 'database'
  | 'storage'
  | 'notifications'
  | 'router';

export type InitializationStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'offline'
  | 'failed';

export interface InitializationStepSnapshot {
  id: InitializationStepId;
  label: string;
  required: boolean;
  status: InitializationStepStatus;
  startedAtMs?: number;
  completedAtMs?: number;
  durationMs?: number;
  detail?: string;
}

export interface SafeInitializationError {
  code: string;
  title: string;
  message: string;
  step?: InitializationStepId;
  recoverable: boolean;
  timestampMs: number;
}

export interface InitializationDiagnostics {
  runId: number;
  startedAtMs: number;
  completedAtMs?: number;
  durationMs?: number;
  isOffline: boolean;
  configValid: boolean;
  authRestored: boolean;
  hasAuthenticatedSession: boolean;
  databaseReady: boolean;
  storageConfigured: boolean;
  callsConfigured: boolean;
  notificationsReady: boolean;
  routerTarget: string;
  activeTasks: string[];
  warnings: string[];
}

export interface InitializationSnapshot {
  runId: number;
  state: InitializationState;
  progress: number;
  message: string;
  isReady: boolean;
  isFailed: boolean;
  isTimeout: boolean;
  isOffline: boolean;
  canRetry: boolean;
  retryCount: number;
  error: SafeInitializationError | null;
  steps: Record<InitializationStepId, InitializationStepSnapshot>;
  diagnostics: InitializationDiagnostics;
}

export const INITIALIZATION_STATE_MESSAGES: Record<InitializationState, string> = {
  [InitializationState.INITIALIZING]: 'Starting Looma...',
  [InitializationState.LOADING_CONFIG]: 'Loading application configuration...',
  [InitializationState.INITIALIZING_SECURITY]: 'Verifying runtime security context...',
  [InitializationState.INITIALIZING_CACHE]: 'Restoring local preferences and cache...',
  [InitializationState.INITIALIZING_NETWORK]: 'Checking network connectivity...',
  [InitializationState.INITIALIZING_SDKS]: 'Connecting core platform services...',
  [InitializationState.INITIALIZING_AUTH]: 'Preparing authentication services...',
  [InitializationState.RESTORING_SESSION]: 'Restoring your session...',
  [InitializationState.INITIALIZING_DATABASE]: 'Verifying real-time database access...',
  [InitializationState.INITIALIZING_STORAGE]: 'Checking media storage and calling endpoints...',
  [InitializationState.INITIALIZING_ROUTER]: 'Preparing workspace navigation...',
  [InitializationState.INITIALIZATION_COMPLETE]: 'Ready',
  [InitializationState.OFFLINE_INITIALIZATION]: 'Ready in offline mode',
  [InitializationState.INITIALIZATION_FAILED]: 'Unable to initialize Looma',
  [InitializationState.INITIALIZATION_TIMEOUT]: 'Initialization timed out',
};

export const INITIALIZATION_STATE_PROGRESS: Record<InitializationState, number> = {
  [InitializationState.INITIALIZING]: 5,
  [InitializationState.LOADING_CONFIG]: 14,
  [InitializationState.INITIALIZING_SECURITY]: 24,
  [InitializationState.INITIALIZING_CACHE]: 34,
  [InitializationState.INITIALIZING_NETWORK]: 42,
  [InitializationState.INITIALIZING_SDKS]: 52,
  [InitializationState.INITIALIZING_AUTH]: 62,
  [InitializationState.RESTORING_SESSION]: 72,
  [InitializationState.INITIALIZING_DATABASE]: 82,
  [InitializationState.INITIALIZING_STORAGE]: 90,
  [InitializationState.INITIALIZING_ROUTER]: 96,
  [InitializationState.INITIALIZATION_COMPLETE]: 100,
  [InitializationState.OFFLINE_INITIALIZATION]: 100,
  [InitializationState.INITIALIZATION_FAILED]: 100,
  [InitializationState.INITIALIZATION_TIMEOUT]: 100,
};

export const ORDERED_INITIALIZATION_STEPS: readonly {
  id: InitializationStepId;
  label: string;
  required: boolean;
}[] = [
  { id: 'config', label: 'Runtime configuration', required: true },
  { id: 'security', label: 'Security checks', required: true },
  { id: 'cache', label: 'Theme and local cache', required: false },
  { id: 'network', label: 'Network status', required: false },
  { id: 'sdks', label: 'Core SDKs', required: true },
  { id: 'auth', label: 'Authentication client', required: true },
  { id: 'session', label: 'Session restoration', required: false },
  { id: 'database', label: 'Firestore connectivity', required: false },
  { id: 'storage', label: 'Media and calling services', required: false },
  { id: 'notifications', label: 'Notification permissions', required: false },
  { id: 'router', label: 'Route preparation', required: true },
] as const;

export function isReadyInitializationState(state: InitializationState): boolean {
  return (
    state === InitializationState.INITIALIZATION_COMPLETE ||
    state === InitializationState.OFFLINE_INITIALIZATION
  );
}

export function isTerminalInitializationState(state: InitializationState): boolean {
  return (
    isReadyInitializationState(state) ||
    state === InitializationState.INITIALIZATION_FAILED ||
    state === InitializationState.INITIALIZATION_TIMEOUT
  );
}

export function createInitialStepsRecord(): Record<
  InitializationStepId,
  InitializationStepSnapshot
> {
  const record = {} as Record<InitializationStepId, InitializationStepSnapshot>;
  for (const step of ORDERED_INITIALIZATION_STEPS) {
    record[step.id] = {
      id: step.id,
      label: step.label,
      required: step.required,
      status: 'pending',
    };
  }
  return record;
}

export function createInitialSnapshot(
  runId: number = 0,
  retryCount: number = 0
): InitializationSnapshot {
  const now = Date.now();
  return {
    runId,
    state: InitializationState.INITIALIZING,
    progress: INITIALIZATION_STATE_PROGRESS[InitializationState.INITIALIZING],
    message: INITIALIZATION_STATE_MESSAGES[InitializationState.INITIALIZING],
    isReady: false,
    isFailed: false,
    isTimeout: false,
    isOffline: false,
    canRetry: false,
    retryCount,
    error: null,
    steps: createInitialStepsRecord(),
    diagnostics: {
      runId,
      startedAtMs: now,
      isOffline: false,
      configValid: false,
      authRestored: false,
      hasAuthenticatedSession: false,
      databaseReady: false,
      storageConfigured: false,
      callsConfigured: false,
      notificationsReady: false,
      routerTarget: 'feed',
      activeTasks: [],
      warnings: [],
    },
  };
}
