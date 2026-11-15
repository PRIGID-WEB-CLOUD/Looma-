import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCallsConfig,
  parseIceServersConfig,
  parseTurnKeyConfig,
  validateIceServersConfig,
  generateCloudflareTurnCredentials,
  resolveCallsIceServers,
  isValidCallsSessionId,
  isValidCallRoomId,
  validateCallsTracksPayload,
  validateCallsRenegotiatePayload,
  validateCallsClosePayload,
  MAX_SDP_BYTES,
  buildCloudflareCallsUrl,
  formatCallsHeaders,
  formatPublishTracksPayload,
  formatSubscribeTracksPayload,
  formatRenegotiatePayload,
  formatTracksClosePayload,
  extractCallsErrorMessage,
  collectPendingRemoteTrackSubscriptions,
  mergePeerSignalingUpdate,
  buildPeerTrackSubscriptionKey,
  CLOUDFLARE_CALLS_API_BASE,
} from './callsLogic';

test('parseCallsConfig correctly detects missing or configured Cloudflare Calls keys', () => {
  const missing = parseCallsConfig({});
  assert.equal(missing.configured, false);
  assert.equal(missing.config, null);

  const partial = parseCallsConfig({ CLOUDFLARE_CALLS_APP_ID: 'app_123' });
  assert.equal(partial.configured, false);
  assert.equal(partial.appId, 'app_123');

  const full = parseCallsConfig({
    CLOUDFLARE_CALLS_APP_ID: ' "test_app_id_001" ',
    CLOUDFLARE_CALLS_APP_TOKEN: ' "test_app_token_secret_001" ',
  });
  assert.equal(full.configured, true);
  assert.equal(full.appId, 'test_app_id_001');
  assert.equal(full.config?.appToken, 'test_app_token_secret_001');
});

test('buildCloudflareCallsUrl builds standard Cloudflare SFU endpoint URL', () => {
  const url = buildCloudflareCallsUrl('app_123', 'sessions/new');
  assert.equal(url, `${CLOUDFLARE_CALLS_API_BASE}/app_123/sessions/new`);

  const trackUrl = buildCloudflareCallsUrl('app_123', '/sessions/sess_456/tracks/new');
  assert.equal(trackUrl, `${CLOUDFLARE_CALLS_API_BASE}/app_123/sessions/sess_456/tracks/new`);
});

test('formatCallsHeaders injects Bearer token and JSON headers', () => {
  const headers = formatCallsHeaders('tok_789');
  assert.equal(headers.Authorization, 'Bearer tok_789');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('formatPublishTracksPayload handles audio-only and video+audio tracks', () => {
  const av = formatPublishTracksPayload('v=0\r\no=...', {
    audio: true,
    video: true,
    audioTrackName: 'audio-u1',
    videoTrackName: 'video-u1',
  });
  assert.equal(av.sessionDescription.type, 'offer');
  assert.equal(av.sessionDescription.sdp, 'v=0\r\no=...');
  assert.equal(av.tracks.length, 2);
  assert.equal(av.tracks[0].trackName, 'audio-u1');
  assert.equal(av.tracks[1].trackName, 'video-u1');

  const audioOnly = formatPublishTracksPayload('v=0\r\no=...', { audio: true, video: false });
  assert.equal(audioOnly.tracks.length, 1);
  assert.equal(audioOnly.tracks[0].trackName, 'audio');
});

test('formatSubscribeTracksPayload, formatRenegotiatePayload, and formatTracksClosePayload produce valid Cloudflare Calls payloads', () => {
  const sub = formatSubscribeTracksPayload([
    { sessionId: 'sess_remote_1', trackName: 'audio-u2' },
    { sessionId: 'sess_remote_1', trackName: 'video-u2' },
    { sessionId: '', trackName: 'ignored' },
  ]);
  assert.equal(sub.tracks.length, 2);
  assert.deepEqual(sub.tracks[0], {
    location: 'remote',
    sessionId: 'sess_remote_1',
    trackName: 'audio-u2',
  });

  const reneg = formatRenegotiatePayload('v=0\r\nanswer');
  assert.deepEqual(reneg, {
    sessionDescription: { type: 'answer', sdp: 'v=0\r\nanswer' },
  });

  const closePayload = formatTracksClosePayload(['0', ' 1 ', '']);
  assert.deepEqual(closePayload, {
    tracks: [{ mid: '0' }, { mid: '1' }],
    force: true,
  });
});

test('extractCallsErrorMessage prioritizes Cloudflare errorDescription and track-level errors', () => {
  assert.equal(
    extractCallsErrorMessage({ errorDescription: 'SDP contains no ice-ufrag.' }, 400),
    'SDP contains no ice-ufrag.'
  );
  assert.equal(
    extractCallsErrorMessage({ tracks: [{ errorCode: 'track_err', errorDescription: 'Track not found' }] }, 400),
    'Track not found'
  );
  assert.equal(
    extractCallsErrorMessage({ error: 'Upstream unavailable' }, 502),
    'Upstream unavailable'
  );
  assert.equal(extractCallsErrorMessage(null, 503), 'Cloudflare Calls request failed (HTTP 503).');
});

test('collectPendingRemoteTrackSubscriptions filters self, non-joined, and already subscribed tracks', () => {
  const already = new Set<string>([
    buildPeerTrackSubscriptionKey('peer_a', 'sess_a', 'audio-a'),
  ]);
  const pending = collectPendingRemoteTrackSubscriptions(
    [
      {
        uid: 'self_uid',
        name: 'Me',
        avatar: '',
        isMuted: false,
        isVideoOff: false,
        connectionState: 'joined',
        cfSessionId: 'sess_me',
        audioTrackName: 'audio-me',
      },
      {
        uid: 'peer_invited',
        name: 'Invited',
        avatar: '',
        isMuted: false,
        isVideoOff: false,
        connectionState: 'invited',
        cfSessionId: 'sess_inv',
        audioTrackName: 'audio-inv',
      },
      {
        uid: 'peer_a',
        name: 'Alice',
        avatar: '',
        isMuted: false,
        isVideoOff: false,
        connectionState: 'joined',
        cfSessionId: 'sess_a',
        audioTrackName: 'audio-a',
        videoTrackName: 'video-a',
      },
    ],
    'self_uid',
    already
  );

  assert.equal(pending.length, 1);
  assert.equal(pending[0].uid, 'peer_a');
  assert.equal(pending[0].trackName, 'video-a');
  assert.equal(pending[0].kind, 'video');
});

test('mergePeerSignalingUpdate updates existing peer and appends new peer safely', () => {
  const initial = [
    {
      uid: 'u2',
      name: 'Maya',
      avatar: '',
      isMuted: false,
      isVideoOff: false,
      connectionState: 'invited' as const,
    },
  ];
  const updated = mergePeerSignalingUpdate(initial, {
    uid: 'u2',
    connectionState: 'joined',
    cfSessionId: 'sess_u2',
    audioTrackName: 'audio-u2',
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].connectionState, 'joined');
  assert.equal(updated[0].cfSessionId, 'sess_u2');

  const added = mergePeerSignalingUpdate(updated, {
    uid: 'u3',
    name: 'Kenji',
    cfSessionId: 'sess_u3',
  });
  assert.equal(added.length, 2);
  assert.equal(added[1].name, 'Kenji');
});

test('parseIceServersConfig ignores placeholders and parses TURN URLs + credentials', () => {
  const stunOnly = parseIceServersConfig({ TURN_URLS: 'MY_TURN_URLS' });
  assert.equal(stunOnly.hasTurnConfigured, false);
  assert.equal(stunOnly.iceServers.length, 1);

  const withTurn = parseIceServersConfig({
    TURN_URLS: 'turn:turn1.looma.dev:3478, turns:turn2.looma.dev:5349, https://ignored.example',
    TURN_USERNAME: 'u_turn',
    TURN_CREDENTIAL: 'p_turn',
  });
  assert.equal(withTurn.hasTurnConfigured, true);
  assert.equal(withTurn.iceServers.length, 2);
  assert.deepEqual(withTurn.iceServers[1], {
    urls: ['turn:turn1.looma.dev:3478', 'turns:turn2.looma.dev:5349'],
    username: 'u_turn',
    credential: 'p_turn',
  });
});

test('Calls ID & signaling payload validators reject invalid IDs, missing SDP attributes, and oversized payloads', () => {
  assert.equal(isValidCallsSessionId('sess_12345678'), true);
  assert.equal(isValidCallsSessionId('../bad'), false);
  assert.equal(isValidCallRoomId('call_room_1'), true);
  assert.equal(isValidCallRoomId('x'), false);

  assert.equal(
    validateCallsTracksPayload({
      sessionDescription: { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:abc\r\n' },
      tracks: [{ location: 'local', mid: '0', trackName: 'audio-u1' }],
    }).valid,
    true
  );

  assert.equal(
    validateCallsTracksPayload({
      sessionDescription: { type: 'offer', sdp: `v=0\r\na=ice-ufrag:abc\r\n${'a'.repeat(MAX_SDP_BYTES + 1)}` },
      tracks: [{ location: 'local', mid: '0', trackName: 'audio-u1' }],
    }).valid,
    false
  );

  assert.equal(
    validateCallsTracksPayload({
      tracks: [{ location: 'remote', sessionId: 'short', trackName: 'audio-u2' }],
    }).valid,
    false
  );

  assert.equal(
    validateCallsRenegotiatePayload({
      sessionDescription: { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:xyz\r\n' },
    }).valid,
    true
  );
  assert.equal(
    validateCallsRenegotiatePayload({ sessionDescription: { type: 'answer', sdp: 'bad' } }).valid,
    false
  );

  assert.equal(validateCallsClosePayload({ tracks: [{ mid: '0' }] }).valid, true);
  assert.equal(validateCallsClosePayload({ tracks: [] }).valid, false);
});

test('parseTurnKeyConfig detects missing, partial, and complete Cloudflare TURN keys without leaking tokens', () => {
  const none = parseTurnKeyConfig({});
  assert.equal(none.configured, false);
  assert.equal(none.partial, false);
  assert.equal(none.missingField, null);

  const missingToken = parseTurnKeyConfig({ CLOUDFLARE_TURN_KEY_ID: 'turn_key_1' });
  assert.equal(missingToken.configured, false);
  assert.equal(missingToken.partial, true);
  assert.equal(missingToken.missingField, 'CLOUDFLARE_TURN_KEY_TOKEN');

  const missingId = parseTurnKeyConfig({ CLOUDFLARE_TURN_KEY_TOKEN: 'turn_tok_1' });
  assert.equal(missingId.configured, false);
  assert.equal(missingId.partial, true);
  assert.equal(missingId.missingField, 'CLOUDFLARE_TURN_KEY_ID');

  const full = parseTurnKeyConfig({
    CLOUDFLARE_TURN_KEY_ID: ' "turn_key_abc" ',
    CLOUDFLARE_TURN_KEY_TOKEN: ' "turn_secret_xyz" ',
  });
  assert.equal(full.configured, true);
  assert.equal(full.partial, false);
  assert.equal(full.turnKeyId, 'turn_key_abc');
  assert.equal(full.turnKeyToken, 'turn_secret_xyz');
});

test('parseIceServersConfig never emits unauthenticated TURN URLs when TURN keys are set', () => {
  const cfEnv = parseIceServersConfig({
    CLOUDFLARE_TURN_KEY_ID: 'turn_key_abc',
    CLOUDFLARE_TURN_KEY_TOKEN: 'turn_secret_xyz',
  });
  assert.equal(cfEnv.iceServers.length, 1);
  assert.equal(cfEnv.iceServers[0].urls, 'stun:stun.cloudflare.com:3478');
  assert.equal(cfEnv.hasTurnConfigured, false);

  const unauthStatic = parseIceServersConfig({
    TURN_URLS: 'turn:turn.looma.dev:3478',
  });
  assert.equal(unauthStatic.iceServers.length, 1);
  assert.equal(unauthStatic.hasTurnConfigured, false);
});

test('validateIceServersConfig validates STUN + authenticated TURN and rejects missing TURN credentials', () => {
  const validStun = validateIceServersConfig([{ urls: 'stun:stun.cloudflare.com:3478' }]);
  assert.equal(validStun.valid, true);
  assert.equal(validStun.hasStun, true);
  assert.equal(validStun.hasTurn, false);

  const validTurn = validateIceServersConfig([
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'temp_u_123',
      credential: 'temp_p_456',
    },
  ]);
  assert.equal(validTurn.valid, true);
  assert.equal(validTurn.hasStun, true);
  assert.equal(validTurn.hasTurn, true);

  const missingCreds = validateIceServersConfig([
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:turn.cloudflare.com:3478?transport=udp' },
  ]);
  assert.equal(missingCreds.valid, false);
  assert.match(missingCreds.error || '', /username or credential/i);

  const emptyConfig = validateIceServersConfig([]);
  assert.equal(emptyConfig.valid, false);
});

test('generateCloudflareTurnCredentials and resolveCallsIceServers generate authenticated ICE servers and preserve STUN', async () => {
  let capturedUrl = '';
  let capturedAuth = '';
  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedAuth = String((init?.headers as Record<string, string>)?.Authorization || '');
    return new Response(
      JSON.stringify({
        iceServers: [
          {
            urls: [
              'turn:turn.cloudflare.com:3478?transport=udp',
              'turns:turn.cloudflare.com:5349?transport=tcp',
            ],
            username: 'cf_temp_user_abc',
            credential: 'cf_temp_pass_xyz',
          },
        ],
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const resolved = await resolveCallsIceServers({
    env: {
      CLOUDFLARE_TURN_KEY_ID: 'cf_turn_key_id',
      CLOUDFLARE_TURN_KEY_TOKEN: 'cf_turn_key_token_secret',
    },
    fetcher: mockFetch,
  });

  assert.equal(
    capturedUrl,
    'https://rtc.live.cloudflare.com/v1/turn/keys/cf_turn_key_id/credentials/generate-ice-servers'
  );
  assert.equal(capturedAuth, 'Bearer cf_turn_key_token_secret');
  assert.equal(resolved.source, 'cloudflare-turn');
  assert.equal(resolved.hasTurnConfigured, true);
  assert.equal(resolved.iceServers[0].urls, 'stun:stun.cloudflare.com:3478');
  assert.equal(resolved.iceServers[1].username, 'cf_temp_user_abc');
  assert.equal(resolved.iceServers[1].credential, 'cf_temp_pass_xyz');
});

test('resolveCallsIceServers rejects missing TURN key ID, missing TURN token, and failed API responses cleanly', async () => {
  await assert.rejects(
    () =>
      resolveCallsIceServers({
        env: { CLOUDFLARE_TURN_KEY_ID: 'only_key_id' },
      }),
    /missing CLOUDFLARE_TURN_KEY_TOKEN/i
  );

  await assert.rejects(
    () =>
      resolveCallsIceServers({
        env: { CLOUDFLARE_TURN_KEY_TOKEN: 'only_secret_token_never_leak' },
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /missing CLOUDFLARE_TURN_KEY_ID/i);
      assert.equal(err.message.includes('only_secret_token_never_leak'), false);
      return true;
    }
  );

  const failingFetch = (async () =>
    new Response(
      JSON.stringify({ errorDescription: 'Invalid TURN key token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  await assert.rejects(
    () =>
      generateCloudflareTurnCredentials({
        turnKeyId: 'k1',
        turnKeyToken: 'super_secret_turn_token',
        fetcher: failingFetch,
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Invalid TURN key token/i);
      assert.equal(err.message.includes('super_secret_turn_token'), false);
      return true;
    }
  );

  const unauthPayloadFetch = (async () =>
    new Response(
      JSON.stringify({
        iceServers: [{ urls: 'turn:turn.cloudflare.com:3478' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  await assert.rejects(
    () =>
      generateCloudflareTurnCredentials({
        turnKeyId: 'k1',
        turnKeyToken: 't1',
        fetcher: unauthPayloadFetch,
      }),
    /username or credential/i
  );
});


