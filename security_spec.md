# Looma Firestore Security Specification

## 1. Data Invariants
1. **Identity Integrity**: Every document created by a user (`UserProfile.uid`, `Post.authorId`, `PostComment.authorId`, `PostLike.userId`, `ChatMessage.senderId`, `AppNotification.actorId`) must strictly equal `request.auth.uid` on creation and remain immutable on updates.
2. **PII Isolation**: Sensitive user data (`email`, `pushEnabled`, `themePreference`) is stored strictly inside `/users/{userId}/private/{docId}` and is readable/writable exclusively by `request.auth.uid == userId`. Public `/users/{userId}` documents contain zero PII.
3. **Bounded Arrays & String Lengths**: Every string enforces explicit `.size()` bounds matching `firebase-blueprint.json`. Arrays (`interests` max 8, `memberIds` max 10) are bounded and first-element type checked.
4. **Atomic Interaction Sync**: Incrementing `Post.likesCount` requires `existsAfter` on `/posts/{postId}/likes/{uid}`; decrementing requires `!existsAfter`.
5. **Chat Thread Membership & Group Admins**: Only UIDs present in `ChatThread.memberIds` can list, read, or post messages inside `/chats/{chatId}/messages/{messageId}`. Group renames, additions, kicks, and admin promotions require `request.auth.uid in existing().adminIds`; non-admin members may only remove themselves (`self-leave`).
6. **Temporal Integrity**: `createdAt == request.time` on creation and immutable afterward; `updatedAt == request.time` on writes. Stories cap `expiresAtMs` to at most ~25 hours from `request.time`.
7. **Server-Derived / Protected Follower Counters**: Clients cannot arbitrarily mutate `UserProfile.followersCount` via direct profile updates, and self-follow (`userId == targetUid`) is denied.
8. **Admin RBAC & Audit Immutability**: Platform administration (`isAdmin()`) requires `request.auth.token.email_verified == true` AND either a verified allowlisted operator email or an explicit `/admins/{uid}` record. Admins cannot suspend/demote themselves (`targetUid != request.auth.uid`), and `/adminAuditLogs/{logId}` entries are strictly append-only (`update, delete: if false`).
9. **Verification Badge Authority**: Users cannot self-assign `UserProfile.isVerified = true` or approve `/verificationRequests/{requestId}`. Users may only submit `status: 'pending'` verification requests with 1–2 valid HTTP/HTTPS links; only `isAdmin()` may transition a pending request to `'approved'` or `'rejected'` and grant `isVerified` on `/users/{userId}`.
10. **Marketplace Multi-Tenancy & Order PII Isolation**: Public storefront reads on `/marketplaceStores` and `/marketplaceProducts` require `publishStatus == 'PUBLISHED'` / `status == 'ACTIVE'` unless caller is the store `ownerUid` or `isAdmin()`. Store `verified` and `featured` flags, as well as `SUSPENDED` overrides, are strictly `isAdmin()`-governed. `/marketplaceOrders` contains shipping PII and is readable/listable strictly by `buyerUid`, `storeOwnerUid` (verified on create against the parent `/marketplaceStores/{storeId}.ownerUid`), or `isAdmin()`.

## 2. The "Dirty Dozen+" Attack Payloads (Expected: PERMISSION_DENIED)
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
13. **Followers Count Tampering**: `UPDATE /users/attacker` setting `followersCount: 999999` -> Denied (`followersCount` immutable on profile update).
14. **Self-Follow Abuse**: `POST /users/u1/following/u1` -> Denied by `userId != targetUid`.
15. **Non-Admin Group Hijack**: Non-admin member updating `title` or removing another member in `/chats/g1` -> Denied.
16. **Permanent Story TTL Spoof**: `POST /stories/s1` with `expiresAtMs` 10 years in the future -> Denied.
17. **Non-Admin Privilege Escalation**: Non-admin granting themselves `/admins/{uid}` or toggling `/adminConfig/featureFlags` -> Denied by `isAdmin()`.
18. **Audit Log Tampering**: Even an administrator attempting `UPDATE` or `DELETE` on `/adminAuditLogs/{logId}` -> Denied (`if false`).
19. **Self-Verification Escalation**: User setting `isVerified: true` on `/users/{uid}` or creating `/verificationRequests/{id}` with `status: 'approved'` -> Denied.
20. **Re-Reviewing Closed Verification Request**: Updating `/verificationRequests/{id}` once `status` is `'approved'` or `'rejected'` -> Denied by terminal lock `existing().status == 'pending'`.
21. **Marketplace Order PII Scraping**: Any third-party user attempting `GET` or `LIST` on `/marketplaceOrders` where neither `buyerUid` nor `storeOwnerUid` matches `request.auth.uid` -> Denied.
22. **Fake Store Product Injection**: Attacker creating `/marketplaceProducts/p1` pointing to another merchant's `storeId` -> Denied by Master Gate `get(/marketplaceStores/$(storeId)).data.ownerUid == request.auth.uid`.
23. **Self-Paid Order Spoofing**: Buyer creating `/marketplaceOrders/o1` with `paymentStatus: 'paid'` or `status: 'DELIVERED'` directly via client SDK -> Denied.
