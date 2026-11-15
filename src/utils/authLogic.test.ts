import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearJwkCacheForTests,
  InMemoryRateLimiter,
  resolveAllowedCorsOrigin,
  signScopedHmacToken,
  uint8ArrayToBase64Url,
  verifyFirebaseIdTokenCrypto,
  verifyScopedHmacToken,
} from './authLogic';

async function generateRsaTestKeyPair(kid: string = 'test-key-1') {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey & {
    kid?: string;
    alg?: string;
    use?: string;
  };
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  return { privateKey: pair.privateKey, publicJwk, kid };
}

async function signTestJwt(
  privateKey: CryptoKey,
  kid: string,
  payload: Record<string, unknown>
): Promise<string> {
  const headerB64 = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }))
  );
  const payloadB64 = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const input = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, input)
  );
  return `${headerB64}.${payloadB64}.${uint8ArrayToBase64Url(sig)}`;
}

test('verifyFirebaseIdTokenCrypto verifies valid RS256 signatures and rejects forged or expired tokens', async () => {
  clearJwkCacheForTests();
  const projectId = 'gen-lang-client-0152852248';
  const nowSec = 1_760_000_000;
  const { privateKey, publicJwk, kid } = await generateRsaTestKeyPair('kid-alpha');

  const validClaims = {
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: 'user_verified_1',
    user_id: 'user_verified_1',
    email: 'creator@looma.app',
    email_verified: true,
    auth_time: nowSec - 60,
    iat: nowSec - 60,
    exp: nowSec + 3600,
  };

  const validJwt = await signTestJwt(privateKey, kid, validClaims);
  const verified = await verifyFirebaseIdTokenCrypto(validJwt, {
    expectedProjectId: projectId,
    nowSec,
    jwkResolver: async (requestedKid) => (requestedKid === kid ? publicJwk : null),
  });
  assert.deepEqual(verified, {
    uid: 'user_verified_1',
    email: 'creator@looma.app',
    emailVerified: true,
  });

  // Wrong signature (signed by a second keypair but verified against first public key)
  const otherPair = await generateRsaTestKeyPair('kid-alpha');
  const forgedJwt = await signTestJwt(otherPair.privateKey, kid, validClaims);
  await assert.rejects(
    verifyFirebaseIdTokenCrypto(forgedJwt, {
      expectedProjectId: projectId,
      nowSec,
      jwkResolver: async () => publicJwk,
    }),
    /Invalid authentication token signature/
  );

  // Wrong audience
  const wrongAud = await signTestJwt(privateKey, kid, { ...validClaims, aud: 'wrong-proj' });
  await assert.rejects(
    verifyFirebaseIdTokenCrypto(wrongAud, {
      expectedProjectId: projectId,
      nowSec,
      jwkResolver: async () => publicJwk,
    }),
    /audience mismatch/
  );

  // Wrong issuer
  const wrongIss = await signTestJwt(privateKey, kid, {
    ...validClaims,
    iss: 'https://accounts.google.com',
  });
  await assert.rejects(
    verifyFirebaseIdTokenCrypto(wrongIss, {
      expectedProjectId: projectId,
      nowSec,
      jwkResolver: async () => publicJwk,
    }),
    /issuer mismatch/
  );

  // Expired token
  const expiredJwt = await signTestJwt(privateKey, kid, {
    ...validClaims,
    exp: nowSec - 120,
  });
  await assert.rejects(
    verifyFirebaseIdTokenCrypto(expiredJwt, {
      expectedProjectId: projectId,
      nowSec,
      jwkResolver: async () => publicJwk,
    }),
    /expired/
  );

  // Unverified email policy enforcement vs override
  const unverifiedEmailJwt = await signTestJwt(privateKey, kid, {
    ...validClaims,
    email_verified: false,
  });
  await assert.rejects(
    verifyFirebaseIdTokenCrypto(unverifiedEmailJwt, {
      expectedProjectId: projectId,
      nowSec,
      jwkResolver: async () => publicJwk,
    }),
    /verified email/
  );
  const allowedUnverified = await verifyFirebaseIdTokenCrypto(unverifiedEmailJwt, {
    expectedProjectId: projectId,
    nowSec,
    requireVerifiedEmail: false,
    jwkResolver: async () => publicJwk,
  });
  assert.equal(allowedUnverified.emailVerified, false);

  // Disabled account detection via Firebase Identity Toolkit accounts:lookup
  const disabledFetcher = (async (url: string) => {
    if (String(url).includes('accounts:lookup')) {
      return new Response(
        JSON.stringify({
          users: [
            {
              localId: 'user_verified_1',
              email: 'creator@looma.app',
              emailVerified: true,
              disabled: true,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  await assert.rejects(
    verifyFirebaseIdTokenCrypto(validJwt, {
      expectedProjectId: projectId,
      firebaseApiKey: 'test-api-key',
      checkAccountActive: true,
      nowSec,
      jwkResolver: async () => publicJwk,
      fetcher: disabledFetcher,
    }),
    /disabled/
  );
});

test('signScopedHmacToken and verifyScopedHmacToken detect tampering and expiry', async () => {
  const nowSec = 1_760_000_000;
  const secret = 'super-secret-signing-key-256';
  const token = await signScopedHmacToken(
    { kind: 'calls-session', uid: 'u1', cfSessionId: 'sess_12345678', exp: nowSec + 120 },
    secret
  );

  const verified = await verifyScopedHmacToken<{ kind: string; uid: string; exp?: number }>(
    token,
    secret,
    nowSec
  );
  assert.equal(verified?.uid, 'u1');

  const [payloadPart, sigPart] = token.split('.');
  const tamperedPayload = uint8ArrayToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ kind: 'calls-session', uid: 'attacker', cfSessionId: 'sess_12345678', exp: nowSec + 120 })
    )
  );
  assert.equal(
    await verifyScopedHmacToken(`${tamperedPayload}.${sigPart}`, secret, nowSec),
    null
  );
  assert.equal(
    await verifyScopedHmacToken(`${payloadPart}.${sigPart}`, 'wrong-secret', nowSec),
    null
  );
  assert.equal(
    await verifyScopedHmacToken(token, secret, nowSec + 300),
    null
  );
});

test('resolveAllowedCorsOrigin strictly permits trusted origins and rejects unknown domains', () => {
  assert.equal(
    resolveAllowedCorsOrigin(
      'https://looma.prigidcollection.workers.dev',
      'https://looma.prigidcollection.workers.dev/api/calls/status'
    ),
    'https://looma.prigidcollection.workers.dev'
  );
  assert.equal(
    resolveAllowedCorsOrigin('http://localhost:3000', 'http://localhost:3000/api/storage/status'),
    'http://localhost:3000'
  );
  assert.equal(
    resolveAllowedCorsOrigin(
      'https://custom.looma.studio',
      'https://looma.prigidcollection.workers.dev/api/storage/status',
      'https://custom.looma.studio, https://preview.looma.studio'
    ),
    'https://custom.looma.studio'
  );
  assert.equal(
    resolveAllowedCorsOrigin(
      'https://evil-phishing.example',
      'https://looma.prigidcollection.workers.dev/api/storage/status',
      'https://custom.looma.studio'
    ),
    null
  );
});

test('InMemoryRateLimiter enforces rolling bucket window and resets after expiry', () => {
  const limiter = new InMemoryRateLimiter();
  const base = 100_000;
  assert.equal(limiter.check('uid:u1', 2, 10_000, base).allowed, true);
  assert.equal(limiter.check('uid:u1', 2, 10_000, base + 1000).allowed, true);
  const third = limiter.check('uid:u1', 2, 10_000, base + 2000);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);

  const afterReset = limiter.check('uid:u1', 2, 10_000, base + 10_001);
  assert.equal(afterReset.allowed, true);
  assert.equal(afterReset.remaining, 1);
});
