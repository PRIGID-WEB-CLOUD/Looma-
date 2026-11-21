import type { PlatformMode } from '../types/business';

export function buildScopedCacheKey(
  platformMode: PlatformMode,
  activeProfileId: string,
  namespace: string,
  key: string
): string {
  const safeProfileId = (activeProfileId || '').trim() || 'anonymous';
  const safeNamespace = (namespace || 'default').trim();
  const safeKey = (key || 'item').trim();
  return `${platformMode}:${safeProfileId}:${safeNamespace}:${safeKey}`;
}
