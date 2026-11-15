import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccessInquiryRecord,
  LANDING_CAPABILITIES,
  PROTECTED_WORKSPACE_BOUNDARIES,
  validateAccessInquiry,
} from './landingData';

test('landing capabilities and protected workspace boundaries cover feed, messages, settings, and admin', () => {
  const capabilityTargets = new Set(LANDING_CAPABILITIES.map((c) => c.protectedTarget));
  assert.equal(capabilityTargets.has('/feed'), true);
  assert.equal(capabilityTargets.has('/messages'), true);
  assert.equal(capabilityTargets.has('/settings'), true);
  assert.equal(capabilityTargets.has('/admin'), true);

  const boundaryTargets = new Set(PROTECTED_WORKSPACE_BOUNDARIES.map((b) => b.path));
  assert.equal(boundaryTargets.has('/feed'), true);
  assert.equal(boundaryTargets.has('/messages'), true);
  assert.equal(boundaryTargets.has('/settings'), true);
  assert.equal(boundaryTargets.has('/admin'), true);
});

test('validateAccessInquiry enforces name, email, and note constraints', () => {
  assert.equal(
    validateAccessInquiry({
      fullName: 'A',
      email: 'alex@studio.com',
      organization: 'Studio',
      note: 'Looking to join Looma workspace.',
    }).valid,
    false
  );

  assert.equal(
    validateAccessInquiry({
      fullName: 'Alex Rivera',
      email: 'not-an-email',
      organization: 'Studio',
      note: 'Looking to join Looma workspace.',
    }).valid,
    false
  );

  assert.equal(
    validateAccessInquiry({
      fullName: 'Alex Rivera',
      email: 'alex@studio.com',
      organization: 'Studio',
      note: 'Short',
    }).valid,
    false
  );

  assert.equal(
    validateAccessInquiry({
      fullName: 'Alex Rivera',
      email: 'alex@studio.com',
      organization: 'Rivera Architecture',
      note: 'Requesting member access for our architecture photography team.',
    }).valid,
    true
  );
});

test('createAccessInquiryRecord normalizes email and initializes pending status', () => {
  const record = createAccessInquiryRecord({
    fullName: '  Alex Rivera ',
    email: '  ALEX@RIVERA.STUDIO ',
    organization: '',
    note: 'Collaborating with four architectural photographers on Looma.',
    nowMs: 1700000000000,
  });

  assert.equal(record.fullName, 'Alex Rivera');
  assert.equal(record.email, 'alex@rivera.studio');
  assert.equal(record.organization, 'Independent Studio');
  assert.equal(record.status, 'pending');
  assert.equal(record.createdAtMs, 1700000000000);
});
