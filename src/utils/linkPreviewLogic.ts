export interface LinkPreviewMetadata {
  url: string;
  finalUrl: string;
  hostname: string;
  siteName: string;
  title: string;
  description: string;
  imageUrl: string;
  videoUrl: string;
  embedUrl?: string;
  mediaKind: 'video' | 'image' | 'link';
}

function isPrivateOrBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return -1;
    return Number.parseInt(p, 10);
  });
  if (nums.some((n) => n < 0 || n > 255)) return false;
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isSafePublicPreviewUrl(rawUrl: string): {
  valid: boolean;
  parsed?: URL;
  reason?: string;
} {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || trimmed.length > 2048) {
    return { valid: false, reason: 'Invalid URL length.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Malformed URL.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTP/HTTPS URLs are supported.' };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Embedded URL credentials are not allowed.' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) {
    return { valid: false, reason: 'Missing hostname.' };
  }
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:')
  ) {
    return { valid: false, reason: 'Private or internal hosts are blocked.' };
  }
  if (isPrivateOrBlockedIpv4(host)) {
    return { valid: false, reason: 'Private IP ranges are blocked.' };
  }
  // Block single-integer / hex IP tricks like http://2130706433 or http://0x7f000001
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) {
    return { valid: false, reason: 'Numeric host literals are blocked.' };
  }

  return { valid: true, parsed };
}

export function decodeHtmlEntities(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_match, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCandidateAssetUrl(rawCandidate: string, baseUrl: string): string {
  const decoded = decodeHtmlEntities(rawCandidate).trim();
  if (!decoded) return '';
  if (/^(javascript|data|vbscript|blob):/i.test(decoded)) {
    return '';
  }
  try {
    const resolved = new URL(decoded, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return '';
    }
    const check = isSafePublicPreviewUrl(resolved.href);
    return check.valid ? resolved.href : '';
  } catch {
    return '';
  }
}

function extractTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = val;
  }
  return attrs;
}

function deriveEmbedFromVideoUrl(rawUrl: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/embed/')) {
        const id = parsed.pathname.split('/')[2]?.split('?')[0];
        if (id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
          return `https://www.youtube-nocookie.com/embed/${id}`;
        }
      }
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,20}$/.test(v)) {
        return `https://www.youtube-nocookie.com/embed/${v}`;
      }
    }
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
        return `https://www.youtube-nocookie.com/embed/${id}`;
      }
    }
    if (host.includes('vimeo.com')) {
      const match = parsed.pathname.match(/\/(?:video\/)?(\d{6,14})/);
      if (match?.[1]) {
        return `https://player.vimeo.com/video/${match[1]}`;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function extractLinkMetadataFromHtml(
  html: string,
  baseUrl: string
): LinkPreviewMetadata {
  let hostname = '';
  try {
    hostname = new URL(baseUrl).hostname.replace(/^www\./, '');
  } catch {
    hostname = 'link';
  }

  const metaValues = new Map<string, string>();
  const metaRegex = /<meta\b[^>]*>/gi;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const attrs = extractTagAttributes(metaMatch[0]);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').trim().toLowerCase();
    const content = (attrs.content || '').trim();
    if (key && content && !metaValues.has(key)) {
      metaValues.set(key, content);
    }
  }

  let linkImageSrc = '';
  const linkRegex = /<link\b[^>]*>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const attrs = extractTagAttributes(linkMatch[0]);
    const rel = (attrs.rel || '').toLowerCase();
    if (rel === 'image_src' && attrs.href) {
      linkImageSrc = attrs.href;
      break;
    }
  }

  let rawVideoTagSrc = '';
  const videoTagMatch = html.match(/<video\b[^>]*>[\s\S]{0,600}?<\/video>|<video\b[^>]*>/i);
  if (videoTagMatch?.[0]) {
    const videoAttrs = extractTagAttributes(videoTagMatch[0]);
    if (videoAttrs.src) {
      rawVideoTagSrc = videoAttrs.src;
    } else {
      const sourceMatch = videoTagMatch[0].match(/<source\b[^>]*>/i);
      if (sourceMatch?.[0]) {
        const srcAttrs = extractTagAttributes(sourceMatch[0]);
        if (srcAttrs.src) rawVideoTagSrc = srcAttrs.src;
      }
    }
  }

  const titleTagMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle =
    metaValues.get('og:title') ||
    metaValues.get('twitter:title') ||
    titleTagMatch?.[1] ||
    '';

  const rawDescription =
    metaValues.get('og:description') ||
    metaValues.get('twitter:description') ||
    metaValues.get('description') ||
    '';

  const rawSiteName = metaValues.get('og:site_name') || hostname;

  const rawImage =
    metaValues.get('og:image:secure_url') ||
    metaValues.get('og:image:url') ||
    metaValues.get('og:image') ||
    metaValues.get('twitter:image:src') ||
    metaValues.get('twitter:image') ||
    linkImageSrc ||
    '';

  const rawVideo =
    metaValues.get('og:video:secure_url') ||
    metaValues.get('og:video:url') ||
    metaValues.get('og:video') ||
    metaValues.get('twitter:player:stream') ||
    rawVideoTagSrc ||
    '';

  const imageUrl = resolveCandidateAssetUrl(rawImage, baseUrl);
  const videoUrl = resolveCandidateAssetUrl(rawVideo, baseUrl);
  const embedUrl = videoUrl ? deriveEmbedFromVideoUrl(videoUrl) : undefined;
  const mediaKind: 'video' | 'image' | 'link' = videoUrl
    ? 'video'
    : imageUrl
      ? 'image'
      : 'link';

  return {
    url: baseUrl,
    finalUrl: baseUrl,
    hostname,
    siteName: decodeHtmlEntities(rawSiteName).slice(0, 60) || hostname,
    title: decodeHtmlEntities(rawTitle).slice(0, 140) || hostname,
    description: decodeHtmlEntities(rawDescription).slice(0, 240),
    imageUrl,
    videoUrl,
    embedUrl,
    mediaKind,
  };
}

export function buildFallbackLinkPreview(rawUrl: string): LinkPreviewMetadata {
  let hostname = 'link';
  try {
    hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    hostname = 'link';
  }
  return {
    url: rawUrl,
    finalUrl: rawUrl,
    hostname,
    siteName: hostname,
    title: hostname,
    description: '',
    imageUrl: '',
    videoUrl: '',
    mediaKind: 'link',
  };
}

const clientLinkPreviewCache = new Map<string, LinkPreviewMetadata | null>();
const clientLinkPreviewInFlight = new Map<string, Promise<LinkPreviewMetadata | null>>();

export async function fetchDerivedLinkPreview(
  rawUrl: string
): Promise<LinkPreviewMetadata | null> {
  const clean = (rawUrl || '').trim();
  if (!clean) return null;
  if (!isSafePublicPreviewUrl(clean).valid) return null;

  if (clientLinkPreviewCache.has(clean)) {
    return clientLinkPreviewCache.get(clean) ?? null;
  }

  const existing = clientLinkPreviewInFlight.get(clean);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      const res = await fetch(
        `/api/link-preview?url=${encodeURIComponent(clean)}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }
      );
      if (!res.ok) {
        clientLinkPreviewCache.set(clean, null);
        return null;
      }
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        preview?: LinkPreviewMetadata;
      } | null;
      if (!payload?.ok || !payload.preview) {
        clientLinkPreviewCache.set(clean, null);
        return null;
      }
      clientLinkPreviewCache.set(clean, payload.preview);
      return payload.preview;
    } catch {
      clientLinkPreviewCache.set(clean, null);
      return null;
    } finally {
      clientLinkPreviewInFlight.delete(clean);
    }
  })();

  clientLinkPreviewInFlight.set(clean, promise);
  return promise;
}
