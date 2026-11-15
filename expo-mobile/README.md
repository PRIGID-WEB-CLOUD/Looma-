# Looma Mobile — Expo & React Native Companion

This directory (`/expo-mobile`) contains the complete specification, project structure, configuration, and core React Native / Expo components for the official **Looma Mobile App** (iOS & Android).

It connects to the exact same backend (**Cloudflare Workers**, **Cloudflare R2**, **Cloudflare Realtime Serverless SFU**, and **Firebase Auth & Firestore**) as the web application.

---

## 1. Project Setup & Installation

To initialize and run the Expo mobile app:

```bash
# Create a new Expo project or run within this workspace structure
npx create-expo-app looma-mobile --template tabs
cd looma-mobile

# Install required dependencies
npx expo install firebase @react-native-async-storage/async-storage react-native-safe-area-context react-native-screens expo-linear-gradient expo-image-picker expo-camera
```

---

## 2. Configuration (`app.json`)

```json
{
  "expo": {
    "name": "Looma",
    "slug": "looma-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#2563eb"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.prigidwebcloud.looma"
    },
    "android": {
      "package": "com.prigidwebcloud.looma",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#2563eb"
      }
    },
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Allow Looma to capture photos and video for posts, stories, and video calls."
        }
      ]
    ]
  }
}
```

---

## 3. Firebase & API Client (`src/services/api.ts`)

```typescript
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

export const API_BASE_URL = 'https://looma.prigidcollection.workers.dev';

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  return res;
}
```

---

## 4. Cloudflare Calls SFU / WebRTC Hook (`src/hooks/useMobileCall.ts`)

```typescript
import { useState, useRef, useEffect } from 'react';
import { auth, fetchWithAuth } from '../services/api';

export function useMobileCall(callId: string) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  const startCall = async () => {
    setStatus('connecting');
    setError(null);
    try {
      const res = await fetchWithAuth('/api/calls/sessions/new', {
        method: 'POST',
        body: JSON.stringify({ callId, idempotencyKey: `mobile-${Date.now()}` }),
      });
      const data = await res.json();
      if (!res.ok || !data.sessionId || !data.sessionToken) {
        throw new Error(data.error || 'Failed to initialize Cloudflare Calls session.');
      }

      sessionIdRef.current = data.sessionId;
      sessionTokenRef.current = data.sessionToken;
      setStatus('connected');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Call connection failed.');
    }
  };

  const endCall = async () => {
    setStatus('disconnected');
    sessionIdRef.current = null;
    sessionTokenRef.current = null;
  };

  return { status, error, startCall, endCall };
}
```

---

## 5. Proprietary Ownership
**Looma Mobile App** is proprietary software owned exclusively by **Kpormegbe Gideon** / **PRIGID-WEB-CLOUD**. All Rights Reserved. NOT FOR SALE.
