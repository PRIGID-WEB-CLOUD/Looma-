# Looma Database Documentation

Looma uses **Cloud Firestore** (database configured in `firebase-applet-config.json`), governed by `firebase-blueprint.json`, `firestore.rules`, and `security_spec.md`.

## Collections Overview

| Path | Purpose | Access Control |
| :--- | :--- | :--- |
| `/users/{userId}` | Public creator profile (`displayName`, `handle`, `avatarUrl`, `bio`, counts) | Authenticated read; owner-only write with immutable `uid` & server/guarded counters |
| `/users/{userId}/private/{docId}` | Private PII (`email`, `pushEnabled`, `themePreference`) | Strictly `request.auth.uid == userId` |
| `/users/{userId}/following/{targetUid}` | Follow relationships | Authenticated read; owner write (`userId != targetUid`) |
| `/users/{userId}/notifications/{notifId}` | In-app notifications (`like`, `comment`, `follow`, `message`, `call`) | Owner read/update/delete; authenticated actor create (`actorId == auth.uid`) |
| `/posts/{postId}` | Feed posts (`caption`, `mediaUrl`, `mediaType`, `category`, `likesCount`) | Authenticated read; author create/delete; atomic `+1/-1` like counter updates |
| `/posts/{postId}/likes/{uid}` | Post like markers | Authenticated read; `uid == auth.uid` create/delete |
| `/posts/{postId}/comments/{commentId}` | Post comments | Authenticated read; author create/delete |
| `/stories/{storyId}` | 24-hour expiring stories (`expiresAtMs` capped at ~25h) | Authenticated read; author create/delete |
| `/chats/{chatId}` | Direct & group chat metadata (`memberIds`, `adminIds`, `title`) | Members-only read/update; admin rules for group management |
| `/chats/{chatId}/messages/{messageId}` | Chat messages | Members-only read; sender create (`senderId == auth.uid`) |
| `/calls/{callId}` | Call room signaling & active state | Call participants (`memberIds` / `callerId` / `calleeId`) only |
| `/calls/{callId}/peers/{uid}` | Peer SFU `cfSessionId` & track names | Call participants read; `uid == auth.uid` write |

See [security_spec.md](../security_spec.md) and [firestore.rules](../firestore.rules) for all invariant checks and validation rules.
