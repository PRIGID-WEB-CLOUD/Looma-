export interface ResolveLoomaUrlOptions {
  viteEnvUrl?: string;
  metaUrl?: string;
  runtimeUrl?: string;
  currentHostname?: string;
}

export function cleanHttpBaseUrl(raw?: string | null): string {
  const trimmed = (raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, ""));
  } catch {
    return "";
  }
}

function readMetaLoomaUrl(): string {
  if (typeof document === "undefined") return "";
  const el = document.querySelector('meta[name="looma-app-url"]');
  return el?.getAttribute("content") || "";
}

function readRuntimeGlobalLoomaUrl(): string {
  if (typeof window === "undefined") return "";
  return ((window as unknown as { __LOOMA_APP_URL__?: string }).__LOOMA_APP_URL__) || "";
}

export function isSameOriginLoomaHost(hostname?: string): boolean {
  const host = (hostname || "").trim().toLowerCase();
  if (!host) return false;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".workers.dev")
  );
}

export function resolveLoomaBaseUrl(options?: ResolveLoomaUrlOptions): string | null {
  const metaCandidate =
    options?.metaUrl !== undefined ? options.metaUrl : readMetaLoomaUrl();
  const runtimeCandidate =
    options?.runtimeUrl !== undefined ? options.runtimeUrl : readRuntimeGlobalLoomaUrl();
  const viteCandidate =
    options?.viteEnvUrl !== undefined
      ? options.viteEnvUrl
      : ((import.meta as unknown as { env?: { VITE_LOOMA_APP_URL?: string } }).env?.VITE_LOOMA_APP_URL ?? "");

  const configured =
    cleanHttpBaseUrl(runtimeCandidate) ||
    cleanHttpBaseUrl(metaCandidate) ||
    cleanHttpBaseUrl(viteCandidate);

  if (configured) {
    return configured;
  }

  const currentHostname =
    options?.currentHostname !== undefined
      ? options.currentHostname
      : typeof window !== "undefined"
        ? window.location.hostname
        : "";

  if (isSameOriginLoomaHost(currentHostname)) {
    return "";
  }

  return null;
}

export function resolveLoomaTargetUrl(
  path: "/profile" | "/marketplace" | "/",
  options?: ResolveLoomaUrlOptions
): string | null {
  const base = resolveLoomaBaseUrl(options);
  if (base === null) {
    return null;
  }
  const normalizedPath = path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function getLoomaProfileUrl(): string | null {
  return resolveLoomaTargetUrl("/profile");
}

export function getLoomaMarketplaceUrl(): string | null {
  return resolveLoomaTargetUrl("/marketplace");
}

export function getLoomaHomeUrl(): string | null {
  return resolveLoomaTargetUrl("/");
}
