# Looma Architecture Documentation

**Owner:** Kpormegbe Gideon (`PRIGID-WEB-CLOUD`)
**Production Host:** https://looma.prigidcollection.workers.dev/

## 1. High-Level System Overview

Looma runs as a unified **Cloudflare Workers** application (`wrangler.jsonc`) serving both the static React SPA and authenticated edge API routes from a single origin:

- **Frontend (`src/`)**: React 19, TypeScript, Vite, Tailwind CSS v4, and PWA support (`vite-plugin-pwa`, Workbox).
- **Edge API (`src/worker.ts`)**: Hono HTTP router executing in Cloudflare Workers (`nodejs_compat`), with `run_worker_first: ["/api/*"]` and Workers Static Assets (`ASSETS` binding -> `./dist`).
- **Local Development (`server.ts`)**: `@hono/node-server` wrapping the exact `createWorkerApp()` Hono instance alongside Vite dev middleware on port `3000`.
- **Database & Auth**: Firebase Authentication (Google Sign-In + verified email requirement) and Cloud Firestore (`firestore.rules`, `firebase-blueprint.json`).
- **Media Storage**: Native Cloudflare **R2** bucket binding (`R2_BUCKET` -> bucket `looma`), with S3-compatible presigning/fallback for local Node dev.
- **Real-Time Audio & Video Calls**: Native browser `RTCPeerConnection` + **Cloudflare Realtime Serverless SFU** (`https://rtc.live.cloudflare.com/v1/apps`) + Firestore `/calls` signaling.

## 2. Request & Security Boundaries

1. **Authentication**: Frontend attaches `Authorization: Bearer <Firebase ID Token>` to protected `/api/*` requests. The Worker validates the RS256 signature against Google's JWK public keys, checks issuer/audience/expiration/subject, and enforces verified email status.
2. **Storage (`uploads/{uid}/posts|stories|avatars/...`)**: Uploads validate MIME types, file size limits, magic-byte file signatures, and user ownership; downloads support HTTP `Range` (`206 Partial Content`) responses.
3. **Calls (`/api/calls/*`)**: Sessions require verified Firebase authentication and Firestore call-room membership. SFU session IDs are bound to `{uid, callId}` via HMAC-signed `X-Call-Session-Token` headers; `CLOUDFLARE_CALLS_APP_TOKEN` never leaves the Worker.
