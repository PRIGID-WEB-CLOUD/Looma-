# Looma Firestore Security Specification

## 1. Data Invariants
1. **Identity Integrity**: Every document created by a user (`UserProfile.uid`, `Post.authorId`, `PostComment.authorId`, `PostLike.userId`, `ChatMessage.senderId`, `AppNotification.actorId`) must strictly equal `request.auth.uid` on creation and remain immutable on updates.
2. **PII Isolation**: Sensitive user data (`email`, `pushEnabled`, `themePreference`) is stored strictly inside `/users/{userId}/private/{docId}` and is readable/writable exclusively by `request.auth.uid == userId`. Public `/users/{userId}` documents contain zero PII.
3. **Bounded Arrays & String Lengths**: Every string enforces explicit `.size()` bounds matching `firebase-blueprint.json`. Arrays (`interests` max 8, `memberIds` max 10) are bounded and first-element type checked.
4. **Atomic Interaction Sync**: Incrementing `Post.likesCount` requires `existsAfter` on `/posts/{postId}/likes/{uid}`; decrementing requires `!existsAfter`.
5. **Chat Thread Membership**: Only UIDs present in `ChatThread.memberIds` can list, read, or post messages inside `/chats/{chatId}/messages/{messageId}`.
6. **Temporal Integrity**: `createdAt == request.time` on creation and immutable afterward; `updatedAt == request.time` on writes.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Post Write**: `POST /posts/p1` with `request.auth == null` -> Denied.
2. **Unverified Email Write**: `POST /posts/p1` with `email_verified: false` -> Denied.
3. **Author Spoofing**: `POST /posts/p1` with `authorId: "victim_uid"` != `request.auth.uid` -> Denied.
4. **Shadow Field Injection**: `POST /posts/p1` including extra field `isVerified: true` -> Denied by `keys().hasOnly(...)`.
5. **Oversized ID Poisoning**: `POST /posts/${'a'.repeat(200)}` -> Denied by `isValidId()`.
6. **Oversized Caption Resource Exhaustion**: `POST /posts/p1` with `caption` of 5,000 chars -> Denied by `size() <= 1200`.
7. **PII Cross-Read**: `GET /users/victim/private/settings` as `attacker` -> Denied by `isOwner(userId)`.
8. **Client-Forged Timestamp**: `POST /posts/p1` with `createdAt: Timestamp(2020-01-01)` != `request.time` -> Denied.
9. **Unauthorized Post Edit**: `UPDATE /posts/p1` changing `caption` when `existing().authorId != request.auth.uid` -> Denied.
10. **Arbitrary Likes Inflation**: `UPDATE /posts/p1` setting `likesCount: 99999` -> Denied by `+1/-1` + `existsAfter` atomicity gate.
11. **Chat Eavesdropping**: `GET /chats/private_chat/messages/m1` when `request.auth.uid` is not in `ChatThread.memberIds` -> Denied.
12. **Notification Hijack**: `UPDATE /users/victim/notifications/n1` marking `read: true` as `attacker` -> Denied by `isOwner(userId)`.
