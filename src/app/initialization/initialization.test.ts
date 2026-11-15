import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_INITIALIZATION_STATES,
  AppInitializationError,
  InitializationManager,
  InitializationState,
  normalizeInitializationError,
  sanitizeInitializationMessage,
  validatePublicFirebaseConfig,
  withTimeout,
  type InitializationAdapters,
  type InitializationConfig,
} from './index';

function makeTestConfig(
  overrides: Partial<InitializationConfig> = {}
): InitializationConfig {
  return {
    appName: 'Looma',
    totalTimeoutMs: 5_000,
    stepTimeoutMs: 2_000,
    probeTimeoutMs: 1_500,
    isAutostart: false,
    initialTheme: 'light',
    initialSearch: '',
    firebaseConfigured: true,
    firebaseProjectId: 'test-project',
    ...overrides,
  };
}

function makeFakeAdapters(
  overrides: Partial<InitializationAdapters> = {}
): InitializationAdapters {
  return {
    loadConfig: async () => makeTestConfig(),
    validateSecurityContext: async () => ({
      secure: true,
      detail: 'Verified HTTPS origin',
    }),
    restoreCacheAndTheme: async (cfg) => ({
      theme: cfg.initialTheme,
      cacheReady: true,
    }),
    detectNetwork: async () => ({ online: true }),
    initializeSdks: async () => ({ ready: true }),
    initializeAuthAndSession: async () => ({
      authRestored: true,
      hasAuthenticatedSession: true,
    }),
    initializeDatabase: async () => ({
      ready: true,
      detail: 'Firestore ready',
    }),
    initializeStorageAndCalls: async () => ({
      storageConfigured: true,
      callsConfigured: true,
      detail: 'R2 & Calls ready',
    }),
    initializeNotifications: async () => ({ permission: 'granted' }),
    initializeRouter: async () => ({ target: 'feed' }),
    ...overrides,
  };
}

test('all 15 initialization states are defined and valid', () => {
  assert.equal(ALL_INITIALIZATION_STATES.length, 15);
  const expected = [
    'INITIALIZING',
    'LOADING_CONFIG',
    'INITIALIZING_SDKS',
    'INITIALIZING_AUTH',
    'RESTORING_SESSION',
    'INITIALIZING_DATABASE',
    'INITIALIZING_STORAGE',
    'INITIALIZING_CACHE',
    'INITIALIZING_NETWORK',
    'INITIALIZING_SECURITY',
    'INITIALIZING_ROUTER',
    'INITIALIZATION_COMPLETE',
    'INITIALIZATION_FAILED',
    'INITIALIZATION_TIMEOUT',
    'OFFLINE_INITIALIZATION',
  ];
  for (const name of expected) {
    assert.ok(
      ALL_INITIALIZATION_STATES.includes(name as InitializationState),
      `Missing initialization state: ${name}`
    );
  }
});

test('InitializationManager runs full startup sequence to INITIALIZATION_COMPLETE', async () => {
  const seenStates: InitializationState[] = [];
  const manager = new InitializationManager({
    adapters: makeFakeAdapters(),
  });
  const unsub = manager.subscribe((snap) => {
    if (seenStates[seenStates.length - 1] !== snap.state) {
      seenStates.push(snap.state);
    }
  });

  const result = await manager.initialize();
  unsub();

  assert.equal(result.state, InitializationState.INITIALIZATION_COMPLETE);
  assert.equal(result.isReady, true);
  assert.equal(result.isFailed, false);
  assert.equal(result.isTimeout, false);
  assert.equal(result.isOffline, false);
  assert.equal(result.progress, 100);
  assert.equal(result.diagnostics.configValid, true);
  assert.equal(result.diagnostics.authRestored, true);
  assert.equal(result.diagnostics.databaseReady, true);
  assert.equal(result.diagnostics.storageConfigured, true);
  assert.equal(result.diagnostics.callsConfigured, true);
  assert.equal(result.diagnostics.routerTarget, 'feed');
  assert.ok(seenStates.includes(InitializationState.LOADING_CONFIG));
  assert.ok(seenStates.includes(InitializationState.INITIALIZING_SECURITY));
  assert.ok(seenStates.includes(InitializationState.INITIALIZING_CACHE));
  assert.ok(seenStates.includes(InitializationState.INITIALIZING_SDKS));
  assert.ok(seenStates.includes(InitializationState.RESTORING_SESSION));
  assert.ok(seenStates.includes(InitializationState.INITIALIZING_DATABASE));
  assert.ok(seenStates.includes(InitializationState.INITIALIZING_ROUTER));
});

test('independent database and storage initialization tasks run concurrently and optional notification failure is non-blocking', async () => {
  const startedOrder: string[] = [];
  let releaseBarrier: (() => void) | null = null;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  const manager = new InitializationManager({
    adapters: makeFakeAdapters({
      initializeDatabase: async () => {
        startedOrder.push('db:start');
        await barrier;
        return { ready: true };
      },
      initializeStorageAndCalls: async () => {
        startedOrder.push('storage:start');
        // Resolve the shared barrier only if both tasks started concurrently!
        releaseBarrier?.();
        return { storageConfigured: true, callsConfigured: false };
      },
      initializeNotifications: async () => {
        throw new Error('Notification API blocked');
      },
    }),
  });

  const result = await manager.initialize();
  assert.equal(result.state, InitializationState.INITIALIZATION_COMPLETE);
  assert.equal(result.isReady, true);
  assert.deepEqual(startedOrder, ['db:start', 'storage:start']);
  assert.equal(result.steps.notifications.status, 'skipped');
  assert.ok(result.diagnostics.warnings.length > 0);
});

test('duplicate concurrent initialize() calls reuse the in-flight promise and never re-run finished setup', async () => {
  let configCalls = 0;
  const manager = new InitializationManager({
    adapters: makeFakeAdapters({
      loadConfig: async () => {
        configCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return makeTestConfig();
      },
    }),
  });

  const [first, second] = await Promise.all([
    manager.initialize(),
    manager.initialize(),
  ]);
  assert.equal(configCalls, 1);
  assert.equal(first.runId, second.runId);
  assert.equal(first.state, InitializationState.INITIALIZATION_COMPLETE);

  const third = await manager.initialize();
  assert.equal(configCalls, 1);
  assert.equal(third.runId, first.runId);
});

test('timeout triggers INITIALIZATION_TIMEOUT and retry() recovers cleanly without stale race overwrites', async () => {
  let attempt = 0;
  const manager = new InitializationManager({
    adapters: makeFakeAdapters({
      loadConfig: async () => makeTestConfig({ totalTimeoutMs: 40, stepTimeoutMs: 40 }),
      initializeAuthAndSession: async (_cfg, signal) => {
        attempt += 1;
        if (attempt === 1) {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, 250);
            signal.addEventListener(
              'abort',
              () => {
                clearTimeout(t);
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
          });
        }
        return { authRestored: true, hasAuthenticatedSession: true };
      },
    }),
  });

  const timedOut = await manager.initialize();
  assert.equal(timedOut.state, InitializationState.INITIALIZATION_TIMEOUT);
  assert.equal(timedOut.isTimeout, true);
  assert.equal(timedOut.isFailed, false);
  assert.equal(timedOut.canRetry, true);

  const recovered = await manager.retry();
  assert.equal(recovered.state, InitializationState.INITIALIZATION_COMPLETE);
  assert.equal(recovered.isReady, true);
  assert.equal(recovered.retryCount, 1);
});

test('fatal error transitions to INITIALIZATION_FAILED and sanitizes stack traces and secrets', async () => {
  const manager = new InitializationManager({
    adapters: makeFakeAdapters({
      validateSecurityContext: async () => {
        throw new Error(
          'Bearer eyJhbGciOiJIUzI1NiJ9.secret CLOUDFLARE_TURN_KEY_TOKEN=abc\n    at Object.<anonymous> (/src/worker.ts:10:5)'
        );
      },
    }),
  });

  const failed = await manager.initialize();
  assert.equal(failed.state, InitializationState.INITIALIZATION_FAILED);
  assert.equal(failed.isFailed, true);
  assert.equal(failed.isReady, false);
  assert.equal(failed.canRetry, true);
  assert.ok(failed.error);
  assert.ok(!failed.error!.message.includes('eyJhbGci'));
  assert.ok(!failed.error!.message.includes('CLOUDFLARE_TURN_KEY_TOKEN'));
  assert.ok(!failed.error!.message.includes('/src/worker.ts'));

  assert.equal(
    sanitizeInitializationMessage('AIzaSySecretKey12345678901234567890'),
    'An unexpected error occurred while starting Looma. Please try again.'
  );
  const normalized = normalizeInitializationError(
    new AppInitializationError({
      code: 'CONFIG_INVALID',
      title: 'Config Error',
      message: 'Missing configuration',
      step: 'config',
    })
  );
  assert.equal(normalized.code, 'CONFIG_INVALID');
  assert.equal(normalized.step, 'config');
});

test('offline startup completes in OFFLINE_INITIALIZATION mode and skips network probes cleanly', async () => {
  let dbReceivedOfflineFlag = false;
  let storageReceivedOfflineFlag = false;

  const manager = new InitializationManager({
    adapters: makeFakeAdapters({
      detectNetwork: async () => ({ online: false }),
      initializeDatabase: async (_cfg, isOffline) => {
        dbReceivedOfflineFlag = isOffline;
        return { ready: false, detail: 'Offline cache' };
      },
      initializeStorageAndCalls: async (_cfg, isOffline) => {
        storageReceivedOfflineFlag = isOffline;
        return { storageConfigured: false, callsConfigured: false };
      },
    }),
  });

  const res = await manager.initialize();
  assert.equal(res.state, InitializationState.OFFLINE_INITIALIZATION);
  assert.equal(res.isReady, true);
  assert.equal(res.isOffline, true);
  assert.equal(dbReceivedOfflineFlag, true);
  assert.equal(storageReceivedOfflineFlag, true);
  assert.equal(res.steps.network.status, 'offline');
});

test('cancel() aborts an in-flight startup and continueOffline() recovers cleanly', async () => {
  const manager = new InitializationManager({
    adapters: makeFakeAdapters({
      initializeAuthAndSession: async (_cfg, signal) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 200);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true }
          );
        });
        return { authRestored: true, hasAuthenticatedSession: false };
      },
    }),
  });

  const pending = manager.initialize();
  await new Promise((r) => setTimeout(r, 15));
  manager.cancel();
  const afterCancel = await pending;
  assert.equal(afterCancel.state, InitializationState.INITIALIZATION_FAILED);
  assert.equal(afterCancel.canRetry, true);

  const offlineSnap = manager.continueOffline();
  assert.equal(offlineSnap.state, InitializationState.OFFLINE_INITIALIZATION);
  assert.equal(offlineSnap.isReady, true);
  assert.equal(offlineSnap.isOffline, true);
});

test('validatePublicFirebaseConfig and withTimeout helper enforce invariants cleanly', async () => {
  assert.equal(validatePublicFirebaseConfig(null).valid, false);
  assert.equal(
    validatePublicFirebaseConfig({ projectId: 'p', appId: 'a', apiKey: 'k' }).valid,
    true
  );

  const ok = await withTimeout(async () => 'done', 500, { label: 'fast check' });
  assert.equal(ok, 'done');

  await assert.rejects(
    () =>
      withTimeout(
        () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200)),
        25,
        { label: 'slow check', step: 'database' }
      ),
    (err: unknown) =>
      err instanceof AppInitializationError &&
      err.code === 'TIMEOUT' &&
      err.step === 'database'
  );
});
