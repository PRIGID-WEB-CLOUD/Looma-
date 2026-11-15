export interface FirebaseJwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

export interface VerifiedFirebaseJwtPayload {
  aud?: string;
  iss?: string;
  sub?: string;
  user_id?: string;
  email?: string;
  email_verified?: boolean;
  auth_time?: number;
  iat?: number;
  exp?: number;
}

export interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

export type JwkResolver = (kid: string) => Promise<JsonWebKey | null>;

interface CachedJwkSet {
  keysByKid: Map<string, JsonWebKey>;
  expiresAtMs: number;
}

const GOOGLE_SECURETOKEN_JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let cachedJwks: CachedJwkSet | null = null;
const importedKeyCache = new Map<string, CryptoKey>();

export function base64UrlToUint8Array(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeJwtSegmentJson<T>(segment: string): T | null {
  try {
    const bytes = base64UrlToUint8Array(segment);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function parseCacheControlMaxAgeMs(cacheControl: string | null): number {
  if (!cacheControl) return 300_000;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match) return 300_000;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return 60_000;
  return Math.min(Math.max(seconds * 1000, 30_000), 3_600_000);
}

export async function fetchGoogleFirebaseJwk(
  kid: string,
  fetcher: typeof fetch = fetch
): Promise<JsonWebKey | null> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAtMs > now && cachedJwks.keysByKid.has(kid)) {
    return cachedJwks.keysByKid.get(kid) || null;
  }

  const res = await fetcher(GOOGLE_SECURETOKEN_JWK_URL);
  if (!res.ok) {
    throw new Error(`Unable to fetch Firebase public signing keys (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as {
    keys?: Array<JsonWebKey & { kid?: string }>;
  };
  const keysByKid = new Map<string, JsonWebKey>();
  for (const jwk of data.keys || []) {
    if (jwk && typeof jwk.kid === 'string' && jwk.kid) {
      keysByKid.set(jwk.kid, jwk);
    }
  }

  const maxAgeMs = parseCacheControlMaxAgeMs(res.headers.get('cache-control'));
  cachedJwks = {
    keysByKid,
    expiresAtMs: now + maxAgeMs,
  };
  importedKeyCache.clear();

  return keysByKid.get(kid) || null;
}

export function clearJwkCacheForTests(): void {
  cachedJwks = null;
  importedKeyCache.clear();
}

export interface VerifyFirebaseTokenOptions {
  expectedProjectId: string;
  firebaseApiKey?: string;
  requireVerifiedEmail?: boolean;
  nowSec?: number;
  clockSkewSec?: number;
  jwkResolver?: JwkResolver;
  checkAccountActive?: boolean;
  fetcher?: typeof fetch;
}

export async function verifyFirebaseIdTokenCrypto(
  idToken: string,
  options: VerifyFirebaseTokenOptions
): Promise<VerifiedAuthUser> {
  const parts = idToken.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed authentication token.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeJwtSegmentJson<FirebaseJwtHeader>(headerB64);
  const payload = decodeJwtSegmentJson<VerifiedFirebaseJwtPayload>(payloadB64);

  if (!header || header.alg !== 'RS256' || !header.kid || typeof header.kid !== 'string') {
    throw new Error('Unsupported or missing JWT signing algorithm/key ID.');
  }
  if (!payload) {
    throw new Error('Malformed JWT payload.');
  }

  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSec ?? 300;
  const projectId = options.expectedProjectId.trim();

  if (payload.aud !== projectId) {
    throw new Error('Authentication token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Authentication token issuer mismatch.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Authentication token missing subject.');
  }
  if (payload.user_id && payload.user_id !== payload.sub) {
    throw new Error('Authentication token subject mismatch.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec - 30) {
    throw new Error('Authentication token has expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + skew) {
    throw new Error('Authentication token issued-at time is invalid.');
  }
  if (typeof payload.auth_time === 'number' && payload.auth_time > nowSec + skew) {
    throw new Error('Authentication token auth_time is in the future.');
  }
  if (options.requireVerifiedEmail !== false && payload.email_verified !== true) {
    throw new Error('A verified email address is required.');
  }

  const resolver: JwkResolver =
    options.jwkResolver ||
    ((kid) => fetchGoogleFirebaseJwk(kid, options.fetcher || fetch));

  const jwk = await resolver(header.kid);
  if (!jwk) {
    throw new Error('Matching Firebase signing key not found.');
  }

  const cacheKey = `${header.kid}:${jwk.n || ''}`;
  let cryptoKey = options.jwkResolver ? undefined : importedKeyCache.get(cacheKey);
  if (!cryptoKey) {
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    if (!options.jwkResolver) {
      importedKeyCache.set(cacheKey, cryptoKey);
    }
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToUint8Array(signatureB64);

  const validSig = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes.buffer.slice(
      signatureBytes.byteOffset,
      signatureBytes.byteOffset + signatureBytes.byteLength
    ) as ArrayBuffer,
    signingInput
  );

  if (!validSig) {
    throw new Error('Invalid authentication token signature.');
  }

  if (options.checkAccountActive && options.firebaseApiKey) {
    const fetcher = options.fetcher || fetch;
    const lookupRes = await fetcher(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
        options.firebaseApiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!lookupRes.ok) {
      throw new Error('Authentication token rejected by Firebase account check.');
    }
    const lookupData = (await lookupRes.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
        disabled?: boolean;
      }>;
    };
    const user = lookupData.users?.[0];
    if (!user || user.localId !== payload.sub) {
      throw new Error('Firebase user record mismatch.');
    }
    if (user.disabled) {
      throw new Error('This account has been disabled.');
    }
    if (options.requireVerifiedEmail !== false && user.emailVerified !== true) {
      throw new Error('A verified email address is required.');
    }
    return {
      uid: user.localId,
      email: user.email || payload.email || '',
      emailVerified: Boolean(user.emailVerified),
    };
  }

  return {
    uid: payload.sub,
    email: payload.email || '',
    emailVerified: Boolean(payload.email_verified),
  };
}

export async function signScopedHmacToken<T extends Record<string, unknown>>(
  payload: T,
  secret: string
): Promise<string> {
  const encodedPayload = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(encodedPayload)
    )
  );
  return `${encodedPayload}.${uint8ArrayToBase64Url(sig)}`;
}

export async function verifyScopedHmacToken<T extends { exp?: number }>(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): Promise<T | null> {
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlToUint8Array(encodedSig);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer.slice(
        sigBytes.byteOffset,
        sigBytes.byteOffset + sigBytes.byteLength
      ) as ArrayBuffer,
      new TextEncoder().encode(encodedPayload)
    );
    if (!ok) return null;
    const decoded = decodeJwtSegmentJson<T>(encodedPayload);
    if (!decoded) return null;
    if (typeof decoded.exp === 'number' && decoded.exp <= nowSec) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function resolveAllowedCorsOrigin(
  requestOrigin: string | null | undefined,
  requestUrl: string,
  configuredOriginsCsv?: string
): string | null {
  if (!requestOrigin) return null;
  let parsedReqOrigin: URL;
  try {
    parsedReqOrigin = new URL(requestOrigin);
  } catch {
    return null;
  }
  const cleanReqOrigin = `${parsedReqOrigin.protocol}//${parsedReqOrigin.host}`;

  try {
    const selfUrl = new URL(requestUrl);
    if (`${selfUrl.protocol}//${selfUrl.host}` === cleanReqOrigin) {
      return cleanReqOrigin;
    }
  } catch {
    // Ignore malformed request URL
  }

  if (
    parsedReqOrigin.hostname === 'localhost' ||
    parsedReqOrigin.hostname === '127.0.0.1'
  ) {
    return cleanReqOrigin;
  }

  const defaults = [
    'https://looma.prigidcollection.workers.dev',
  ];
  const extra = (configuredOriginsCsv || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const candidate of [...defaults, ...extra]) {
    try {
      const parsed = new URL(candidate);
      if (`${parsed.protocol}//${parsed.host}` === cleanReqOrigin) {
        return cleanReqOrigin;
      }
    } catch {
      // Skip malformed entry
    }
  }

  return null;
}

export class InMemoryRateLimiter {
  private buckets = new Map<string, { count: number; resetAtMs: number }>();

  check(
    key: string,
    maxRequests: number,
    windowMs: number,
    nowMs: number = Date.now()
  ): { allowed: boolean; remaining: number; resetAtMs: number } {
    if (this.buckets.size > 5000) {
      for (const [k, v] of this.buckets.entries()) {
        if (v.resetAtMs <= nowMs) {
          this.buckets.delete(k);
        }
      }
    }

    const current = this.buckets.get(key);
    if (!current || current.resetAtMs <= nowMs) {
      const next = { count: 1, resetAtMs: nowMs + windowMs };
      this.buckets.set(key, next);
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - 1),
        resetAtMs: next.resetAtMs,
      };
    }

    if (current.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAtMs: current.resetAtMs,
      };
    }

    current.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - current.count),
      resetAtMs: current.resetAtMs,
    };
  }
}
