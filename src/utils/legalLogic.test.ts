import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiveGuidelinesDocument,
  buildLiveLegalDocument,
  createTermsConsentRecord,
  formatLegalDocumentSectionsAsText,
  getLegalRoutePath,
  hasRequiredAccountConsent,
  isConsentRecordValid,
  LEGAL_DOCUMENTS,
  parseLegalRoute,
  TERMS_VERSION,
  validateAccountCreationConsent,
} from './legalLogic';

test('parseLegalRoute resolves direct paths and query parameters cleanly', () => {
  assert.equal(parseLegalRoute('/terms'), 'terms');
  assert.equal(parseLegalRoute('/terms/'), 'terms');
  assert.equal(parseLegalRoute('/terms-and-conditions'), 'terms');
  assert.equal(parseLegalRoute('/privacy'), 'privacy');
  assert.equal(parseLegalRoute('/privacy-policy'), 'privacy');
  assert.equal(parseLegalRoute('/guidelines'), 'guidelines');
  assert.equal(parseLegalRoute('/', '?legal=terms'), 'terms');
  assert.equal(parseLegalRoute('/', '?legal=privacy'), 'privacy');
  assert.equal(parseLegalRoute('/', '?autostart=1'), null);
  assert.equal(parseLegalRoute('/feed'), null);
});

test('getLegalRoutePath maps legal doc IDs to canonical paths', () => {
  assert.equal(getLegalRoutePath('terms'), '/terms');
  assert.equal(getLegalRoutePath('privacy'), '/privacy');
  assert.equal(getLegalRoutePath('guidelines'), '/guidelines');
});

test('LEGAL_DOCUMENTS includes complete sections for terms, privacy, and guidelines', () => {
  assert.ok(LEGAL_DOCUMENTS.terms.sections.length >= 5);
  assert.ok(LEGAL_DOCUMENTS.privacy.sections.length >= 4);
  assert.ok(LEGAL_DOCUMENTS.guidelines.sections.length >= 3);
  assert.equal(LEGAL_DOCUMENTS.terms.version, TERMS_VERSION);
});

test('validateAccountCreationConsent forces both checkboxes during email and OAuth account creation', () => {
  for (const authMethod of ['email', 'google', 'apple'] as const) {
    const neither = validateAccountCreationConsent({
      mode: 'signup',
      authMethod,
      consent: { termsAccepted: false, privacyAccepted: false },
    });
    assert.equal(neither.allowed, false);
    assert.ok(neither.error?.includes('Terms & Conditions'));

    const missingPrivacy = validateAccountCreationConsent({
      mode: 'signup',
      authMethod,
      consent: { termsAccepted: true, privacyAccepted: false },
    });
    assert.equal(missingPrivacy.allowed, false);
    assert.ok(missingPrivacy.error?.includes('Privacy Policy'));

    const missingTerms = validateAccountCreationConsent({
      mode: 'signup',
      authMethod,
      consent: { termsAccepted: false, privacyAccepted: true },
    });
    assert.equal(missingTerms.allowed, false);
    assert.ok(missingTerms.error?.includes('Terms & Conditions'));

    const bothChecked = validateAccountCreationConsent({
      mode: 'signup',
      authMethod,
      consent: { termsAccepted: true, privacyAccepted: true },
    });
    assert.equal(bothChecked.allowed, true);
    assert.equal(bothChecked.error, null);
  }
});

test('validateAccountCreationConsent allows returning sign-in without blocking', () => {
  for (const authMethod of ['email', 'google', 'apple'] as const) {
    const res = validateAccountCreationConsent({
      mode: 'signin',
      authMethod,
      consent: { termsAccepted: false, privacyAccepted: false },
    });
    assert.equal(res.allowed, true);
    assert.equal(res.error, null);
  }
});

test('hasRequiredAccountConsent and consent records validate accurately', () => {
  assert.equal(
    hasRequiredAccountConsent({ termsAccepted: true, privacyAccepted: true }),
    true
  );
  assert.equal(
    hasRequiredAccountConsent({ termsAccepted: true, privacyAccepted: false }),
    false
  );

  const record = createTermsConsentRecord('google', 1763240000000);
  assert.equal(isConsentRecordValid(record), true);
  assert.equal(
    isConsentRecordValid({ ...record, termsAccepted: false }),
    false
  );
  assert.equal(
    isConsentRecordValid({ ...record, version: '2020-01-01' }),
    false
  );
  assert.equal(isConsentRecordValid(null), false);
});

test('buildLiveGuidelinesDocument and buildLiveLegalDocument parse dynamic rules blocks across terms and privacy', () => {
  const fallback = buildLiveGuidelinesDocument(null);
  assert.equal(fallback.version, LEGAL_DOCUMENTS.guidelines.version);

  const dynamicDoc = buildLiveGuidelinesDocument({
    version: '2026.2',
    summary: 'Updated studio community expectations.',
    rulesText:
      '1. Original Work Only\nShare authentic architecture and photography.\n- Credit collaborators\n\n2. Zero Spam\nNo automated promotions.',
    updatedAtMs: 1763240000000,
  });

  assert.equal(dynamicDoc.version, '2026.2');
  assert.equal(dynamicDoc.summary, 'Updated studio community expectations.');
  assert.equal(dynamicDoc.sections.length, 2);
  assert.equal(dynamicDoc.sections[0].title, 'Original Work Only');
  assert.deepEqual(dynamicDoc.sections[0].bullets, ['Credit collaborators']);
  assert.equal(dynamicDoc.sections[1].title, 'Zero Spam');

  const termsText = formatLegalDocumentSectionsAsText('terms');
  assert.ok(termsText.includes('Acceptance of Terms & Eligibility'));

  const liveTerms = buildLiveLegalDocument('terms', {
    version: '2026-12-01',
    summary: 'Updated commercial licensing and messaging rules.',
    rulesText:
      '1. Account Eligibility\nVerified email required.\n\n2. Data Ownership\nCreators retain copyright.',
    updatedAtMs: 1764547200000,
  });
  assert.equal(liveTerms.id, 'terms');
  assert.equal(liveTerms.version, '2026-12-01');
  assert.equal(liveTerms.sections[0].id, 'terms-1');
  assert.equal(liveTerms.sections[1].title, 'Data Ownership');

  const livePrivacy = buildLiveLegalDocument('privacy', {
    version: '2026-12-05',
    summary: 'Updated Cloudflare R2 and telemetry retention schedule.',
    rulesText: '1. Media Isolation\nUploaded objects remain scoped by UID.',
    updatedAtMs: 1764892800000,
  });
  assert.equal(livePrivacy.id, 'privacy');
  assert.equal(livePrivacy.sections[0].id, 'privacy-1');
});

