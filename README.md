# Looma

**Looma** is a mobile-first social media application powered by React 19, TypeScript, Vite, Tailwind CSS v4, **Cloudflare Workers + Hono** (`src/worker.ts`), **Cloudflare R2**, **Cloudflare Calls SFU**, and **Firebase Authentication & Cloud Firestore**.

---

## Core Capabilities

1. **Social Feed & Rich Media**:
   - Create text, photo, video, audio, and link posts with categories, `#hashtags`, `@mentions`, likes, bookmarks, inline deletion, and one-click sharing to 24-hour Stories.
2. **24-Hour Stories**:
   - Multi-frame story viewer with video/image support, instant direct-message replies, and owner deletion.
3. **Direct & Group Messaging**:
   - Real-time 1-on-1 and group chats in Firestore with admin management (rename, add/remove participants, promote admins), online presence indicators, and unread notifications.
4. **Live Audio & Video Calls (Cloudflare Calls SFU)**:
   - Authenticated WebRTC audio/video calling backed by Cloudflare Calls, Firestore `/calls` room membership verification, STUN/TURN ICE support, mute/camera/screen-share controls, incoming call ringing modal, and explicit connection/error state reporting.
5. **Cloudflare R2 Media Storage**:
   - Authenticated uploads to `uploads/{uid}/{posts|stories|avatars}/...` with MIME and magic-byte signature verification, HTTP byte-range streaming (`206 Partial Content`), and owner-verified deletion.
6. **Verified Accounts & Profile Management**:
   - Google Sign-In via Firebase Auth, mandatory email verification gate, public/private profile editing, and full account data cleanup.

---

## Architecture

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide icons, TypeScript (`src/App.tsx`, `src/components/`, `src/hooks/`).
- **Production Edge Backend**: Cloudflare Workers + Hono (`src/worker.ts`, `wrangler.jsonc`) with Workers Static Assets (`dist/`) and native `R2_BUCKET` binding (`looma`).
- **Local Dev Server**: `@hono/node-server` + Vite middleware (`server.ts`) running the exact same Worker Hono app locally on port `3000`.
- **Database & Auth**: Firebase Auth + Cloud Firestore (`firestore.rules`).

---

## Quick Commands

```bash
# Install dependencies
npm install

# Run local dev server at http://localhost:3000
npm run dev

# Run all unit & Worker API tests
npx --yes tsx --test src/utils/*.test.ts src/services/*.test.ts src/worker.test.ts

# Typecheck & production build
npm run lint
npm run build
```

See `DEPLOYMENT.md` for Cloudflare Workers configuration, secrets, and Firebase deployment instructions.
