import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerApp, type Fetcher, type R2Bucket, type WorkerEnv } from './worker';
import { clearJwkCacheForTests, uint8ArrayToBase64Url } from './utils/authLogic';

interface StoredObject {
  data: Uint8Array;
  contentType: string;
  etag: string;
  uploaded: Date;
}

function createMockR2Bucket() {
  const store = new Map<string, StoredObject>();
  const bucket = {
    async head(key: string) {
      const item = store.get(key);
      if (!item) return null;
      return {
        key,
        size: item.data.byteLength,
        etag: item.etag,
        httpEtag: `"${item.etag}"`,
        uploaded: item.uploaded,
        httpMetadata: { contentType: item.contentType },
      };
    },
    async put(
      key: string,
      value: ArrayBuffer | Uint8Array | string,
      opts?: { httpMetadata?: { contentType?: string } }
    ) {
      const bytes =
        value instanceof Uint8Array
          ? new Uint8Array(value)
          : typeof value === 'string'
            ? new TextEncoder().encode(value)
            : new Uint8Array(value);
      const item: StoredObject = {
        data: bytes,
        contentType: opts?.httpMetadata?.contentType || 'application/octet-stream',
        etag: `etag-${key.length}-${bytes.byteLength}`,
        uploaded: new Date('2026-11-15T00:00:00Z'),
      };
      store.set(key, item);
      return {
        key,
        size: bytes.byteLength,
        etag: item.etag,
        httpEtag: `"${item.etag}"`,
        uploaded: item.uploaded,
        httpMetadata: { contentType: item.contentType },
      };
    },
    async get(key: string, opts?: { range?: { offset?: number; length?: number } }) {
      const item = store.get(key);
      if (!item) return null;
      const offset = opts?.range?.offset ?? 0;
      const length = opts?.range?.length ?? item.data.byteLength - offset;
      const sliced = item.data.slice(offset, offset + length);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(sliced);
          controller.close();
        },
      });
      return {
        key,
        size: item.data.byteLength,
        etag: item.etag,
        httpEtag: `"${item.etag}"`,
        uploaded: item.uploaded,
        httpMetadata: { contentType: item.contentType },
        body,
      };
    },
    async delete(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        store.delete(k);
      }
    },
    async list(opts?: { prefix?: string; limit?: number }) {
      const prefix = opts?.prefix || '';
      const limit = opts?.limit ?? 1000;
      const objects = Array.from(store.entries())
        .filter(([k]) => k.startsWith(prefix))
        .slice(0, limit)
        .map(([k, v]) => ({
          key: k,
          size: v.data.byteLength,
          etag: v.etag,
          httpEtag: `"${v.etag}"`,
          uploaded: v.uploaded,
          httpMetadata: { contentType: v.contentType },
        }));
      return { objects, truncated: false, delimitedPrefixes: [] };
    },
  };
  return bucket as unknown as R2Bucket;
}

function createMockAssets(): Fetcher {
  return {
    async fetch(input: RequestInfo | URL) {
      const reqUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      return new Response(`<html><title>Looma SPA</title><meta data-path="${new URL(reqUrl).pathname}"/></html>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    },
  } as unknown as Fetcher;
}

async function setupAuthFixture(uid: string, emailVerified: boolean = true) {
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
  const kid = `worker-test-kid-${uid}`;
  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey & {
    kid?: string;
    alg?: string;
    use?: string;
  };
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  const nowSec = Math.floor(Date.now() / 1000);
  const projectId = 'gen-lang-client-0152852248';
  const headerB64 = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }))
  );
  const payloadB64 = uint8ArrayToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        sub: uid,
        user_id: uid,
        email: `${uid}@looma.app`,
        email_verified: emailVerified,
        auth_time: nowSec - 30,
        iat: nowSec - 30,
        exp: nowSec + 3600,
      })
    )
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    )
  );
  const token = `${headerB64}.${payloadB64}.${uint8ArrayToBase64Url(sig)}`;
  return { token, publicJwk, projectId };
}

test('Worker API routes enforce Firebase auth, CORS, secret isolation, R2 media validation + range requests, and scoped Calls SFU signaling', async () => {
  const originalFetch = globalThis.fetch;
  clearJwkCacheForTests();

  const aliceAuth = await setupAuthFixture('alice_uid', true);
  const bobAuth = await setupAuthFixture('bob_uid', true);

  let cfSessionCreateCalls = 0;
  let cfTracksNewCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('googleapis.com/service_accounts/v1/jwk/securetoken')) {
      return new Response(JSON.stringify({ keys: [aliceAuth.publicJwk, bobAuth.publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
      });
    }

    if (url.includes('identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      const parsedBody = JSON.parse(String(init?.body || '{}')) as { idToken?: string };
      const uid = parsedBody.idToken === bobAuth.token ? 'bob_uid' : 'alice_uid';
      return new Response(
        JSON.stringify({
          users: [{ localId: uid, email: `${uid}@looma.app`, emailVerified: true, disabled: false }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('firestore.googleapis.com/v1/projects/')) {
      if (url.endsWith('/documents/calls/call_room_allowed')) {
        return new Response(
          JSON.stringify({
            fields: {
              status: { stringValue: 'active' },
              memberIds: { arrayValue: { values: [{ stringValue: 'alice_uid' }] } },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/documents/calls/call_room_forbidden')) {
        return new Response(
          JSON.stringify({
            fields: {
              status: { stringValue: 'active' },
              memberIds: { arrayValue: { values: [{ stringValue: 'bob_uid' }] } },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
    }

    if (url.startsWith('https://rtc.live.cloudflare.com/v1/apps/cf_app_test/')) {
      if (url.endsWith('/sessions/new')) {
        cfSessionCreateCalls += 1;
        return new Response(JSON.stringify({ sessionId: 'cf_sess_12345678' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/sessions/cf_sess_12345678/tracks/new')) {
        cfTracksNewCalls += 1;
        return new Response(
          JSON.stringify({
            sessionDescription: { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:cf\r\n' },
            tracks: [{ mid: '0', trackName: 'audio-alice', sessionId: 'cf_sess_12345678' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/sessions/cf_sess_12345678/renegotiate')) {
        return new Response(JSON.stringify({ sessionDescription: { type: 'answer', sdp: 'v=0\r\n' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/sessions/cf_sess_12345678/tracks/close')) {
        return new Response(JSON.stringify({ tracks: [{ mid: '0' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const app = createWorkerApp();
    const env: WorkerEnv = {
      ASSETS: createMockAssets(),
      R2_BUCKET: createMockR2Bucket(),
      FIREBASE_PROJECT_ID: aliceAuth.projectId,
      FIREBASE_API_KEY: 'firebase-test-key',
      FIREBASE_DATABASE_ID: 'ai-studio-test',
      CLOUDFLARE_CALLS_APP_ID: 'cf_app_test',
      CLOUDFLARE_CALLS_APP_TOKEN: 'super_secret_cf_calls_token',
      CALLS_STATE_SECRET: 'calls-hmac-secret-test',
      TURN_URLS: 'turn:turn.looma.example.com:3478,turns:turn.looma.example.com:5349',
      TURN_USERNAME: 'turnuser',
      TURN_CREDENTIAL: 'turnpass',
      ALLOWED_ORIGINS: 'https://looma.prigidcollection.workers.dev',
    };

    // 1. Public status endpoints must not leak secrets or tokens
    const callsStatusRes = await app.fetch(new Request('https://looma.prigidcollection.workers.dev/api/calls/status'), env);
    assert.equal(callsStatusRes.status, 200);
    const callsStatusText = await callsStatusRes.text();
    assert.equal(callsStatusText.includes('super_secret_cf_calls_token'), false);
    const callsStatusJson = JSON.parse(callsStatusText) as { configured: boolean; hasTurnConfigured: boolean };
    assert.equal(callsStatusJson.configured, true);
    assert.equal(callsStatusJson.hasTurnConfigured, true);

    const storageStatusRes = await app.fetch(new Request('https://looma.prigidcollection.workers.dev/api/storage/status'), env);
    assert.equal(storageStatusRes.status, 200);
    const storageStatus = (await storageStatusRes.json()) as { mode: string; configured: boolean };
    assert.equal(storageStatus.configured, true);
    assert.equal(storageStatus.mode, 'r2-binding');

    // 2. Unauthenticated requests rejected with 401
    for (const [method, path] of [
      ['POST', '/api/storage/upload'],
      ['GET', '/api/storage/list'],
      ['DELETE', '/api/storage/file?key=uploads/alice_uid/posts/a.png'],
      ['POST', '/api/calls/sessions/new'],
      ['GET', '/api/calls/ice-servers'],
    ] as const) {
      const unauthRes = await app.fetch(
        new Request(`https://looma.prigidcollection.workers.dev${path}`, { method }),
        env
      );
      assert.equal(unauthRes.status, 401, `${method} ${path} should return 401 without auth`);
    }

    // 3. CORS preflight deny on unknown origin vs allow on trusted origin
    const corsDenied = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/status', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil-attacker.example' },
      }),
      env
    );
    assert.equal(corsDenied.status, 403);

    const corsAllowed = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/status', {
        method: 'OPTIONS',
        headers: { Origin: 'https://looma.prigidcollection.workers.dev' },
      }),
      env
    );
    assert.equal(corsAllowed.status, 204);
    assert.equal(
      corsAllowed.headers.get('Access-Control-Allow-Origin'),
      'https://looma.prigidcollection.workers.dev'
    );

    // 4. Reject SVG, executable disguised as PNG, empty body, and path traversal
    const svgRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/storage/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'X-Filename': 'evil.svg',
          'X-Content-Type': 'image/svg+xml',
        },
        body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      }),
      env
    );
    assert.equal(svgRes.status, 400);

    const disguisedExe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // MZ header
    const exeRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/storage/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'X-Filename': 'fake.png',
          'X-Content-Type': 'image/png',
        },
        body: disguisedExe,
      }),
      env
    );
    assert.equal(exeRes.status, 400);

    const emptyRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/storage/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'X-Filename': 'empty.png',
          'X-Content-Type': 'image/png',
        },
        body: new Uint8Array(0),
      }),
      env
    );
    assert.equal(emptyRes.status, 400);

    const traversalRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/storage/file?key=uploads/../secret/a.png'),
      env
    );
    assert.equal(traversalRes.status, 400);

    // 5. Valid PNG & MP4 upload -> R2 storage + full read + HTTP Range 206 + cross-user delete forbidden -> owner delete 200
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const uploadPngRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/storage/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'X-Filename': 'studio.png',
          'X-Folder': 'posts',
          'X-Content-Type': 'image/png',
        },
        body: pngBytes,
      }),
      env
    );
    assert.equal(uploadPngRes.status, 201);
    const uploadedPng = (await uploadPngRes.json()) as { key: string; url: string; size: number };
    assert.equal(uploadedPng.key.startsWith('uploads/alice_uid/posts/'), true);
    assert.equal(uploadedPng.size, pngBytes.byteLength);

    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 10, 20, 30, 40,
    ]);
    const uploadMp4Res = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/storage/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'X-Filename': 'reel.mp4',
          'X-Folder': 'stories',
          'X-Content-Type': 'video/mp4',
        },
        body: mp4Bytes,
      }),
      env
    );
    assert.equal(uploadMp4Res.status, 201);
    const uploadedMp4 = (await uploadMp4Res.json()) as { key: string; url: string };

    // Byte Range request (206 Partial Content)
    const rangeRes = await app.fetch(
      new Request(`https://looma.prigidcollection.workers.dev${uploadedMp4.url}`, {
        headers: { Range: 'bytes=4-11' },
      }),
      env
    );
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('Content-Range'), `bytes 4-11/${mp4Bytes.byteLength}`);
    const rangeSlice = new Uint8Array(await rangeRes.arrayBuffer());
    assert.deepEqual(rangeSlice, mp4Bytes.slice(4, 12));

    // Invalid Range -> 416
    const badRangeRes = await app.fetch(
      new Request(`https://looma.prigidcollection.workers.dev${uploadedMp4.url}`, {
        headers: { Range: 'bytes=999-1200' },
      }),
      env
    );
    assert.equal(badRangeRes.status, 416);

    // Cross-user delete blocked (403)
    const crossDeleteRes = await app.fetch(
      new Request(`https://looma.prigidcollection.workers.dev/api/storage/file?key=${encodeURIComponent(uploadedPng.key)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bobAuth.token}` },
      }),
      env
    );
    assert.equal(crossDeleteRes.status, 403);

    // Owner delete succeeds (200) and then GET returns 404
    const ownerDeleteRes = await app.fetch(
      new Request(`https://looma.prigidcollection.workers.dev/api/storage/file?key=${encodeURIComponent(uploadedPng.key)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${aliceAuth.token}` },
      }),
      env
    );
    assert.equal(ownerDeleteRes.status, 200);
    const afterDeleteGet = await app.fetch(
      new Request(`https://looma.prigidcollection.workers.dev${uploadedPng.url}`),
      env
    );
    assert.equal(afterDeleteGet.status, 404);

    // 6. Cloudflare Calls end-to-end session membership + idempotency + scoped binding
    const forbiddenCallRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/sessions/new', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ callId: 'call_room_forbidden' }),
      }),
      env
    );
    assert.equal(forbiddenCallRes.status, 403);

    const createSession1 = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/sessions/new', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ callId: 'call_room_allowed', idempotencyKey: 'idem_call_1' }),
      }),
      env
    );
    assert.equal(createSession1.status, 201);
    const sessData1 = (await createSession1.json()) as {
      sessionId: string;
      sessionToken: string;
      iceServers: RTCIceServer[];
      hasTurnConfigured: boolean;
    };
    assert.equal(sessData1.sessionId, 'cf_sess_12345678');
    assert.equal(Boolean(sessData1.sessionToken), true);
    assert.equal(sessData1.hasTurnConfigured, true);
    assert.equal(
      sessData1.iceServers.some((s) =>
        Array.isArray(s.urls) ? s.urls.some((u) => u.startsWith('turn:')) : String(s.urls).startsWith('turn:')
      ),
      true
    );

    // Retry with same idempotencyKey returns cached session without extra Cloudflare API call
    const createSession2 = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/sessions/new', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ callId: 'call_room_allowed', idempotencyKey: 'idem_call_1' }),
      }),
      env
    );
    assert.equal(createSession2.status, 200);
    assert.equal(cfSessionCreateCalls, 1);

    // Reject missing or wrong X-Call-Session-Token and arbitrary sessionIds
    const noBindingRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/sessions/cf_sess_12345678/tracks/new', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionDescription: { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:1234\r\n' },
          tracks: [{ location: 'local', mid: '0', trackName: 'audio-alice' }],
        }),
      }),
      env
    );
    assert.equal(noBindingRes.status, 403);

    const wrongUserBindingRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/sessions/cf_sess_12345678/tracks/new', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobAuth.token}`,
          'X-Call-Session-Token': sessData1.sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionDescription: { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:1234\r\n' },
          tracks: [{ location: 'local', mid: '0', trackName: 'audio-alice' }],
        }),
      }),
      env
    );
    assert.equal(wrongUserBindingRes.status, 403);

    // Reject oversized SDP (>200 KB)
    const oversizedSdpRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/sessions/cf_sess_12345678/tracks/new', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'X-Call-Session-Token': sessData1.sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionDescription: {
            type: 'offer',
            sdp: `v=0\r\na=ice-ufrag:1234\r\n${'x'.repeat(210 * 1024)}`,
          },
          tracks: [{ location: 'local', mid: '0', trackName: 'audio-alice' }],
        }),
      }),
      env
    );
    assert.equal(oversizedSdpRes.status, 400);

    // Valid tracks/new, renegotiate, and tracks/close succeed
    const publishRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/sessions/cf_sess_12345678/tracks/new', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'X-Call-Session-Token': sessData1.sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionDescription: { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:1234\r\n' },
          tracks: [{ location: 'local', mid: '0', trackName: 'audio-alice' }],
        }),
      }),
      env
    );
    assert.equal(publishRes.status, 200);
    assert.equal(cfTracksNewCalls, 1);

    const renegRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/sessions/cf_sess_12345678/renegotiate', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'X-Call-Session-Token': sessData1.sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionDescription: { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:5678\r\n' },
        }),
      }),
      env
    );
    assert.equal(renegRes.status, 200);

    const closeTracksRes = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/calls/sessions/cf_sess_12345678/tracks/close', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceAuth.token}`,
          'X-Call-Session-Token': sessData1.sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tracks: [{ mid: '0' }], force: true }),
      }),
      env
    );
    assert.equal(closeTracksRes.status, 200);

    // 7. Unknown /api route -> JSON 404, non-API route -> SPA static ASSETS fallback
    const unknownApi = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/api/does-not-exist'),
      env
    );
    assert.equal(unknownApi.status, 404);
    assert.equal(unknownApi.headers.get('content-type')?.includes('application/json'), true);

    const spaFallback = await app.fetch(
      new Request('https://looma.prigidcollection.workers.dev/profile/alex'),
      env
    );
    assert.equal(spaFallback.status, 200);
    const spaHtml = await spaFallback.text();
    assert.equal(spaHtml.includes('Looma SPA'), true);
  } finally {
    globalThis.fetch = originalFetch;
    clearJwkCacheForTests();
  }
});
