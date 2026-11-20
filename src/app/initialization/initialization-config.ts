import firebaseConfig from '../../../firebase-applet-config.json';
import type { ThemeMode } from '../../types/social';
import { canUseAutostart } from '../../utils/socialLogic';
import { AppInitializationError } from './initialization-errors';

export interface InitializationConfig {
  appName: string;
  totalTimeoutMs: number;
  stepTimeoutMs: number;
  probeTimeoutMs: number;
  isAutostart: boolean;
  initialTheme: ThemeMode;
  initialSearch: string;
  firebaseConfigured: boolean;
  firebaseProjectId: string | null;
}

export const DEFAULT_INITIALIZATION_TIMEOUT_MS = 30_000;
export const DEFAULT_STEP_TIMEOUT_MS = 20_000;
export const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

const THEME_STORAGE_KEY = 'looma_theme_v1';

export function readStoredThemePreference(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === 'dark' || parsed === 'light') {
        return parsed;
      }
    }
  } catch {
    // Ignore storage read errors safely
  }
  try {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Ignore matchMedia errors
  }
  return 'light';
}

export function validatePublicFirebaseConfig(
  candidate: Record<string, unknown> | null | undefined
): { valid: boolean; projectId: string | null; reason?: string } {
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, projectId: null, reason: 'Missing Firebase configuration.' };
  }
  const projectId =
    typeof candidate.projectId === 'string' ? candidate.projectId.trim() : '';
  const appId = typeof candidate.appId === 'string' ? candidate.appId.trim() : '';
  const apiKey = typeof candidate.apiKey === 'string' ? candidate.apiKey.trim() : '';

  if (!projectId || !appId || !apiKey) {
    return {
      valid: false,
      projectId: projectId || null,
      reason: 'Required client Firebase identifiers are missing.',
    };
  }
  return { valid: true, projectId };
}

export async function loadRuntimeInitializationConfig(
  overrides: Partial<InitializationConfig> = {}
): Promise<InitializationConfig> {
  const search =
    overrides.initialSearch ??
    (typeof window !== 'undefined' ? window.location.search : '');
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '';

  const firebaseCheck = validatePublicFirebaseConfig(
    firebaseConfig as unknown as Record<string, unknown>
  );

  const isAutostart =
    overrides.isAutostart ?? (search ? canUseAutostart(search, hostname) : false);

  const firebaseConfigured = overrides.firebaseConfigured ?? firebaseCheck.valid;
  if (!firebaseConfigured && !isAutostart) {
    throw new AppInitializationError({
      code: 'CONFIG_INVALID',
      title: 'Configuration Incomplete',
      message:
        firebaseCheck.reason ||
        'Application runtime configuration could not be verified.',
      step: 'config',
      recoverable: true,
    });
  }

  return {
    appName: overrides.appName ?? 'Looma',
    totalTimeoutMs:
      overrides.totalTimeoutMs ?? DEFAULT_INITIALIZATION_TIMEOUT_MS,
    stepTimeoutMs: overrides.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
    probeTimeoutMs: overrides.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
    isAutostart,
    initialTheme: overrides.initialTheme ?? readStoredThemePreference(),
    initialSearch: search,
    firebaseConfigured,
    firebaseProjectId:
      overrides.firebaseProjectId ?? firebaseCheck.projectId,
  };
}
