# Looma API Documentation

All API routes are served under `/api/*` by `src/worker.ts` (Hono on Cloudflare Workers).
Protected routes require `Authorization: Bearer <Firebase ID Token>` for a verified account.

## 1. Health & Diagnostics

- `GET /api/health` *(Public)*
  Returns `{ status: "ok", runtime: "cloudflare-workers", ... }`.

## 2. Cloudflare R2 Storage (`/api/storage/*`)

- `GET /api/storage/status` *(Public)*
  Returns `{ provider: "cloudflare-r2", configured: boolean, mode: "binding" | "s3" | "none" }` without leaking credentials.
- `POST /api/storage/upload` *(Authenticated)*
  Multipart `file` + `folder` (`posts` | `stories` | `avatars`). Enforces MIME allowlist, size limits (15 MB images, 100 MB video/audio), magic-byte validation, and ownership prefix `uploads/{uid}/...`.
- `POST /api/storage/presign` *(Authenticated, S3 keys configured)*
  Returns a scoped presigned upload URL for `uploads/{uid}/...`.
- `GET /api/storage/file/:key` / `GET /api/storage/file?...` *(Public read for uploaded media)*
  Streams R2 objects with `Accept-Ranges: bytes`, `206 Partial Content` support, `ETag`, and `Cache-Control`.
- `GET /api/storage/list` *(Authenticated)*
  Lists media objects scoped to the caller's `uploads/{uid}/` prefix.
- `DELETE /api/storage/file` *(Authenticated, Owner-only)*
  Deletes an object only if the object key starts with `uploads/{authUser.uid}/`.

## 3. Cloudflare Realtime Serverless SFU (`/api/calls/*`)

- `GET /api/calls/status` *(Public)*
  Returns `{ provider: "cloudflare-calls", configured: boolean, hasTurnConfigured: boolean }`.
- `GET /api/calls/ice-servers` *(Authenticated)*
  Returns STUN (`stun:stun.cloudflare.com:3478`) and configured TURN server entries.
- `POST /api/calls/sessions/new` *(Authenticated + Room Membership)*
  Body: `{ callId, idempotencyKey? }`. Verifies Firestore `/calls/{callId}` membership, creates a Cloudflare SFU session, and returns `{ sessionId, sessionToken, iceServers, hasTurnConfigured }`.
- `GET /api/calls/sessions/:sessionId` *(Authenticated + `X-Call-Session-Token`)*
- `POST /api/calls/sessions/:sessionId/tracks/new` *(Authenticated + `X-Call-Session-Token`)*
  Publishes/subscribes WebRTC tracks with SDP size validation (`<= 200 KB`).
- `PUT /api/calls/sessions/:sessionId/renegotiate` *(Authenticated + `X-Call-Session-Token`)*
- `PUT /api/calls/sessions/:sessionId/tracks/close` *(Authenticated + `X-Call-Session-Token`)*
