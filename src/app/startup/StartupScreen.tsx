import type { ReactNode } from 'react';
import { useInitialization } from '../initialization';
import { InitializationError } from './InitializationError';
import { InitializationScreen } from './InitializationScreen';

interface StartupScreenProps {
  children: ReactNode;
}

export function StartupScreen({ children }: StartupScreenProps) {
  const { snapshot, retry } = useInitialization();

  if (snapshot.isFailed || snapshot.isTimeout) {
    return (
      <InitializationError
        error={snapshot.error}
        isTimeout={snapshot.isTimeout}
        retryCount={snapshot.retryCount}
        onRetry={() => {
          void retry();
        }}
      />
    );
  }

  if (!snapshot.isReady) {
    return <InitializationScreen snapshot={snapshot} />;
  }

  return <div className="looma-stage-enter">{children}</div>;
}
