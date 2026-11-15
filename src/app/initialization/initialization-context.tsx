import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getInitializationManager,
  type InitializationManager,
} from './initialization-manager';
import {
  createInitialSnapshot,
  type InitializationSnapshot,
} from './initialization-state';

export interface InitializationContextValue {
  snapshot: InitializationSnapshot;
  initialize: (options?: { force?: boolean; timeoutMs?: number }) => Promise<InitializationSnapshot>;
  retry: () => Promise<InitializationSnapshot>;
  continueOffline: () => InitializationSnapshot;
  cancel: () => void;
}

const fallbackValue: InitializationContextValue = {
  snapshot: createInitialSnapshot(0, 0),
  initialize: async () => createInitialSnapshot(0, 0),
  retry: async () => createInitialSnapshot(0, 0),
  continueOffline: () => createInitialSnapshot(0, 0),
  cancel: () => {},
};

export const InitializationContext =
  createContext<InitializationContextValue>(fallbackValue);

interface InitializationProviderProps {
  children: ReactNode;
  manager?: InitializationManager;
  autoInitialize?: boolean;
}

export function InitializationProvider({
  children,
  manager,
  autoInitialize = true,
}: InitializationProviderProps) {
  const activeManager = useMemo(
    () => manager ?? getInitializationManager(),
    [manager]
  );

  const [snapshot, setSnapshot] = useState<InitializationSnapshot>(() =>
    activeManager.getSnapshot()
  );

  useEffect(() => {
    setSnapshot(activeManager.getSnapshot());
    const unsub = activeManager.subscribe((next) => {
      setSnapshot(next);
    });
    if (autoInitialize) {
      void activeManager.initialize();
    }
    return () => {
      unsub();
    };
  }, [activeManager, autoInitialize]);

  const initialize = useCallback(
    (options?: { force?: boolean; timeoutMs?: number }) =>
      activeManager.initialize(options),
    [activeManager]
  );

  const retry = useCallback(() => activeManager.retry(), [activeManager]);

  const continueOffline = useCallback(
    () => activeManager.continueOffline(),
    [activeManager]
  );

  const cancel = useCallback(() => activeManager.cancel(), [activeManager]);

  const value = useMemo<InitializationContextValue>(
    () => ({
      snapshot,
      initialize,
      retry,
      continueOffline,
      cancel,
    }),
    [snapshot, initialize, retry, continueOffline, cancel]
  );

  return (
    <InitializationContext.Provider value={value}>
      {children}
    </InitializationContext.Provider>
  );
}
