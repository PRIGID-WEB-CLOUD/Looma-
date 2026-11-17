import { useState, useEffect } from 'react';
import { LandingPageView } from './LandingPageView';
import { LegalDocumentView } from '../src/components/LegalDocumentView';
import { readStoredThemePreference } from '../src/app/initialization/initialization-config';
import type { ThemeMode } from '../src/types/social';
import type { LegalDocId } from '../src/utils/legalLogic';
import type { AccessInquiry } from './landingData';

export interface LandingPageAppProps {
  embedded?: boolean;
  onOpenLegal?: (docId: LegalDocId) => void;
}

export default function LandingPageApp({
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
      onSetTheme={handleSetTheme}
      onOpenLegal={handleOpenLegal}
      onSubmitAccessInquiry={handleSubmitAccessInquiry}
    />
  );
}
