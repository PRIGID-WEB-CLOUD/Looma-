import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStorageObjectKey,
  classifyR2BackendError,
  classifyUploadMime,
  decodeJwtPayload,
  extractStorageKeyFromUrl,
  inspectUploadHttpResponse,
  isOwnedStorageKey,
  isRetryableUploadHttpError,
  isValidStorageObjectKey,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  normalizeStorageFolder,
  parseR2Config,
  resolveStoragePublicUrl,
  validateDecodedFirebaseTokenClaims,
} from './storageLogic';

test('parseR2Config detects missing vars and builds Cloudflare R2 S3 endpoint when complete', () => {
  const missing = parseR2Config({
    R2_ACCOUNT_ID: 'MY_CLOUDFLARE_ACCOUNT_ID',
    R2_ACCESS_KEY_ID: '',
    R2_BUCKET_NAME: 'looma-media',
  });
  assert.equal(missing.configured, false);
  assert.deepEqual(missing.missing, [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ]);
  assert.equal(missing.config, null);

  const ready = parseR2Config({
    R2_ACCOUNT_ID: 'acct_12345',
    R2_ACCESS_KEY_ID: 'key_abc',
    R2_SECRET_ACCESS_KEY: 'secret_xyz',
    R2_BUCKET_NAME: 'looma-media',
    R2_PUBLIC_URL: 'https://cdn.looma.example.com/',
  });
  assert.equal(ready.configured, true);
  assert.deepEqual(ready.missing, []);
  assert.equal(ready.config?.endpoint, 'https://acct_12345.r2.cloudflarestorage.com');
  assert.equal(ready.config?.publicUrl, 'https://cdn.looma.example.com');
  assert.equal(ready.publicUrlConfigured, true);

  const cloudflareAliases = parseR2Config({
    CLOUDFLARE_ACCOUNT_ID: ' "cf_acct_999" ',
    CLOUDFLARE_ACCESS_KEY_ID: " 'cf_key_123' ",
    CLOUDFLARE_SECRET_ACCESS_KEY: ' cf_secret_456 ',
    CLOUDFLARE_R2_BUCKET_NAME: ' "looma" ',
    CLOUDFLARE_R2_PUBLIC_DOMAIN: ' "https://pub-example.r2.dev/" ',
  });
  assert.equal(cloudflareAliases.configured, true);
  assert.deepEqual(cloudflareAliases.missing, []);
  assert.equal(cloudflareAliases.config?.accountId, 'cf_acct_999');
  assert.equal(cloudflareAliases.config?.accessKeyId, 'cf_key_123');
  assert.equal(cloudflareAliases.config?.bucketName, 'looma');
  assert.equal(cloudflareAliases.config?.endpoint, 'https://cf_acct_999.r2.cloudflarestorage.com');
  assert.equal(cloudflareAliases.config?.publicUrl, 'https://pub-example.r2.dev');
  assert.equal(cloudflareAliases.publicUrlConfigured, true);
});

test('classifyUploadMime validates allowed media types and rejects SVG/executables', () => {
  const jpg = classifyUploadMime('image/jpeg', 'photo.jpg');
  assert.equal(jpg.valid, true);
  assert.equal(jpg.kind, 'image');
  assert.equal(jpg.extension, 'jpg');
  assert.equal(jpg.maxBytes, MAX_IMAGE_BYTES);

  const mp4 = classifyUploadMime('video/mp4', 'clip.mp4');
  assert.equal(mp4.valid, true);
  assert.equal(mp4.kind, 'video');
  assert.equal(mp4.maxBytes, MAX_MEDIA_BYTES);

  const mp3 = classifyUploadMime('application/octet-stream', 'track.mp3');
  assert.equal(mp3.valid, true);
  assert.equal(mp3.kind, 'audio');
  assert.equal(mp3.contentType, 'audio/mpeg');

  const svg = classifyUploadMime('image/svg+xml', 'vector.svg');
  assert.equal(svg.valid, false);

  const exe = classifyUploadMime('application/x-msdownload', 'app.exe');
  assert.equal(exe.valid, false);
});

test('object key generation, validation, ownership, and URL round-tripping', () => {
  const folder = normalizeStorageFolder('stories');
  assert.equal(folder, 'stories');
  assert.equal(normalizeStorageFolder('../etc'), 'posts');

  const key = buildStorageObjectKey('user_ABC123', 'posts', 'mp4', 1700000000000, 'rnd99');
  assert.equal(key, 'uploads/user_ABC123/posts/1700000000000-rnd99.mp4');
  assert.equal(isValidStorageObjectKey(key), true);
  assert.equal(isOwnedStorageKey('user_ABC123', key), true);
  assert.equal(isOwnedStorageKey('other_user', key), false);

  assert.equal(isValidStorageObjectKey('uploads/../secret/file.png'), false);
  assert.equal(isValidStorageObjectKey('/uploads/user_ABC123/posts/a.png'), false);

  const proxyUrl = resolveStoragePublicUrl(key);
  assert.equal(
    proxyUrl,
    '/api/storage/file/uploads/user_ABC123/posts/1700000000000-rnd99.mp4'
  );
  assert.equal(extractStorageKeyFromUrl(proxyUrl), key);
  assert.equal(
    extractStorageKeyFromUrl(
      '/api/storage/file?key=uploads%2Fuser_ABC123%2Fposts%2F1700000000000-rnd99.mp4'
    ),
    key
  );

  const cdnUrl = resolveStoragePublicUrl(key, 'https://media.looma.app/');
  assert.equal(
    cdnUrl,
    'https://media.looma.app/uploads/user_ABC123/posts/1700000000000-rnd99.mp4'
  );
  assert.equal(
    extractStorageKeyFromUrl(cdnUrl, 'https://media.looma.app'),
    key
  );
});

test('decodeJwtPayload and validateDecodedFirebaseTokenClaims enforce project, expiry, and email_verified', () => {
  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  const nowSec = 1_750_000_000;
  const goodToken = `${encode({ alg: 'RS256' })}.${encode({
    aud: 'gen-lang-client-0152852248',
    iss: 'https://securetoken.google.com/gen-lang-client-0152852248',
    sub: 'uid_123',
    email_verified: true,
    exp: nowSec + 3600,
  })}.sig`;

  const payload = decodeJwtPayload(goodToken);
  assert.equal(
    validateDecodedFirebaseTokenClaims(payload, 'gen-lang-client-0152852248', nowSec).valid,
    true
  );

  assert.equal(
    validateDecodedFirebaseTokenClaims(
      { ...payload, email_verified: false },
      'gen-lang-client-0152852248',
      nowSec
    ).valid,
    false
  );

  assert.equal(
    validateDecodedFirebaseTokenClaims(
      { ...payload, exp: nowSec - 10 },
      'gen-lang-client-0152852248',
      nowSec
    ).valid,
    false
  );

  assert.equal(
    validateDecodedFirebaseTokenClaims(
      { ...payload, aud: 'wrong-project' },
      'gen-lang-client-0152852248',
      nowSec
    ).valid,
    false
  );
});

test('isRetryableUploadHttpError and inspectUploadHttpResponse strictly enforce real R2 responses with no inline fallback', () => {
  assert.equal(isRetryableUploadHttpError(405), true);
  assert.equal(isRetryableUploadHttpError(404), true);
  assert.equal(isRetryableUploadHttpError(501), true);
  assert.equal(isRetryableUploadHttpError(200, false), true);
  assert.equal(isRetryableUploadHttpError(200, true), false);
  assert.equal(isRetryableUploadHttpError(401), false);
  assert.equal(isRetryableUploadHttpError(413), false);

  const htmlProxy = inspectUploadHttpResponse(
    200,
    '<!doctype html><html><body>Looma</body></html>'
  );
  assert.equal(htmlProxy.ok, false);
  assert.equal(htmlProxy.shouldRetryPresign, true);

  const validUpload = inspectUploadHttpResponse(
    201,
    JSON.stringify({
      ok: true,
      url: 'https://pub-example.r2.dev/uploads/u1/posts/1.png',
      key: 'uploads/u1/posts/1.png',
    })
  );
  assert.equal(validUpload.ok, true);
  assert.equal(validUpload.shouldRetryPresign, false);

  const backendUnauthorized = inspectUploadHttpResponse(
    502,
    JSON.stringify({
      code: 'R2_UNAUTHORIZED',
      error: 'Cloudflare R2 rejected the configured API credentials (Unauthorized).',
    })
  );
  assert.equal(backendUnauthorized.ok, false);
  assert.equal(backendUnauthorized.shouldRetryPresign, false);
  assert.equal(
    backendUnauthorized.errorMessage,
    'Cloudflare R2 rejected the configured API credentials (Unauthorized).'
  );

  const authInfo = classifyR2BackendError({ Code: 'Unauthorized', $metadata: { httpStatusCode: 401 } });
  assert.equal(authInfo.code, 'R2_UNAUTHORIZED');
  assert.equal(authInfo.isAuthError, true);

  const bucketInfo = classifyR2BackendError({ Code: 'NoSuchBucket', message: 'The specified bucket does not exist.' });
  assert.equal(bucketInfo.code, 'R2_BUCKET_NOT_FOUND');
});

