# Security Summary

**Reviewed Files**: 26
**Issues Resolved**: 11

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Plaintext Shared Secret in Config | `wrangler.jsonc`, `wrangler.admin.jsonc` | 35–37, 27–29 | `COMMERCE_INTERNAL_SSO_SECRET` was stored in plaintext inside checked-in Wrangler `vars`. | High | Fixed | Removed `COMMERCE_INTERNAL_SSO_SECRET` from `wrangler.jsonc` and `wrangler.admin.jsonc`, and documented `wrangler secret put` plus secret rotation in `DEPLOYMENT.md`. |
| Unauthenticated Admin Statistics Route | `commerce/artifacts/api-server/src/routes/admin-stats.ts` | 16 | `GET /api/admin/stats` returned tenant orders, revenue, product counts, and customer totals without `requireAdmin`. | High | Fixed | Added `requireAdmin` middleware to `GET /api/admin/stats` so only verified merchant team sessions for the active tenant can read stats. |
| Broken & Permissive `teamRole` Enforcement | `commerce/artifacts/api-server/src/middleware/requireAdmin.ts` | 75–227, 252 | `resolveTeamRole` always returned `"Owner"` for all `ADMIN` users regardless of `team_members` status or role, and `Editor` was blocked from `/posts`, `/products`, `/categories`, and `/newsletter`. | High | Fixed | Resolved actual `team_members` role & `"active"` status, failed closed when `ADMIN`/`SUPER_ADMIN` lacks active team membership, extracted `evaluateTeamAccess`, blocked non-Owner access to `/apikeys` and `/settings/google-config`, and enforced Viewer read-only and Editor scoped write rules. |
| Privilege Escalation via Bulk User Update | `commerce/artifacts/api-server/src/routes/store.ts` | 1291–1309 | `PUT /api/users/bulk` accepted arbitrary role values (including `ADMIN`/`PLATFORM_ADMIN`) when updating user rows. | High | Fixed | Restricted `PUT /api/users/bulk` strictly to `"CUSTOMER"` role updates on existing `"CUSTOMER"` accounts (`403` otherwise) and added strict role/status validation on `/team/invite` and `/team/:id`. |
| Session Cookie Not Cleared or Revoked on Non-Cookie Clients & Team Removal | `commerce/artifacts/api-server/src/routes/auth.ts`, `commerce/artifacts/api-server/src/routes/store.ts`, `commerce/artifacts/luxe-boutique-admin/src/contexts/AuthContext.tsx` | 87–103, 1556–1560, 16–47 | `clearSession` only checked cookies (missing `X-Seller-Token` sessions), `PUT /team/:id` did not revoke sessions when disabling/revoking staff, and client tokens were persisted in `localStorage`. | Medium | Fixed | Unified token extraction (`extractToken`) across cookies/headers for login, logout, and `/me`, revoked active sessions immediately on `Disabled`/`Revoked` team updates, and removed `localStorage` token storage in favor of `sessionStorage` + HTTP-only cookies. |
| Invite Token Exposure to Non-Owner Staff | `commerce/artifacts/api-server/src/routes/store.ts` | 1413–1456 | `GET /api/team` returned `inviteToken` and `inviteLink` to non-Owner staff (`Admin`, `Viewer`), enabling invite hijacking. | Medium | Fixed | Redacted `inviteToken` and omitted `inviteLink` unless `req.commerceAuth?.role === "Owner"`. |
| Missing Tenant Binding & Cross-Tenant Fallback on Neutral API Host | `commerce/artifacts/api-server/src/middleware/tenantContext.ts` | 78–99, 175–245 | `/api/users` and `/api/customers` lacked seller admin tenant enforcement, and `/api/auth/logout` or neutral-host seller API calls failed tenant resolution when no `X-Store-Id` header was sent. | Medium | Fixed | Added `/api/users` and `/api/customers` to `isSellerAdminPath`, enforced `TENANT_SESSION_MISMATCH` (`403`), permitted logout cleanup without store resolution, and resolved neutral-host admin requests via verified session binding. |
| Unbounded SSO Exchange Endpoint | `commerce/artifacts/api-server/src/routes/sso.ts` | 37–54, 406–410 | `POST /api/auth/looma/exchange` had no per-IP rate limiting against brute-force code guessing. | Medium | Fixed | Added `isSsoExchangeRateLimited` (20 attempts per 60s per IP with DB + in-memory fallback) returning HTTP `429`. |
| Broken Relative Redirects & Infinite Navigation Loops | `src/utils/commerceProxyLogic.ts`, `src/worker.ts`, `commerce/artifacts/luxe-boutique-admin/src/lib/loomaUrl.ts`, `commerce/artifacts/api-server/src/app.ts` | 106–128, 1938–2046, 1–99, 20–55, 200–221 | `/api/commerce/sso/authorize` fell back to relative `/seller/sso?code=...` (failing on separate origin setups), and Commerce Seller Portal linked to `/profile` and `/marketplace` on the Commerce host instead of Looma. | Medium | Fixed | Added `resolveCommerceSsoRedirectUrl` (failing closed with `503` if invalid), created `loomaUrl.ts`, and injected `<meta name="looma-app-url">` and Looma origin CORS support from Commerce Express (`app.ts`). |
| Missing `/api/posts` Proxy Allowlist Entry | `src/utils/commerceProxyLogic.ts` | 41 | Seller Portal requests to `/api/posts` through the Looma Worker returned `404` instead of forwarding to Commerce. | Low | Fixed | Added `'/api/posts'` to `COMMERCE_SELLER_API_PREFIXES` after verifying zero collision with Looma native routes. |
| Overly Permissive Client UI Navigation | `commerce/artifacts/luxe-boutique-admin/src/components/AdminGuard.tsx`, `commerce/artifacts/luxe-boutique-admin/src/pages/admin/AdminLayout.tsx` | 8–32, 75–380 | `AdminGuard` did not verify active `teamRole`, and `AdminLayout` displayed Owner/Admin tabs (`Team`, `Settings`) to `Editor`/`Viewer` staff and started SSE streams before auth resolved. | Low | Fixed | Required `teamRole` in `AdminGuard`, role-filtered `AdminLayout` navigation links, displayed the active `teamRole` badge, and gated dashboard SSE/API requests on `Boolean(user)`. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| One-Time SSO Code Issuance & Exchange | `commerce/artifacts/api-server/src/routes/sso.ts` | Uses timing-safe SHA-256 verification on `X-Looma-Internal-Secret`, stores SHA-256 code hashes with a 60-second TTL, atomically consumes codes once inside a DB transaction, and rejects `PLATFORM_ADMIN` / `SUPER_ADMIN` role escalation. |
| Business Profile Membership Authority | `src/worker.ts` | Verifies Firebase ID token (`requireVerifiedAuth`) and reads `businessProfiles` + `businessMemberships` directly from Firestore with the caller's verified Firebase identity before issuing SSO codes or revoking sessions. |
| Tenant Header Anti-Spoofing | `src/utils/commerceProxyLogic.ts`, `src/worker.ts` | Strips incoming `x-looma-*` and `x-store-id` headers plus `?storeId=` query parameters on `/api/commerce/admin/*` and Seller API proxies (`stripStoreOverride: true`). |
| Safe URL Validation & Meta Escaping | `commerce/artifacts/luxe-boutique-admin/src/lib/loomaUrl.ts`, `commerce/artifacts/api-server/src/app.ts` | Validates all `LOOMA_APP_URL` / `COMMERCE_ADMIN_DASHBOARD_URL` values to `http:`/`https:` schemes and HTML-escapes `<meta name="looma-app-url">` attributes on server injection. |

## PoC Verification

### Unauthenticated Admin Stats & Cross-Tenant Bypass Blocked
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Authentication & Tenant Session Mismatch |
| Impact | High |
| Affected File | `commerce/artifacts/api-server/src/routes/admin-stats.ts:16` |
| Test Scenario | `GET /api/admin/stats` sent without a session token, and with a `store-test-1` owner token paired with `X-Store-Id: store-test-2`. |

#### How It Was Fixed
Protected `/admin/stats` with `requireAdmin` and enforced strict session-to-tenant matching inside `tenantContext.ts`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unauthenticated `GET /api/admin/stats` hits `requireAdmin` at `requireAdmin.ts:259` | Missing token rejected with HTTP `401` |
| 2 | Authenticated `store-test-1` owner sends `X-Store-Id: store-test-2` to `tenantResolver` at `tenantContext.ts:161-172` | Store mismatch rejected with HTTP `403 TENANT_SESSION_MISMATCH` |
| 3 | Final result (`sso.test.ts` verified live against Express server) | **Handled Safely** |

#### Conclusion
**Fix Verified** - Neither unauthenticated callers nor authenticated merchants from another tenant can access `/api/admin/stats`.

---

### Non-Owner Secret Access, Team Escalation & Session Revocation Enforced
#### Summary
| Field | Value |
|---|---|
| Issue Type | Broken Role & Lifecycle Authorization |
| Impact | High |
| Affected File | `commerce/artifacts/api-server/src/middleware/requireAdmin.ts:75-227` |
| Test Scenario | `Admin`/`Editor`/`Viewer` requests against `/apikeys`, `/settings/google-config`, `/team/invite`, `PUT /users/bulk` with `role: "PLATFORM_ADMIN"`, and post-logout/post-revoke `/api/auth/me` calls. |

#### How It Was Fixed
Bound authorization decisions to active `team_members` rows checked via `evaluateTeamAccess`, blocked bulk user role escalation (`403`), revoked sessions via `X-Seller-Token` on logout and `/internal/sessions/revoke`, and returned `null` on inactive/disabled team memberships.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `Admin` attempts `POST /api/team/invite` and `GET /apikeys` | Denied at `requireAdmin.ts:173-191` with HTTP `403` |
| 2 | `Owner` calls `PUT /api/users/bulk` with `role: "PLATFORM_ADMIN"` | Denied at `store.ts:1298-1300` with HTTP `403` |
| 3 | Staff calls `POST /api/auth/logout` with `X-Seller-Token`, or Looma calls `POST /api/internal/sessions/revoke` with `removeMember: true` | Session deleted/marked `revokedAt`, `teamMembersTable` set to `Revoked`; subsequent `GET /api/auth/me` returns HTTP `401` |

#### Conclusion
**Fix Verified** - Least-privilege role boundaries, bulk escalation blocks, logout invalidation, and Looma-triggered session revocation all block unauthorized access.

---

### Plaintext Internal SSO Secret Removed & Fail-Closed SSO Redirect Verified
#### Summary
| Field | Value |
|---|---|
| Issue Type | Secret Exposure & Unsafe Redirect Resolution |
| Impact | High |
| Affected File | `wrangler.jsonc:31-37`, `src/worker.ts:1937-2046` |
| Test Scenario | Check `/api/commerce/status` and `POST /api/commerce/sso/authorize` when `COMMERCE_INTERNAL_SSO_SECRET` or `COMMERCE_ADMIN_DASHBOARD_URL` is missing/invalid vs valid Looma membership. |

#### How It Was Fixed
Removed `COMMERCE_INTERNAL_SSO_SECRET` from plaintext `wrangler*.jsonc` `vars`, enforced fail-closed `503 COMMERCE_SSO_UNCONFIGURED` when dashboard/API/secret config is incomplete or uses non-HTTP(S) schemes, and required absolute `<adminDashboardUrl>/sso?code=...` generation.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Caller invokes `POST /api/commerce/sso/authorize` with missing `COMMERCE_INTERNAL_SSO_SECRET` | Rejected at `worker.ts:1938-1946` with HTTP `503` before touching Firestore or Commerce |
| 2 | Active Owner with valid config invokes `POST /api/commerce/sso/authorize` | Returns `https://looma-commerce-api.onrender.com/seller/sso?code=...` cleanly without leaking secret |
| 3 | External host `/seller/sso` / `/seller/login` renders with unconfigured `VITE_LOOMA_APP_URL` and no `LOOMA_APP_URL` | `loomaUrl.ts:69-85` returns `null` rather than broken relative `/profile` link |

#### Conclusion
**Fix Verified** - The shared SSO secret is isolated to Cloudflare/Render secret stores, invalid configurations fail closed, and external Seller Portal links never loop on the Commerce origin.
