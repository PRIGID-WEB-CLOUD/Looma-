import type { CallParticipant } from '../types/social';

export interface CallsEnvInput {
  CLOUDFLARE_CALLS_APP_ID?: string;
  CLOUDFLARE_CALLS_APP_TOKEN?: string;
}

export interface CallsConfig {
  appId: string;
  appToken: string;
}

export interface CallsConfigParseResult {
  configured: boolean;
  appId: string | null;
  config: CallsConfig | null;
}

export const CLOUDFLARE_CALLS_API_BASE = 'https://rtc.live.cloudflare.com/v1/apps';

export function parseCallsConfig(env: CallsEnvInput): CallsConfigParseResult {
  const appId = (env.CLOUDFLARE_CALLS_APP_ID || '').trim().replace(/^["']|["']$/g, '');
  const appToken = (env.CLOUDFLARE_CALLS_APP_TOKEN || '').trim().replace(/^["']|["']$/g, '');

  if (!appId || !appToken) {
    return {
      configured: false,
      appId: appId || null,
      config: null,
    };
  }

  return {
    configured: true,
    appId,
    config: {
      appId,
      appToken,
    },
  };
}

export function buildCloudflareCallsUrl(appId: string, endpointPath: string): string {
  const cleanPath = endpointPath.replace(/^\/+/, '');
  return `${CLOUDFLARE_CALLS_API_BASE}/${encodeURIComponent(appId)}/${cleanPath}`;
}

export function formatCallsHeaders(appToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${appToken}`,
    'Content-Type': 'application/json',
  };
}

export interface TrackPublishRequest {
  location: 'local';
  mid: string;
  trackName: string;
}

export interface TrackSubscribeRequest {
  location: 'remote';
  sessionId: string;
  trackName: string;
}

export function formatPublishTracksPayload(
  offerSdp: string,
  options: {
    audio?: boolean;
    video?: boolean;
    audioTrackName?: string;
    videoTrackName?: string;
  } = { audio: true, video: true }
): {
  sessionDescription: { type: 'offer'; sdp: string };
  tracks: TrackPublishRequest[];
} {
  const tracks: TrackPublishRequest[] = [];
  let midIndex = 0;

  if (options.audio !== false) {
    tracks.push({
      location: 'local',
      mid: String(midIndex++),
      trackName: options.audioTrackName || 'audio',
    });
  }

  if (options.video !== false) {
    tracks.push({
      location: 'local',
      mid: String(midIndex++),
      trackName: options.videoTrackName || 'video',
    });
  }

  return {
    sessionDescription: {
      type: 'offer',
      sdp: offerSdp,
    },
    tracks,
  };
}

export function formatSubscribeTracksPayload(
  remoteTracks: Array<{ sessionId: string; trackName: string }>
): {
  tracks: TrackSubscribeRequest[];
} {
  return {
    tracks: remoteTracks
      .filter((t) => Boolean(t.sessionId?.trim()) && Boolean(t.trackName?.trim()))
      .map((t) => ({
        location: 'remote' as const,
        sessionId: t.sessionId.trim(),
        trackName: t.trackName.trim(),
      })),
  };
}

export function formatRenegotiatePayload(answerSdp: string): {
  sessionDescription: { type: 'answer'; sdp: string };
} {
  return {
    sessionDescription: {
      type: 'answer',
      sdp: answerSdp,
    },
  };
}

export function formatTracksClosePayload(
  mids: string[],
  force: boolean = true
): {
  tracks: Array<{ mid: string }>;
  force: boolean;
} {
  return {
    tracks: mids
      .map((m) => m.trim())
      .filter(Boolean)
      .map((mid) => ({ mid })),
    force,
  };
}

export function extractCallsErrorMessage(
  payload: unknown,
  fallbackStatus?: number
): string {
  if (payload && typeof payload === 'object') {
    const record = payload as {
      error?: unknown;
      errorDescription?: unknown;
      errorCode?: unknown;
      tracks?: Array<{ errorCode?: unknown; errorDescription?: unknown }>;
    };
    if (typeof record.errorDescription === 'string' && record.errorDescription.trim()) {
      return record.errorDescription.trim();
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim();
    }
    if (Array.isArray(record.tracks)) {
      const trackErr = record.tracks.find(
        (t) => typeof t?.errorDescription === 'string' && t.errorDescription.trim()
      );
      if (trackErr && typeof trackErr.errorDescription === 'string') {
        return trackErr.errorDescription.trim();
      }
    }
    if (typeof record.errorCode === 'string' && record.errorCode.trim()) {
      return `Cloudflare Calls error: ${record.errorCode.trim()}`;
    }
  }
  return fallbackStatus
    ? `Cloudflare Calls request failed (HTTP ${fallbackStatus}).`
    : 'Cloudflare Calls request failed.';
}

export function buildPeerTrackSubscriptionKey(
  uid: string,
  cfSessionId: string,
  trackName: string
): string {
  return `${uid}::${cfSessionId}::${trackName}`;
}

export function collectPendingRemoteTrackSubscriptions(
  participants: CallParticipant[],
  selfUid: string,
  alreadySubscribedKeys: Set<string>
): Array<{ uid: string; sessionId: string; trackName: string; kind: 'audio' | 'video'; key: string }> {
  const pending: Array<{
    uid: string;
    sessionId: string;
    trackName: string;
    kind: 'audio' | 'video';
    key: string;
  }> = [];

  for (const peer of participants) {
    if (!peer.uid || peer.uid === selfUid) continue;
    if (peer.connectionState && peer.connectionState !== 'joined') continue;
    if (!peer.cfSessionId) continue;

    if (peer.audioTrackName) {
      const key = buildPeerTrackSubscriptionKey(peer.uid, peer.cfSessionId, peer.audioTrackName);
      if (!alreadySubscribedKeys.has(key)) {
        pending.push({
          uid: peer.uid,
          sessionId: peer.cfSessionId,
          trackName: peer.audioTrackName,
          kind: 'audio',
          key,
        });
      }
    }

    if (peer.videoTrackName) {
      const key = buildPeerTrackSubscriptionKey(peer.uid, peer.cfSessionId, peer.videoTrackName);
      if (!alreadySubscribedKeys.has(key)) {
        pending.push({
          uid: peer.uid,
          sessionId: peer.cfSessionId,
          trackName: peer.videoTrackName,
          kind: 'video',
          key,
        });
      }
    }
  }

  return pending;
}

export function mergePeerSignalingUpdate(
  participants: CallParticipant[],
  incoming: Partial<CallParticipant> & { uid: string }
): CallParticipant[] {
  const exists = participants.some((p) => p.uid === incoming.uid);
  if (!exists) {
    return [
      ...participants,
      {
        uid: incoming.uid,
        name: incoming.name || 'Participant',
        avatar: incoming.avatar || '',
        isMuted: Boolean(incoming.isMuted),
        isVideoOff: Boolean(incoming.isVideoOff),
        isScreenSharing: Boolean(incoming.isScreenSharing),
        connectionState: incoming.connectionState || 'joined',
        cfSessionId: incoming.cfSessionId,
        audioTrackName: incoming.audioTrackName,
        videoTrackName: incoming.videoTrackName,
      },
    ];
  }

  return participants.map((p) =>
    p.uid === incoming.uid
      ? {
          ...p,
          ...incoming,
        }
      : p
  );
}

export interface IceServerConfigInput {
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_KEY_TOKEN?: string;
}

export function parseIceServersConfig(env: IceServerConfigInput): {
  iceServers: RTCIceServer[];
  hasTurnConfigured: boolean;
} {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  const clean = (v?: string) => {
    const t = (v || '').trim().replace(/^["']|["']$/g, '');
    return !t || t.startsWith('MY_') ? '' : t;
  };

  const turnUrls = clean(env.TURN_URLS)
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^turns?:.+/.test(u));

  const username = clean(env.TURN_USERNAME);
  const credential = clean(env.TURN_CREDENTIAL);
  const turnKeyId = clean(env.CLOUDFLARE_TURN_KEY_ID);
  const turnKeyToken = clean(env.CLOUDFLARE_TURN_KEY_TOKEN);

  if (turnUrls.length > 0) {
    const turnServer: RTCIceServer = { urls: turnUrls };
    if (username) turnServer.username = username;
    if (credential) turnServer.credential = credential;
    servers.push(turnServer);
  } else if (turnKeyId && turnKeyToken) {
    // If Cloudflare TURN Key ID is provided, include Cloudflare's standard TURNS/TURN URLs
    servers.push({
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:443?transport=udp',
        'turn:turn.cloudflare.com:3478?transport=tcp',
        'turn:turn.cloudflare.com:80?transport=tcp',
        'turns:turn.cloudflare.com:5349?transport=tcp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
    });
  }

  return {
    iceServers: servers,
    hasTurnConfigured: turnUrls.length > 0 || Boolean(turnKeyId && turnKeyToken),
  };
}

export const MAX_SDP_BYTES = 200 * 1024; // 200 KB strict SDP limit

export function isValidCallsSessionId(sessionId: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(sessionId.trim());
}

export function isValidCallRoomId(callId: string): boolean {
  return /^[a-zA-Z0-9_-]{4,128}$/.test(callId.trim());
}

export function validateCallsTracksPayload(body: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const record = body as {
    sessionDescription?: { type?: unknown; sdp?: unknown };
    tracks?: unknown;
  };

  if (record.sessionDescription !== undefined) {
    const sd = record.sessionDescription;
    if (!sd || typeof sd !== 'object') {
      return { valid: false, error: 'Invalid sessionDescription object.' };
    }
    if (sd.type !== 'offer' && sd.type !== 'answer') {
      return { valid: false, error: 'sessionDescription.type must be offer or answer.' };
    }
    if (typeof sd.sdp !== 'string' || sd.sdp.length < 16 || sd.sdp.length > MAX_SDP_BYTES) {
      return { valid: false, error: 'SDP payload size is invalid or exceeds 200 KB.' };
    }
    if (!sd.sdp.includes('v=0') || !sd.sdp.includes('a=ice-ufrag')) {
      return { valid: false, error: 'SDP payload is missing required WebRTC attributes.' };
    }
  }

  if (!Array.isArray(record.tracks) || record.tracks.length === 0 || record.tracks.length > 8) {
    return { valid: false, error: 'tracks must contain between 1 and 8 entries.' };
  }

  for (const track of record.tracks) {
    if (!track || typeof track !== 'object') {
      return { valid: false, error: 'Invalid track entry.' };
    }
    const t = track as {
      location?: unknown;
      mid?: unknown;
      sessionId?: unknown;
      trackName?: unknown;
    };
    if (t.location !== 'local' && t.location !== 'remote') {
      return { valid: false, error: 'track.location must be local or remote.' };
    }
    if (typeof t.trackName !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(t.trackName)) {
      return { valid: false, error: 'Invalid trackName.' };
    }
    if (t.location === 'local') {
      if (typeof t.mid !== 'string' || !/^[a-zA-Z0-9_-]{1,16}$/.test(t.mid)) {
        return { valid: false, error: 'Local track requires valid mid.' };
      }
    } else if (typeof t.sessionId !== 'string' || !isValidCallsSessionId(t.sessionId)) {
      return { valid: false, error: 'Remote track requires valid sessionId.' };
    }
  }

  return { valid: true };
}

export function validateCallsRenegotiatePayload(body: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const sd = (body as { sessionDescription?: { type?: unknown; sdp?: unknown } }).sessionDescription;
  if (!sd || typeof sd !== 'object') {
    return { valid: false, error: 'Missing sessionDescription.' };
  }
  if (sd.type !== 'answer' && sd.type !== 'offer') {
    return { valid: false, error: 'sessionDescription.type must be answer or offer.' };
  }
  if (typeof sd.sdp !== 'string' || sd.sdp.length < 16 || sd.sdp.length > MAX_SDP_BYTES) {
    return { valid: false, error: 'SDP payload size is invalid or exceeds 200 KB.' };
  }
  if (!sd.sdp.includes('v=0')) {
    return { valid: false, error: 'Malformed SDP payload.' };
  }
  return { valid: true };
}

export function validateCallsClosePayload(body: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const tracks = (body as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks) || tracks.length === 0 || tracks.length > 8) {
    return { valid: false, error: 'tracks must contain between 1 and 8 entries.' };
  }
  for (const item of tracks) {
    if (!item || typeof item !== 'object') {
      return { valid: false, error: 'Invalid track close entry.' };
    }
    const mid = (item as { mid?: unknown }).mid;
    if (typeof mid !== 'string' || !/^[a-zA-Z0-9_-]{1,16}$/.test(mid)) {
      return { valid: false, error: 'Each track close entry requires a valid mid.' };
    }
  }
  return { valid: true };
}

