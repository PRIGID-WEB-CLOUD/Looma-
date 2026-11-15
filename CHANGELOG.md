# Changelog

All notable changes to **Looma** are documented in this file.
Versioning follows Semantic Versioning (`MAJOR.MINOR.PATCH`).

## [1.0.0] - 2026-11-15

### Architecture & Production Migration
- Migrated backend execution to **Cloudflare Workers + Hono** (`src/worker.ts`, `wrangler.jsonc`) with Workers Static Assets (`dist/`).
- Integrated native **Cloudflare R2** (`R2_BUCKET`) media storage with MIME + magic-byte signature validation, HTTP byte-range (`206 Partial Content`) streaming, and owner-verified deletion.
- Hardened Firebase ID-token cryptographic RS256 verification and email-verification enforcement across protected `/api/*` endpoints.

### Real-Time Calling (Cloudflare Serverless SFU)
- Scoped Cloudflare Calls / Realtime Serverless SFU endpoints (`/api/calls/*`) to authenticated Firestore call room membership with HMAC-bound session tokens (`X-Call-Session-Token`), SDP size validation, rate limiting, and optional STUN/TURN ICE support.
- Redesigned full-screen audio/video call UI (`CallRoomModal.tsx`) and incoming call ringing modal (`IncomingCallModal.tsx`) with camera/mic permission handling, screen sharing, mute/video toggles, reconnection states, and track cleanup.

### Social UX & Security Remediation
- Upgraded Story Viewer, Story Creator, Post Composer, and Chat List views to full-screen responsive mobile-first layouts.
- Sanitized media title/URL rendering to prevent raw opaque hex hashes or storage object keys from appearing as post captions or titles.
- Enforced strict Firestore security rules (`firestore.rules`) with PII isolation, immutable creator IDs, atomic like counters, and group admin controls.
- Verified 60/60 automated unit and Worker API tests, TypeScript checks, and production builds.
