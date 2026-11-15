import {
  DEFAULT_INITIALIZATION_TIMEOUT_MS,
  type InitializationConfig,
} from './initialization-config';
import {
  AppInitializationError,
  normalizeInitializationError,
} from './initialization-errors';
import {
  createInitialSnapshot,
  INITIALIZATION_STATE_MESSAGES,
  INITIALIZATION_STATE_PROGRESS,
  InitializationState,
  isReadyInitializationState,
  type InitializationSnapshot,
  type InitializationStepId,
  type InitializationStepStatus,
} from './initialization-state';
import {
  createBrowserInitializationAdapters,
  type InitializationAdapters,
} from './initialization-tasks';
import { withTimeout } from './initialization-timeout';

export interface InitializeOptions {
  force?: boolean;
  timeoutMs?: number;
}

export interface InitializationManagerOptions {
  adapters?: Partial<InitializationAdapters>;
  defaultTimeoutMs?: number;
}

type SnapshotListener = (snapshot: InitializationSnapshot) => void;

export class InitializationManager {
  private adapters: InitializationAdapters;
  private defaultTimeoutMs: number;
  private snapshot: InitializationSnapshot;
  private listeners: Set<SnapshotListener> = new Set();
  private activePromise: Promise<InitializationSnapshot> | null = null;
  private activeController: AbortController | null = null;
  private activeRunId: number = 0;
  private retryCount: number = 0;

  constructor(options: InitializationManagerOptions = {}) {
    const defaults = createBrowserInitializationAdapters();
    this.adapters = {
      ...defaults,
      ...(options.adapters || {}),
    };
    this.defaultTimeoutMs =
      options.defaultTimeoutMs ?? DEFAULT_INITIALIZATION_TIMEOUT_MS;
    this.snapshot = createInitialSnapshot(0, 0);
  }

  getSnapshot(): InitializationSnapshot {
    return this.snapshot;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  private updateSnapshot(
    runId: number,
    updater: (current: InitializationSnapshot) => InitializationSnapshot
  ): void {
    if (runId !== this.activeRunId) return;
    this.snapshot = updater(this.snapshot);
    this.emit();
  }

  private transitionState(
    runId: number,
    state: InitializationState,
    message?: string
  ): void {
    this.updateSnapshot(runId, (curr) => ({
      ...curr,
      state,
      progress: Math.max(curr.progress, INITIALIZATION_STATE_PROGRESS[state]),
      message: message ?? INITIALIZATION_STATE_MESSAGES[state],
    }));
  }

  private setStepStatus(
    runId: number,
    stepId: InitializationStepId,
    status: InitializationStepStatus,
    detail?: string
  ): void {
    const now = Date.now();
    this.updateSnapshot(runId, (curr) => {
      const prevStep = curr.steps[stepId];
      const startedAtMs =
        status === 'running' ? now : prevStep.startedAtMs ?? now;
      const isEnd =
        status === 'completed' ||
        status === 'skipped' ||
        status === 'offline' ||
        status === 'failed';
      const completedAtMs = isEnd ? now : undefined;
      const durationMs =
        completedAtMs !== undefined
          ? Math.max(0, completedAtMs - startedAtMs)
          : undefined;

      const activeTasks = new Set(curr.diagnostics.activeTasks);
      if (status === 'running') {
        activeTasks.add(stepId);
      } else {
        activeTasks.delete(stepId);
      }

      return {
        ...curr,
        steps: {
          ...curr.steps,
          [stepId]: {
            ...prevStep,
            status,
            startedAtMs,
            completedAtMs,
            durationMs,
            detail: detail ?? prevStep.detail,
          },
        },
        diagnostics: {
          ...curr.diagnostics,
          activeTasks: Array.from(activeTasks),
        },
      };
    });
  }

  private addWarning(runId: number, warning: string): void {
    if (!warning) return;
    this.updateSnapshot(runId, (curr) => ({
      ...curr,
      diagnostics: {
        ...curr.diagnostics,
        warnings: curr.diagnostics.warnings.includes(warning)
          ? curr.diagnostics.warnings
          : [...curr.diagnostics.warnings, warning],
      },
    }));
  }

  async initialize(
    options: InitializeOptions = {}
  ): Promise<InitializationSnapshot> {
    if (!options.force) {
      if (this.activePromise) {
        return this.activePromise;
      }
      if (isReadyInitializationState(this.snapshot.state)) {
        return this.snapshot;
      }
    } else if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
      this.activePromise = null;
    }

    const runId = ++this.activeRunId;
    const controller = new AbortController();
    this.activeController = controller;
    this.snapshot = createInitialSnapshot(runId, this.retryCount);
    this.emit();

    const runPromise = this.executeRun(runId, controller.signal, options).finally(
      () => {
        if (this.activeRunId === runId) {
          this.activePromise = null;
          this.activeController = null;
        }
      }
    );

    this.activePromise = runPromise;
    return runPromise;
  }

  async retry(options: Omit<InitializeOptions, 'force'> = {}): Promise<InitializationSnapshot> {
    this.retryCount += 1;
    return this.initialize({ ...options, force: true });
  }

  continueOffline(): InitializationSnapshot {
    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }
    this.activePromise = null;
    const runId = ++this.activeRunId;
    const now = Date.now();
    this.snapshot = {
      ...this.snapshot,
      runId,
      state: InitializationState.OFFLINE_INITIALIZATION,
      progress: 100,
      message: INITIALIZATION_STATE_MESSAGES[InitializationState.OFFLINE_INITIALIZATION],
      isReady: true,
      isFailed: false,
      isTimeout: false,
      isOffline: true,
      canRetry: true,
      error: null,
      diagnostics: {
        ...this.snapshot.diagnostics,
        runId,
        isOffline: true,
        completedAtMs: now,
        durationMs: Math.max(0, now - this.snapshot.diagnostics.startedAtMs),
        activeTasks: [],
      },
    };
    this.emit();
    return this.snapshot;
  }

  cancel(): void {
    if (!this.activeController) return;
    const cancelledRunId = this.activeRunId;
    this.activeController.abort();
    this.activeController = null;
    this.activePromise = null;

    if (cancelledRunId === this.activeRunId && !this.snapshot.isReady) {
      const err = normalizeInitializationError(
        new AppInitializationError({
          code: 'CANCELLED',
          title: 'Initialization Cancelled',
          message: 'Startup was cancelled before completion. Retry to continue.',
          recoverable: true,
        })
      );
      this.snapshot = {
        ...this.snapshot,
        state: InitializationState.INITIALIZATION_FAILED,
        isReady: false,
        isFailed: true,
        isTimeout: false,
        canRetry: true,
        error: err,
        message: err.title,
      };
      this.emit();
    }
  }

  private async executeRun(
    runId: number,
    signal: AbortSignal,
    options: InitializeOptions
  ): Promise<InitializationSnapshot> {
    let currentStep: InitializationStepId = 'config';

    const ensureActive = () => {
      if (signal.aborted || runId !== this.activeRunId) {
        throw new AppInitializationError({
          code: 'CANCELLED',
          title: 'Initialization Cancelled',
          message: 'Startup was superseded or cancelled.',
          step: currentStep,
          recoverable: true,
        });
      }
    };

    try {
      // 1. Load runtime configuration
      currentStep = 'config';
      this.transitionState(runId, InitializationState.LOADING_CONFIG);
      this.setStepStatus(runId, 'config', 'running');
      const config: InitializationConfig = await this.adapters.loadConfig(signal);
      ensureActive();
      this.setStepStatus(runId, 'config', 'completed', 'Configuration loaded');
      this.updateSnapshot(runId, (curr) => ({
        ...curr,
        diagnostics: { ...curr.diagnostics, configValid: true },
      }));

      const totalTimeoutMs =
        options.timeoutMs ?? config.totalTimeoutMs ?? this.defaultTimeoutMs;

      return await withTimeout(
        async (boundedSignal) => {
          const checkActive = () => {
            if (boundedSignal.aborted || signal.aborted || runId !== this.activeRunId) {
              throw new AppInitializationError({
                code: 'CANCELLED',
                title: 'Initialization Cancelled',
                message: 'Startup was interrupted before completion.',
                step: currentStep,
                recoverable: true,
              });
            }
          };

          // 2. Security checks
          currentStep = 'security';
          this.transitionState(runId, InitializationState.INITIALIZING_SECURITY);
          this.setStepStatus(runId, 'security', 'running');
          const secResult = await withTimeout(
            (s) => this.adapters.validateSecurityContext(config, s),
            config.stepTimeoutMs,
            { signal: boundedSignal, label: 'Security verification', step: 'security' }
          );
          checkActive();
          this.setStepStatus(runId, 'security', 'completed', secResult.detail);

          // 3. Concurrent independent local hydration: Cache/Theme + Network detection
          currentStep = 'cache';
          this.transitionState(runId, InitializationState.INITIALIZING_CACHE);
          this.setStepStatus(runId, 'cache', 'running');
          this.setStepStatus(runId, 'network', 'running');

          const [cacheResult, networkResult] = await Promise.all([
            this.adapters
              .restoreCacheAndTheme(config, boundedSignal)
              .then((res) => {
                this.setStepStatus(
                  runId,
                  'cache',
                  res.cacheReady ? 'completed' : 'skipped',
                  `Theme set to ${res.theme}`
                );
                return res;
              })
              .catch(() => {
                this.setStepStatus(
                  runId,
                  'cache',
                  'skipped',
                  'Using default in-memory preferences'
                );
                return { theme: config.initialTheme, cacheReady: false };
              }),
            this.adapters
              .detectNetwork(boundedSignal)
              .then((res) => {
                this.setStepStatus(
                  runId,
                  'network',
                  res.online ? 'completed' : 'offline',
                  res.online ? 'Online' : 'Offline'
                );
                return res;
              })
              .catch(() => {
                this.setStepStatus(runId, 'network', 'offline', 'Offline');
                return { online: false };
              }),
          ]);
          checkActive();
          void cacheResult;

          const isOffline = !networkResult.online;
          this.transitionState(
            runId,
            InitializationState.INITIALIZING_NETWORK,
            isOffline
              ? 'Offline detected — preparing cached experience...'
              : INITIALIZATION_STATE_MESSAGES[InitializationState.INITIALIZING_NETWORK]
          );
          this.updateSnapshot(runId, (curr) => ({
            ...curr,
            isOffline,
            diagnostics: { ...curr.diagnostics, isOffline },
          }));

          // 4. Core SDK verification
          currentStep = 'sdks';
          this.transitionState(runId, InitializationState.INITIALIZING_SDKS);
          this.setStepStatus(runId, 'sdks', 'running');
          await withTimeout(
            (s) => this.adapters.initializeSdks(config, s),
            config.stepTimeoutMs,
            { signal: boundedSignal, label: 'Core SDK initialization', step: 'sdks' }
          );
          checkActive();
          this.setStepStatus(runId, 'sdks', 'completed', 'Platform SDKs ready');

          // 5. Auth & Session restoration
          currentStep = 'auth';
          this.transitionState(runId, InitializationState.INITIALIZING_AUTH);
          this.setStepStatus(runId, 'auth', 'running');
          this.setStepStatus(runId, 'session', 'running');
          this.transitionState(runId, InitializationState.RESTORING_SESSION);

          let authResult = { authRestored: false, hasAuthenticatedSession: false };
          try {
            authResult = await withTimeout(
              (s) => this.adapters.initializeAuthAndSession(config, s),
              config.stepTimeoutMs,
              {
                signal: boundedSignal,
                label: 'Session restoration',
                step: 'session',
              }
            );
            checkActive();
            this.setStepStatus(runId, 'auth', 'completed', 'Authentication ready');
            this.setStepStatus(
              runId,
              'session',
              authResult.authRestored ? 'completed' : 'skipped',
              authResult.hasAuthenticatedSession
                ? 'Active session restored'
                : 'Ready for sign in'
            );
          } catch (err) {
            if (isOffline) {
              this.setStepStatus(runId, 'auth', 'offline', 'Offline auth mode');
              this.setStepStatus(runId, 'session', 'offline', 'Using local cache');
              this.addWarning(runId, 'Authentication check deferred while offline.');
            } else {
              this.setStepStatus(runId, 'auth', 'failed');
              this.setStepStatus(runId, 'session', 'failed');
              throw err;
            }
          }

          this.updateSnapshot(runId, (curr) => ({
            ...curr,
            diagnostics: {
              ...curr.diagnostics,
              authRestored: authResult.authRestored,
              hasAuthenticatedSession: authResult.hasAuthenticatedSession,
            },
          }));

          // 6. Concurrent independent subsystem checks (Database + Storage/Calls + Non-blocking Notifications)
          currentStep = 'database';
          this.transitionState(runId, InitializationState.INITIALIZING_DATABASE);
          this.setStepStatus(runId, 'database', 'running');
          this.setStepStatus(runId, 'storage', 'running');
          this.setStepStatus(runId, 'notifications', 'running');

          // Optional push notifications are non-blocking: never delay or fail startup
          const notificationsPromise = Promise.resolve()
            .then(() =>
              withTimeout(
                (s) => this.adapters.initializeNotifications(s),
                Math.min(1000, config.probeTimeoutMs),
                {
                  signal: boundedSignal,
                  label: 'Notification setup',
                  step: 'notifications',
                }
              )
            )
            .then((notifRes) => {
              this.setStepStatus(
                runId,
                'notifications',
                notifRes.warning ? 'skipped' : 'completed',
                `Permission: ${notifRes.permission}`
              );
              if (notifRes.warning) {
                this.addWarning(runId, notifRes.warning);
              }
              this.updateSnapshot(runId, (curr) => ({
                ...curr,
                diagnostics: { ...curr.diagnostics, notificationsReady: !notifRes.warning },
              }));
            })
            .catch(() => {
              this.setStepStatus(
                runId,
                'notifications',
                'skipped',
                'Push notifications skipped'
              );
              this.addWarning(runId, 'Push notification setup was skipped.');
            });

          const databasePromise = withTimeout(
            (s) => this.adapters.initializeDatabase(config, isOffline, s),
            config.probeTimeoutMs,
            {
              signal: boundedSignal,
              label: 'Database connection',
              step: 'database',
            }
          )
            .then((dbRes) => {
              this.setStepStatus(
                runId,
                'database',
                isOffline ? 'offline' : dbRes.ready ? 'completed' : 'skipped',
                dbRes.detail
              );
              this.updateSnapshot(runId, (curr) => ({
                ...curr,
                diagnostics: { ...curr.diagnostics, databaseReady: dbRes.ready },
              }));
              return dbRes;
            })
            .catch((err) => {
              if (err instanceof AppInitializationError && !err.recoverable) {
                throw err;
              }
              this.setStepStatus(
                runId,
                'database',
                isOffline ? 'offline' : 'skipped',
                'Continuing with local cache'
              );
              this.addWarning(runId, 'Database probe timed out; local cache active.');
              return { ready: false };
            });

          const storagePromise = withTimeout(
            (s) => this.adapters.initializeStorageAndCalls(config, isOffline, s),
            config.probeTimeoutMs,
            {
              signal: boundedSignal,
              label: 'Media & calling services',
              step: 'storage',
            }
          )
            .then((stRes) => {
              this.transitionState(runId, InitializationState.INITIALIZING_STORAGE);
              this.setStepStatus(
                runId,
                'storage',
                isOffline ? 'offline' : 'completed',
                stRes.detail
              );
              this.updateSnapshot(runId, (curr) => ({
                ...curr,
                diagnostics: {
                  ...curr.diagnostics,
                  storageConfigured: stRes.storageConfigured,
                  callsConfigured: stRes.callsConfigured,
                },
              }));
              return stRes;
            })
            .catch((err) => {
              if (err instanceof AppInitializationError && !err.recoverable) {
                throw err;
              }
              this.setStepStatus(
                runId,
                'storage',
                isOffline ? 'offline' : 'skipped',
                'Service status deferred'
              );
              this.addWarning(runId, 'Media endpoint status probe deferred.');
              return { storageConfigured: false, callsConfigured: false };
            });

          await Promise.all([databasePromise, storagePromise]);
          // Ensure notifications settled or let them complete immediately without failing
          void notificationsPromise;
          checkActive();

          // 7. Router preparation
          currentStep = 'router';
          this.transitionState(runId, InitializationState.INITIALIZING_ROUTER);
          this.setStepStatus(runId, 'router', 'running');
          const routerResult = await this.adapters.initializeRouter(config, boundedSignal);
          checkActive();
          this.setStepStatus(
            runId,
            'router',
            'completed',
            `Route target: ${routerResult.target}`
          );

          const finishedAt = Date.now();
          const finalState = isOffline
            ? InitializationState.OFFLINE_INITIALIZATION
            : InitializationState.INITIALIZATION_COMPLETE;

          this.updateSnapshot(runId, (curr) => ({
            ...curr,
            state: finalState,
            progress: 100,
            message: INITIALIZATION_STATE_MESSAGES[finalState],
            isReady: true,
            isFailed: false,
            isTimeout: false,
            isOffline,
            canRetry: false,
            error: null,
            diagnostics: {
              ...curr.diagnostics,
              routerTarget: routerResult.target,
              completedAtMs: finishedAt,
              durationMs: Math.max(0, finishedAt - curr.diagnostics.startedAtMs),
              activeTasks: [],
            },
          }));

          return this.snapshot;
        },
        totalTimeoutMs,
        {
          signal,
          label: 'Application initialization',
          step: currentStep,
        }
      );
    } catch (err) {
      if (runId !== this.activeRunId) {
        return this.snapshot;
      }

      const normalized = normalizeInitializationError(err, currentStep);
      const isTimeout = normalized.code === 'TIMEOUT';
      const failedState = isTimeout
        ? InitializationState.INITIALIZATION_TIMEOUT
        : InitializationState.INITIALIZATION_FAILED;

      if (normalized.step) {
        this.setStepStatus(runId, normalized.step, 'failed', normalized.message);
      }

      const finishedAt = Date.now();
      this.updateSnapshot(runId, (curr) => ({
        ...curr,
        state: failedState,
        progress: curr.progress,
        message: normalized.title,
        isReady: false,
        isFailed: !isTimeout,
        isTimeout,
        canRetry: normalized.recoverable,
        error: normalized,
        diagnostics: {
          ...curr.diagnostics,
          completedAtMs: finishedAt,
          durationMs: Math.max(0, finishedAt - curr.diagnostics.startedAtMs),
          activeTasks: [],
        },
      }));

      return this.snapshot;
    }
  }
}

let singletonManager: InitializationManager | null = null;

export function getInitializationManager(): InitializationManager {
  if (!singletonManager) {
    singletonManager = new InitializationManager();
  }
  return singletonManager;
}

export function resetInitializationManagerForTests(): void {
  singletonManager?.cancel();
  singletonManager = null;
}
