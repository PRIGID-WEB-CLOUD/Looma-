import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCallsConfig,
  buildCloudflareCallsUrl,
  formatCallsHeaders,
  formatPublishTracksPayload,
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
    CLOUDFLARE_CALLS_APP_ID: ' "ebbe0d57a37187ff7f7a0fec7e21bd67" ',
    CLOUDFLARE_CALLS_APP_TOKEN: ' "1eb08f66d5b27b3d079a99feea114a850ba0c1301aefc6a160ceba167300cc01" ',
  });
  assert.equal(full.configured, true);
  assert.equal(full.appId, 'ebbe0d57a37187ff7f7a0fec7e21bd67');
  assert.equal(full.config?.appToken, '1eb08f66d5b27b3d079a99feea114a850ba0c1301aefc6a160ceba167300cc01');
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
  const av = formatPublishTracksPayload('v=0\r\no=...', { audio: true, video: true });
  assert.equal(av.sessionDescription.type, 'offer');
  assert.equal(av.sessionDescription.sdp, 'v=0\r\no=...');
  assert.equal(av.tracks.length, 2);
  assert.equal(av.tracks[0].trackName, 'audio');
  assert.equal(av.tracks[1].trackName, 'video');

  const audioOnly = formatPublishTracksPayload('v=0\r\no=...', { audio: true, video: false });
  assert.equal(audioOnly.tracks.length, 1);
  assert.equal(audioOnly.tracks[0].trackName, 'audio');
});
