import { useContext } from 'react';
import {
  InitializationContext,
  type InitializationContextValue,
} from './initialization-context';

export function useInitialization(): InitializationContextValue {
  return useContext(InitializationContext);
}
