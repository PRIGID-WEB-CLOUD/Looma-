# Looma 🌿

**Looma** is a cross-platform, full-stack social media web application built with React 19, TypeScript, Vite, Tailwind CSS v4, Express (`server.ts`), Firebase Authentication & Cloud Firestore, and Cloudflare R2 object storage.

---

## ✨ Key Features

1. **Rich Social Feed & Posts**:
   - Create text posts, photo uploads (via Cloudflare R2), link previews (with automatic YouTube/video/audio detection), and categories.
   - Like, comment, bookmark, and share your own posts directly to your 24-hour **Story**.
2. **24-Hour Stories**:
   - View creator stories with immersive gradient overlays, video/image media support, and story replies sent instantly via direct message.
3. **Real-Time Direct & Group Messaging**:
   - 1-on-1 and group chat threads with online presence indicators, message history persistence in Firestore, and rich preview snippets.
4. **Creator Profiles & Follow Network**:
   - Public creator profiles, follower/following/friends connection lists, and mutual connection discovery.
5. **Brand & Logo Showcase**:
   - Interactive brand modal accessible via the top bar logo, supporting one-click SVG downloads and copying for **Default**, **Black & White**, and **Transparent** logo vectors.
6. **Cloudflare R2 Object Storage**:
   - Secure server-side proxy streaming with HTTP Range support, mime-type classification, size limits, and presigned upload URLs.
7. **Protected Access & Google OAuth**:
   - Firebase Authentication with Google sign-in and verified email enforcement.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide React icons, TypeScript.
- **Backend**: Node.js, Express (`server.ts`), Vite middleware integration.
- **Database & Auth**: Firebase Auth & Cloud Firestore (`ai-studio-82404cfa-89f7-49b0-ab36-ea32adf1e5cc`).
- **Storage**: Cloudflare R2 Object Storage (S3-compatible AWS SDK v3).

---

## 🚀 Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Opens the app at `http://localhost:3000`.
3. **Run Unit Tests**:
   ```bash
   npx --yes tsx --test src/utils/socialLogic.test.ts src/utils/storageLogic.test.ts
   ```
4. **Production Build**:
   ```bash
   npm run build
   ```
