import type { ReactNode } from 'react';
import {
  InitializationProvider,
  type InitializationManager,
} from '../initialization';

interface AppProvidersProps {
  children: ReactNode;
  manager?: InitializationManager;
}

export function AppProviders({ children, manager }: AppProvidersProps) {
  return (
    <InitializationProvider manager={manager}>
      {children}
    </InitializationProvider>
  );
}
