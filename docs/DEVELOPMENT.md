# Looma Developer, Setup, Testing & Troubleshooting Guide

**Repository:** https://github.com/PRIGID-WEB-CLOUD/Looma-
**Owner & Lead Developer:** Kpormegbe Gideon

---

## 1. Installation & Setup Guide

1. **Prerequisites**: Node.js `>= 22` (Node `24` recommended) and optionally Bun `1.4.4`.
2. **Clone & Install**:
   ```bash
   git clone https://github.com/PRIGID-WEB-CLOUD/Looma-.git
   cd Looma-
   bun install   # or: npm install
   ```
3. **Configuration Guide**:
   Copy `.env.example` to `.env` (never commit `.env`):
   - `PUBLIC_APP_URL` / `ALLOWED_ORIGINS`
   - `CLOUDFLARE_CALLS_APP_ID` / `CLOUDFLARE_CALLS_APP_TOKEN` (from Cloudflare Dashboard → **Realtime → Serverless SFU**)
   - Optional `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` (from Cloudflare **Realtime → TURN Server**)
   - Optional `R2_*` S3 keys for local Node R2 testing (production Workers uses native `R2_BUCKET` binding in `wrangler.jsonc`).
4. **Run Local Dev Server**:
   ```bash
   npm run dev
   ```
   Opens the full-stack app at `http://localhost:3000`.

---

## 2. Testing Documentation

Run the automated test suite, TypeScript checker, and production bundle check before every PR:

```bash
# TypeScript strict check
npm run lint

# Unit & Worker API integration tests
npx --yes tsx --test src/utils/*.test.ts src/services/*.test.ts src/worker.test.ts

# Production Vite build
npm run build
```

---

## 3. Troubleshooting Guide

- **Cloudflare build fails with `error: lockfile had changes, but lockfile is frozen`**:
  Ensure `bun.lock` matches `package.json` on your deployed GitHub branch (`bun install && git add bun.lock && git commit && git push`), click **Clear build cache** in Cloudflare Workers **Settings → Build**, and pin `BUN_VERSION` = `1.4.4`.
- **Cloudflare Calls fails to connect**:
  Confirm `CLOUDFLARE_CALLS_APP_ID` and `CLOUDFLARE_CALLS_APP_TOKEN` are set as Worker secrets (`wrangler secret put`), and verify the user is signed in with a verified email and is a member of the Firestore `/calls/{callId}` document.
- **Calls stall behind strict firewalls / mobile NAT**:
  Configure `TURN_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL` in Cloudflare Worker Secrets.
- **Google Sign-In blocked on deployed domain**:
  Add `looma.prigidcollection.workers.dev` under **Firebase Console → Authentication → Settings → Authorized domains**.
