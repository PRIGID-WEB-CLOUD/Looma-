import type { CallParticipant, CallSession } from '../types/social';

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
  const appId = cleanCallsEnvValue(env.CLOUDFLARE_CALLS_APP_ID);
  const appToken = cleanCallsEnvValue(env.CLOUDFLARE_CALLS_APP_TOKEN);

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

export function shouldPeerJoinActivateCall(params: {
  callerId: string;
  actorUid: string;
  participantCount: number;
  currentStatus?: CallSession['status'];
  peerState: 'joined' | 'declined' | 'left';
}): boolean {
  if (params.peerState !== 'joined' || params.currentStatus !== 'ringing') {
    return false;
  }
  return params.actorUid !== params.callerId || params.participantCount <= 1;
}

export function reconcileCallSessionWithRemoteStatus(
  session: CallSession | null,
  callId: string,
  remoteStatus: string,
  nowMs: number = Date.now()
): CallSession | null {
  if (!session || session.callId !== callId) return session;
  if (remoteStatus === 'ended') return null;
  if (remoteStatus === 'active' && session.status !== 'active') {
    return {
      ...session,
      status: 'active',
      startedAtMs: nowMs,
    };
  }
  return session;
}

export function reconcileCallSessionWithPeers(
  session: CallSession | null,
  callId: string,
  selfUid: string,
  peers: CallParticipant[],
  nowMs: number = Date.now()
): CallSession | null {
  if (!session || session.callId !== callId) return session;
  const byUid = new Map(session.participants.map((p) => [p.uid, p]));
  for (const p of peers) {
    const existing = byUid.get(p.uid);
    byUid.set(p.uid, existing ? { ...existing, ...p } : p);
  }
  const nextParticipants = Array.from(byUid.values());
  const hasRemoteJoined = nextParticipants.some(
    (p) => p.uid !== selfUid && p.connectionState === 'joined'
  );
  const nextStatus =
    session.status === 'ringing' && hasRemoteJoined ? 'active' : session.status;

  return {
    ...session,
    status: nextStatus,
    startedAtMs:
      nextStatus === 'active' && session.status === 'ringing'
        ? nowMs
        : session.startedAtMs,
    participants: nextParticipants,
  };
}

export interface IceServerConfigInput {
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_KEY_TOKEN?: string;
}

export const DEFAULT_CLOUDFLARE_STUN_SERVER: RTCIceServer = {
  urls: 'stun:stun.cloudflare.com:3478',
};

export interface TurnKeyConfigResult {
  configured: boolean;
  partial: boolean;
  missingField: 'CLOUDFLARE_TURN_KEY_ID' | 'CLOUDFLARE_TURN_KEY_TOKEN' | null;
  turnKeyId: string | null;
  turnKeyToken: string | null;
}

export function cleanCallsEnvValue(value?: string): string {
  if (!value) return '';
  let cleaned = value.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (
    !cleaned ||
    cleaned.startsWith('MY_') ||
    cleaned === 'changeme' ||
    cleaned === 'replace-me'
  ) {
    return '';
  }
  return cleaned;
}

export function parseTurnKeyConfig(env: IceServerConfigInput): TurnKeyConfigResult {
  const turnKeyId = cleanCallsEnvValue(env.CLOUDFLARE_TURN_KEY_ID);
  const turnKeyToken = cleanCallsEnvValue(env.CLOUDFLARE_TURN_KEY_TOKEN);

  if (turnKeyId && turnKeyToken) {
    return {
      configured: true,
      partial: false,
      missingField: null,
      turnKeyId,
      turnKeyToken,
    };
  }

  if (turnKeyId || turnKeyToken) {
    return {
      configured: false,
      partial: true,
      missingField: turnKeyId ? 'CLOUDFLARE_TURN_KEY_TOKEN' : 'CLOUDFLARE_TURN_KEY_ID',
      turnKeyId: turnKeyId || null,
      turnKeyToken: turnKeyToken || null,
    };
  }

  return {
    configured: false,
    partial: false,
    missingField: null,
    turnKeyId: null,
    turnKeyToken: null,
  };
}

function normalizeServerUrls(urls: unknown): string[] {
  if (typeof urls === 'string') {
    const clean = urls.trim();
    return clean ? [clean] : [];
  }
  if (Array.isArray(urls)) {
    return urls
      .filter((u): u is string => typeof u === 'string')
      .map((u) => u.trim())
      .filter(Boolean);
  }
  return [];
}

export function isTurnServerUrl(url: string): boolean {
  return /^turns?:.+/i.test(url.trim());
}

export function isStunServerUrl(url: string): boolean {
  return /^stuns?:.+/i.test(url.trim());
}

export interface IceValidationResult {
  valid: boolean;
  iceServers: RTCIceServer[];
  hasStun: boolean;
  hasTurn: boolean;
  error?: string;
}

export function validateIceServersConfig(iceServers: unknown): IceValidationResult {
  if (!Array.isArray(iceServers) || iceServers.length === 0) {
    return {
      valid: false,
      iceServers: [],
      hasStun: false,
      hasTurn: false,
      error: 'ICE server configuration is empty.',
    };
  }

  const validated: RTCIceServer[] = [];
  let hasStun = false;
  let hasTurn = false;

  for (const rawEntry of iceServers) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      return {
        valid: false,
        iceServers: [],
        hasStun: false,
        hasTurn: false,
        error: 'ICE server entry is malformed.',
      };
    }

    const entry = rawEntry as RTCIceServer;
    const urls = normalizeServerUrls(entry.urls);
    if (urls.length === 0) {
      return {
        valid: false,
        iceServers: [],
        hasStun: false,
        hasTurn: false,
        error: 'ICE server entry is missing valid urls.',
      };
    }

    const entryHasStun = urls.some(isStunServerUrl);
    const entryHasTurn = urls.some(isTurnServerUrl);
    if (!entryHasStun && !entryHasTurn) {
      return {
        valid: false,
        iceServers: [],
        hasStun: false,
        hasTurn: false,
        error: 'ICE server entry contains unsupported protocol URLs.',
      };
    }

    if (entryHasStun) hasStun = true;
    if (entryHasTurn) {
      hasTurn = true;
      const username = typeof entry.username === 'string' ? entry.username.trim() : '';
      const credential =
        typeof entry.credential === 'string' ? entry.credential.trim() : '';
      if (!username || !credential) {
        return {
          valid: false,
          iceServers: [],
          hasStun: false,
          hasTurn: false,
          error:
            'TURN server configuration is missing temporary username or credential.',
        };
      }
      validated.push({
        ...entry,
        urls: urls.length === 1 && typeof entry.urls === 'string' ? urls[0] : urls,
        username,
        credential,
      });
    } else {
      validated.push({
        ...entry,
        urls: urls.length === 1 && typeof entry.urls === 'string' ? urls[0] : urls,
      });
    }
  }

  return {
    valid: true,
    iceServers: validated,
    hasStun,
    hasTurn,
  };
}

export function ensureStunPreserved(iceServers: RTCIceServer[]): RTCIceServer[] {
  const hasStun = iceServers.some((server) =>
    normalizeServerUrls(server.urls).some(isStunServerUrl)
  );
  if (hasStun) return iceServers;
  return [{ ...DEFAULT_CLOUDFLARE_STUN_SERVER }, ...iceServers];
}

export function parseIceServersConfig(env: IceServerConfigInput): {
  iceServers: RTCIceServer[];
  hasTurnConfigured: boolean;
} {
  const servers: RTCIceServer[] = [{ ...DEFAULT_CLOUDFLARE_STUN_SERVER }];

  const turnUrls = cleanCallsEnvValue(env.TURN_URLS)
    .split(',')
    .map((u) => u.trim())
    .filter(isTurnServerUrl);

  const username = cleanCallsEnvValue(env.TURN_USERNAME);
  const credential = cleanCallsEnvValue(env.TURN_CREDENTIAL);

  if (turnUrls.length > 0 && username && credential) {
    servers.push({
      urls: turnUrls,
      username,
      credential,
    });
  }

  return {
    iceServers: servers,
    hasTurnConfigured: turnUrls.length > 0 && Boolean(username && credential),
  };
}

export async function generateCloudflareTurnCredentials(params: {
  turnKeyId: string;
  turnKeyToken: string;
  ttlSeconds?: number;
  fetcher?: typeof fetch;
}): Promise<{ iceServers: RTCIceServer[]; hasTurnConfigured: boolean }> {
  const turnKeyId = cleanCallsEnvValue(params.turnKeyId);
  const turnKeyToken = cleanCallsEnvValue(params.turnKeyToken);
  if (!turnKeyId || !turnKeyToken) {
    throw new Error(
      'Cloudflare TURN requires both CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_KEY_TOKEN.'
    );
  }

  const ttlSeconds = Math.max(60, Math.min(86400, Math.floor(params.ttlSeconds ?? 86400)));
  const fetcher = params.fetcher ?? fetch;
  const endpoint = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(
    turnKeyId
  )}/credentials/generate-ice-servers`;

  let res: Response;
  try {
    res = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${turnKeyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: ttlSeconds }),
    });
  } catch (err) {
    throw new Error(
      `Failed to contact Cloudflare TURN credential service: ${
        err instanceof Error ? err.message : 'network error'
      }`
    );
  }

  const payload = (await res.json().catch(() => null)) as
    | { iceServers?: unknown; error?: unknown; errorDescription?: unknown }
    | null;

  if (!res.ok) {
    const upstreamMsg = extractCallsErrorMessage(payload, res.status);
    throw new Error(`Cloudflare TURN credential request failed: ${upstreamMsg}`);
  }

  const rawIceServers = payload?.iceServers;
  const initialValidation = validateIceServersConfig(rawIceServers);
  if (!initialValidation.valid) {
    throw new Error(
      `Cloudflare TURN returned invalid ICE configuration: ${
        initialValidation.error || 'empty server list'
      }`
    );
  }

  if (!initialValidation.hasTurn) {
    throw new Error(
      'Cloudflare TURN credential response did not include any authenticated TURN servers.'
    );
  }

  const merged = ensureStunPreserved(initialValidation.iceServers);
  const finalValidation = validateIceServersConfig(merged);
  if (!finalValidation.valid) {
    throw new Error(
      finalValidation.error || 'Cloudflare TURN ICE server validation failed.'
    );
  }

  return {
    iceServers: finalValidation.iceServers,
    hasTurnConfigured: true,
  };
}

export async function resolveCallsIceServers(params: {
  env: IceServerConfigInput;
  ttlSeconds?: number;
  fetcher?: typeof fetch;
}): Promise<{
  iceServers: RTCIceServer[];
  hasTurnConfigured: boolean;
  source: 'cloudflare-turn' | 'static-turn' | 'stun-only';
}> {
  const turnKeyStatus = parseTurnKeyConfig(params.env);
  if (turnKeyStatus.partial) {
    throw new Error(
      `Cloudflare TURN configuration is incomplete: missing ${turnKeyStatus.missingField}.`
    );
  }

  if (
    turnKeyStatus.configured &&
    turnKeyStatus.turnKeyId &&
    turnKeyStatus.turnKeyToken
  ) {
    const generated = await generateCloudflareTurnCredentials({
      turnKeyId: turnKeyStatus.turnKeyId,
      turnKeyToken: turnKeyStatus.turnKeyToken,
      ttlSeconds: params.ttlSeconds,
      fetcher: params.fetcher,
    });
    return {
      ...generated,
      source: 'cloudflare-turn',
    };
  }

  const rawTurnUrls = cleanCallsEnvValue(params.env.TURN_URLS)
    .split(',')
    .map((u) => u.trim())
    .filter(isTurnServerUrl);
  const staticUsername = cleanCallsEnvValue(params.env.TURN_USERNAME);
  const staticCredential = cleanCallsEnvValue(params.env.TURN_CREDENTIAL);

  if (rawTurnUrls.length > 0) {
    if (!staticUsername || !staticCredential) {
      throw new Error(
        'Static TURN_URLS configuration requires both TURN_USERNAME and TURN_CREDENTIAL.'
      );
    }
    const parsedStatic = parseIceServersConfig(params.env);
    const validated = validateIceServersConfig(parsedStatic.iceServers);
    if (!validated.valid) {
      throw new Error(validated.error || 'Invalid static TURN ICE configuration.');
    }
    return {
      iceServers: validated.iceServers,
      hasTurnConfigured: true,
      source: 'static-turn',
    };
  }

  return {
    iceServers: [{ ...DEFAULT_CLOUDFLARE_STUN_SERVER }],
    hasTurnConfigured: false,
    source: 'stun-only',
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

