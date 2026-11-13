# Deploying Looma 🚀

This guide outlines how to build and deploy **Looma** to production environments (such as Google Cloud Run, Vercel, Netlify, or self-hosted Node.js servers).

---

## 📦 Production Build & Start

1. **Build the Production Bundle**:
   ```bash
   npm run build
   ```
   This compiles the React SPA into static assets in the `dist/` directory using Vite.

2. **Start the Production Server**:
   ```bash
   npm start
   ```
   This runs `node server.ts` (powered by `tsx`), serving static files from `dist/` and handling Express API routes (`/api/*`) and Cloudflare R2 object storage streaming.

---

## 🔐 Environment Variables

Configure the following environment variables in your production environment (or `.env` file):

| Variable | Description | Required |
| :--- | :--- | :--- |
| `PORT` | Server port (default `3000`) | No |
| `NODE_ENV` | Set to `production` for static asset serving | Recommended |
| `R2_ACCOUNT_ID` | Cloudflare R2 Account ID | Yes (for Storage) |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 Access Key ID | Yes (for Storage) |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Secret Access Key | Yes (for Storage) |
| `R2_BUCKET_NAME` | Cloudflare R2 Bucket Name (e.g. `looma-media`) | Yes (for Storage) |
| `R2_PUBLIC_URL` | Optional custom public domain URL for R2 bucket | No |

---

## 🔥 Firebase & Firestore Configuration

Looma connects to your provisioned Firebase project and Firestore database using `firebase-applet-config.json` and security rules in `firestore.rules`. Ensure rules are deployed via:
```bash
npx firebase-tools deploy --only firestore:rules
```
