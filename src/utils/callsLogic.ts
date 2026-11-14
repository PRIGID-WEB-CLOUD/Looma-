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
