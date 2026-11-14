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

export function formatPublishTracksPayload(
  offerSdp: string,
  options: { audio?: boolean; video?: boolean } = { audio: true, video: true }
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
      trackName: 'audio',
    });
  }

  if (options.video !== false) {
    tracks.push({
      location: 'local',
      mid: String(midIndex++),
      trackName: 'video',
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
