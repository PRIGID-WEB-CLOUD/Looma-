import { useState, useEffect } from 'react';
import { LandingPageView } from './LandingPageView';
import { readStoredThemePreference } from '../src/app/initialization/initialization-config';
import type { ThemeMode } from '../src/types/social';
import type { AccessInquiry } from './landingData';

export default function LandingPageApp() {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredThemePreference());

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('looma_theme_v1', JSON.stringify(theme));
    } catch {
      // Ignore
    }
  }, [theme]);

  const handleSetTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
  };

  const resolveTargetUrl = (targetPath: string) => {
    if (typeof window === 'undefined') return targetPath;
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '0.0.0.0';
    if (isLocal) {
      return targetPath;
    }
    return `https://looma.prigidcollection.workers.dev${targetPath}`;
  };

  const handleNavigateToAuth = (mode?: 'signin' | 'signup') => {
    const q = mode === 'signup' ? '?auth=signup' : '';
    window.location.href = resolveTargetUrl(`/auth${q}`);
  };

  const handleNavigateToProtectedPath = (path: '/feed' | '/messages' | '/settings' | '/admin') => {
    window.location.href = resolveTargetUrl(path);
  };

  const handleOpenLegal = (docId: string) => {
    window.location.href = `/legal/${docId}`;
  };

  const handleSubmitAccessInquiry = (inquiry: AccessInquiry) => {
    try {
      const existing = JSON.parse(localStorage.getItem('looma_admin_inquiries_v1') || '[]');
      existing.unshift(inquiry);
      localStorage.setItem('looma_admin_inquiries_v1', JSON.stringify(existing));
    } catch {
      // Ignore
    }
  };

  return (
    <LandingPageView
      theme={theme}
      isAuthorized={false}
      isAdmin={false}
      onSetTheme={handleSetTheme}
      onNavigateToAuth={handleNavigateToAuth}
      onNavigateToProtectedPath={handleNavigateToProtectedPath}
      onOpenLegal={handleOpenLegal}
      onSubmitAccessInquiry={handleSubmitAccessInquiry}
    />
  );
}
