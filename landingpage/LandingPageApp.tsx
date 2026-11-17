import { useState, useEffect } from 'react';
import { LandingPageView } from './LandingPageView';
import { LegalDocumentView } from '../src/components/LegalDocumentView';
import { readStoredThemePreference } from '../src/app/initialization/initialization-config';
import type { ThemeMode } from '../src/types/social';
import type { LegalDocId } from '../src/utils/legalLogic';
import type { AccessInquiry } from './landingData';

export interface LandingPageAppProps {
  embedded?: boolean;
  isAuthorized?: boolean;
  isAdmin?: boolean;
  userDisplayName?: string;
  onNavigateToPath?: (path: string) => void;
  onOpenLegal?: (docId: LegalDocId) => void;
}

export default function LandingPageApp({
  embedded = false,
  isAuthorized = false,
  isAdmin = false,
  userDisplayName,
  onNavigateToPath,
  onOpenLegal,
}: LandingPageAppProps) {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredThemePreference());
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocId | null>(null);

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

  const navigateTo = (targetPath: string) => {
    if (typeof window === 'undefined') return;
    const currentParams = new URLSearchParams(window.location.search);
    const hasAutostart = currentParams.get('autostart') === '1';
    const url = new URL(targetPath, window.location.origin);
    if (hasAutostart && !url.searchParams.has('autostart')) {
      url.searchParams.set('autostart', '1');
    }
    const finalRelPath = `${url.pathname}${url.search}`;

    if (embedded) {
      if (onNavigateToPath) {
        onNavigateToPath(finalRelPath);
      } else {
        window.history.pushState({}, '', finalRelPath);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      return;
    }

    const host = window.location.hostname;
    const isDedicatedLandingWorker =
      host.includes('looma-landing.') || host.startsWith('landing.');

    if (isDedicatedLandingWorker) {
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        window.location.href = 'https://looma-admin.prigidcollection.workers.dev/';
        return;
      }
      window.location.href = `https://looma.prigidcollection.workers.dev${finalRelPath}`;
      return;
    }

    window.location.href = finalRelPath;
  };

  const handleNavigateToAuth = (mode?: 'signin' | 'signup') => {
    navigateTo(mode === 'signup' ? '/auth?mode=signup' : '/auth');
  };

  const handleNavigateToProtectedPath = (path: '/feed' | '/messages' | '/settings' | '/admin') => {
    navigateTo(path === '/admin' ? '/admin/' : path);
  };

  const handleOpenLegal = (docId: LegalDocId) => {
    if (onOpenLegal) {
      onOpenLegal(docId);
      return;
    }
    setActiveLegalDoc(docId);
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

  if (activeLegalDoc) {
    return (
      <LegalDocumentView
        activeDocId={activeLegalDoc}
        theme={theme}
        onSelectDoc={setActiveLegalDoc}
        onSetTheme={handleSetTheme}
        onBack={() => setActiveLegalDoc(null)}
      />
    );
  }

  return (
    <LandingPageView
      theme={theme}
      isAuthorized={isAuthorized}
      isAdmin={isAdmin}
      userDisplayName={userDisplayName}
      onSetTheme={handleSetTheme}
      onNavigateToAuth={handleNavigateToAuth}
      onNavigateToProtectedPath={handleNavigateToProtectedPath}
      onOpenLegal={handleOpenLegal}
      onSubmitAccessInquiry={handleSubmitAccessInquiry}
    />
  );
}
