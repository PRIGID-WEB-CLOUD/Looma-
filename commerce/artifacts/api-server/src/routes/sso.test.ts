import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createHash, randomUUID } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-sso-test-"));
const dbFilePath = path.join(tmpDir, "db.json");

const initialDb = {
  stores: [
    {
      id: "store-test-1",
      slug: "atelier-test",
      name: "Atelier Test",
      businessProfileId: "bp-test-1",
      ownerFirebaseUid: "owner-uid-1",
      status: "active",
      isPublished: true,
      publishStatus: "PUBLISHED",
      publishableKey: "pk_test_atelier_1",
      secretKeyHash: "hash_sk_1",
      currency: "USD",
      planTier: "enterprise",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "store-test-2",
      slug: "other-maison",
      name: "Other Maison",
      businessProfileId: "bp-test-2",
      ownerFirebaseUid: "owner-uid-2",
      status: "active",
      isPublished: true,
      publishStatus: "PUBLISHED",
      publishableKey: "pk_test_other_2",
      secretKeyHash: "hash_sk_2",
      currency: "USD",
      planTier: "starter",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "store-suspended",
      slug: "suspended-atelier",
      name: "Suspended Atelier",
      businessProfileId: "bp-suspended",
      ownerFirebaseUid: "owner-uid-3",
      status: "suspended",
      isPublished: false,
      publishStatus: "SUSPENDED",
      publishableKey: "pk_test_suspended",
      secretKeyHash: "hash_sk_3",
      currency: "USD",
      planTier: "starter",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  users: [],
  sessions: [],
  team_members: [],
  commerce_sso_codes: [],
  auth_rate_limits: [],
  app_settings: [],
  commerce_sync_outbox: [],
  products: [
    {
      id: "prod-1",
      storeId: "store-test-1",
      name: "Silk Jacket",
      price: 900,
      stock: 5,
      status: "ACTIVE",
      description: "Fine silk jacket",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  categories: [],
  orders: [],
  order_items: [],
  coupons: [],
  blog_posts: [],
  media_items: [],
  api_keys: [],
  newsletter_campaigns: [],
  newsletter_subscribers: [],
  payment_provider_connections: [],
  reviews: [],
  user_push_tokens: [],
};

fs.writeFileSync(dbFilePath, JSON.stringify(initialDb, null, 2), "utf8");

delete process.env.DATABASE_URL;
process.env.DB_FALLBACK_FILE = dbFilePath;
process.env.COMMERCE_INTERNAL_SSO_SECRET = "test_internal_sso_secret_value_123";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.LOOMA_APP_URL = "https://looma.prigidcollection.workers.dev";

function sha256Hex(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

test("evaluateTeamAccess enforces exact RBAC permissions across Owner, Business, Editor, Viewer", async () => {
  const { evaluateTeamAccess } = await import("../middleware/requireAdmin");
  const { mapLoomaRoleToCommerce } = await import("./sso");

  // No PLATFORM_ADMIN escalation allowed through Looma role mapper
  assert.deepEqual(mapLoomaRoleToCommerce("owner"), { systemRole: "BUSINESS_OWNER", teamRole: "Owner" });
  assert.deepEqual(mapLoomaRoleToCommerce("ADMIN"), { systemRole: "BUSINESS", teamRole: "Business" });
  assert.deepEqual(mapLoomaRoleToCommerce("Editor"), { systemRole: "BUSINESS", teamRole: "Editor" });
  assert.deepEqual(mapLoomaRoleToCommerce("viewer"), { systemRole: "BUSINESS", teamRole: "Viewer" });
  assert.throws(() => mapLoomaRoleToCommerce("PLATFORM_ADMIN"));
  assert.throws(() => mapLoomaRoleToCommerce("SUPER_ADMIN"));
  assert.throws(() => mapLoomaRoleToCommerce("BUSINESS"));

  // Owner allowed everywhere
  assert.equal(evaluateTeamAccess("Owner", "GET", "/apikeys").allowed, true);
  assert.equal(evaluateTeamAccess("Owner", "POST", "/team/invite").allowed, true);
  assert.equal(evaluateTeamAccess("Owner", "PUT", "/settings/general").allowed, true);

  // Business blocked from secrets/keys and team/settings/payment provider writes
  assert.equal(evaluateTeamAccess("Business", "GET", "/apikeys").allowed, false);
  assert.equal(evaluateTeamAccess("Business", "GET", "/settings/google-config").allowed, false);
  assert.equal(evaluateTeamAccess("Business", "POST", "/team/invite").allowed, false);
  assert.equal(evaluateTeamAccess("Business", "PUT", "/settings/general").allowed, false);
  assert.equal(evaluateTeamAccess("Business", "POST", "/payments/providers/stripe").allowed, false);
  assert.equal(evaluateTeamAccess("Business", "POST", "/products").allowed, true);
  assert.equal(evaluateTeamAccess("Business", "PUT", "/orders/ord_1/status").allowed, true);

  // Editor allowed catalog/posts/media/coupons/newsletter writes, blocked from orders/settings/team/keys
  assert.equal(evaluateTeamAccess("Editor", "POST", "/products").allowed, true);
  assert.equal(evaluateTeamAccess("Editor", "POST", "/categories").allowed, true);
  assert.equal(evaluateTeamAccess("Editor", "POST", "/posts").allowed, true);
  assert.equal(evaluateTeamAccess("Editor", "POST", "/blog").allowed, true);
  assert.equal(evaluateTeamAccess("Editor", "POST", "/coupons").allowed, true);
  assert.equal(evaluateTeamAccess("Editor", "POST", "/media").allowed, true);
  assert.equal(evaluateTeamAccess("Editor", "POST", "/newsletter/send").allowed, true);
  assert.equal(evaluateTeamAccess("Editor", "PUT", "/orders/ord_1").allowed, false);
  assert.equal(evaluateTeamAccess("Editor", "POST", "/team/invite").allowed, false);
  assert.equal(evaluateTeamAccess("Editor", "GET", "/apikeys").allowed, false);

  // Viewer strictly read-only on non-secret endpoints
  assert.equal(evaluateTeamAccess("Viewer", "GET", "/admin/stats").allowed, true);
  assert.equal(evaluateTeamAccess("Viewer", "GET", "/products").allowed, true);
  assert.equal(evaluateTeamAccess("Viewer", "GET", "/apikeys").allowed, false);
  assert.equal(evaluateTeamAccess("Viewer", "GET", "/settings/google-config").allowed, false);
  assert.equal(evaluateTeamAccess("Viewer", "POST", "/products").allowed, false);
  assert.equal(evaluateTeamAccess("Viewer", "DELETE", "/posts/1").allowed, false);
});

test("Commerce SSO lifecycle: issue-code, exchange, cookie + X-Seller-Token auth, logout, revoke, expiry, tenant isolation, team redaction & rate limit", async () => {
  const { default: app } = await import("../app");
  const { db, commerceSsoCodesTable, sessionsTable } = await import("@workspace/db");

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 0. Public Looma config endpoint returns sanitized LOOMA_APP_URL and Seller HTML injects looma-app-url meta tag
    const cfgRes = await fetch(`${baseUrl}/api/auth/looma/config`);
    assert.equal(cfgRes.status, 200);
    assert.deepEqual(await cfgRes.json(), { loomaAppUrl: "https://looma.prigidcollection.workers.dev" });

    const sellerSsoHtmlRes = await fetch(`${baseUrl}/seller/sso?code=probe`);
    assert.equal(sellerSsoHtmlRes.status, 200);
    const sellerSsoHtml = await sellerSsoHtmlRes.text();
    assert.match(sellerSsoHtml, /<meta name="looma-app-url" content="https:\/\/looma\.prigidcollection\.workers\.dev" \/>/);

    const sellerLoginHtmlRes = await fetch(`${baseUrl}/seller/login`);
    assert.equal(sellerLoginHtmlRes.status, 200);
    assert.match(await sellerLoginHtmlRes.text(), /<meta name="looma-app-url" content="https:\/\/looma\.prigidcollection\.workers\.dev" \/>/);

    // 1. /internal/sso/issue-code rejects missing/wrong secret and suspended store
    const missingSecretRes = await fetch(`${baseUrl}/api/internal/sso/issue-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessProfileId: "bp-test-1",
        firebaseUid: "owner-uid-1",
        email: "owner@example.com",
        role: "OWNER",
      }),
    });
    assert.equal(missingSecretRes.status, 401);

    const wrongSecretRes = await fetch(`${baseUrl}/api/internal/sso/issue-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Looma-Internal-Secret": "wrong-secret",
      },
      body: JSON.stringify({
        businessProfileId: "bp-test-1",
        firebaseUid: "owner-uid-1",
        email: "owner@example.com",
        role: "OWNER",
      }),
    });
    assert.equal(wrongSecretRes.status, 403);

    const suspendedIssueRes = await fetch(`${baseUrl}/api/internal/sso/issue-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Looma-Internal-Secret": "test_internal_sso_secret_value_123",
      },
      body: JSON.stringify({
        businessProfileId: "bp-suspended",
        firebaseUid: "owner-uid-3",
        email: "suspended@example.com",
        role: "OWNER",
      }),
    });
    assert.equal(suspendedIssueRes.status, 403);

    // 2. Issue one-time SSO code for Owner & exchange -> sets cookie + sessionToken, replay rejected
    const issueOwnerRes = await fetch(`${baseUrl}/api/internal/sso/issue-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Looma-Internal-Secret": "test_internal_sso_secret_value_123",
      },
      body: JSON.stringify({
        businessProfileId: "bp-test-1",
        firebaseUid: "owner-uid-1",
        email: "owner@example.com",
        displayName: "Atelier Owner",
        role: "OWNER",
      }),
    });
    assert.equal(issueOwnerRes.status, 201);
    const issueOwnerData = (await issueOwnerRes.json()) as { code: string; storeId: string };
    assert.equal(issueOwnerData.storeId, "store-test-1");
    assert.ok(issueOwnerData.code.length > 20);

    const exchangeRes = await fetch(`${baseUrl}/api/auth/looma/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: issueOwnerData.code }),
    });
    assert.equal(exchangeRes.status, 200);
    const setCookies = exchangeRes.headers.getSetCookie?.() || [exchangeRes.headers.get("set-cookie") || ""];
    const luxeCookieHeader = setCookies.find((c) => c.startsWith("luxe_session=")) || "";
    assert.match(luxeCookieHeader, /HttpOnly/i);
    const cookiePair = luxeCookieHeader.split(";")[0];

    const exchangeJson = (await exchangeRes.json()) as {
      ok: boolean;
      sessionToken: string;
      storeId: string;
      user: { email: string; role: string; teamRole: string };
    };
    assert.equal(exchangeJson.ok, true);
    assert.equal(exchangeJson.storeId, "store-test-1");
    assert.equal(exchangeJson.user.role, "BUSINESS_OWNER");
    assert.equal(exchangeJson.user.teamRole, "Owner");

    // Code replay rejected with 401
    const replayRes = await fetch(`${baseUrl}/api/auth/looma/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: issueOwnerData.code }),
    });
    assert.equal(replayRes.status, 401);

    // 3. Expired SSO code rejected with 401
    const expiredRawCode = "expired_code_" + randomUUID();
    await db.insert(commerceSsoCodesTable).values({
      codeHash: sha256Hex(expiredRawCode),
      businessProfileId: "bp-test-1",
      storeId: "store-test-1",
      firebaseUid: "owner-uid-1",
      email: "owner@example.com",
      displayName: "Owner",
      role: "OWNER",
      expiresAt: new Date(Date.now() - 10_000),
      consumedAt: null,
    });
    const expiredExchangeRes = await fetch(`${baseUrl}/api/auth/looma/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: expiredRawCode }),
    });
    assert.equal(expiredExchangeRes.status, 401);

    // 4. GET /api/auth/me works via cookie AND X-Seller-Token, and without storeId fails closed 401 when unauthenticated
    const unauthMe = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(unauthMe.status, 401);

    const cookieMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(cookieMe.status, 200);
    assert.equal(((await cookieMe.json()) as { teamRole: string }).teamRole, "Owner");

    const tokenMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "X-Seller-Token": exchangeJson.sessionToken },
    });
    assert.equal(tokenMe.status, 200);

    // 5. Cross-tenant isolation & sensitive endpoint auth guards
    const unauthStats = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { "X-Store-Id": "store-test-1" },
    });
    assert.equal(unauthStats.status, 401);

    const unauthCartDebug = await fetch(`${baseUrl}/api/cart/debug`, {
      headers: { "X-Store-Id": "store-test-1" },
    });
    assert.equal(unauthCartDebug.status, 401);

    const unauthCartDiag = await fetch(`${baseUrl}/api/cart/diagnostic`, {
      headers: { "X-Store-Id": "store-test-1" },
    });
    assert.equal(unauthCartDiag.status, 401);

    const unauthPushList = await fetch(`${baseUrl}/api/push-tokens`, {
      headers: { "X-Store-Id": "store-test-1" },
    });
    assert.equal(unauthPushList.status, 401);

    const authCartDebug = await fetch(`${baseUrl}/api/cart/debug`, {
      headers: {
        "X-Seller-Token": exchangeJson.sessionToken,
        "X-Store-Id": "store-test-1",
      },
    });
    assert.equal(authCartDebug.status, 200);

    const authPushList = await fetch(`${baseUrl}/api/push-tokens`, {
      headers: {
        "X-Seller-Token": exchangeJson.sessionToken,
        "X-Store-Id": "store-test-1",
      },
    });
    assert.equal(authPushList.status, 200);

    const crossTenantStats = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: {
        "X-Seller-Token": exchangeJson.sessionToken,
        "X-Store-Id": "store-test-2",
      },
    });
    assert.equal(crossTenantStats.status, 403);
    assert.equal(((await crossTenantStats.json()) as { code?: string }).code, "TENANT_SESSION_MISMATCH");

    // 6. Invite Viewer & check GET /api/team inviteToken redaction + PUT /team/:id validation + /users/bulk block
    const inviteViewerRes = await fetch(`${baseUrl}/api/team/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Seller-Token": exchangeJson.sessionToken,
      },
      body: JSON.stringify({
        email: "viewer@example.com",
        name: "Store Viewer",
        role: "Viewer",
      }),
    });
    assert.equal(inviteViewerRes.status, 201);
    const invitedViewer = (await inviteViewerRes.json()) as { id: string; inviteToken: string };
    assert.ok(invitedViewer.inviteToken);

    const badRoleUpdateRes = await fetch(`${baseUrl}/api/team/${invitedViewer.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Seller-Token": exchangeJson.sessionToken,
      },
      body: JSON.stringify({ role: "PLATFORM_ADMIN" }),
    });
    assert.equal(badRoleUpdateRes.status, 400);

    const bulkEscalationRes = await fetch(`${baseUrl}/api/users/bulk`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Seller-Token": exchangeJson.sessionToken,
      },
      body: JSON.stringify({ ids: ["nonexistent"], role: "PLATFORM_ADMIN" }),
    });
    assert.equal(bulkEscalationRes.status, 403);

    const sellerProductsRes = await fetch(`${baseUrl}/api/products`, {
      headers: { "X-Seller-Token": exchangeJson.sessionToken },
    });
    assert.equal(sellerProductsRes.status, 200);

    // Issue Business SSO session and confirm Business sees redacted inviteToken on GET /api/team and cannot mutate team/settings
    const issueAdminCodeRes = await fetch(`${baseUrl}/api/internal/sso/issue-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Looma-Internal-Secret": "test_internal_sso_secret_value_123",
      },
      body: JSON.stringify({
        businessProfileId: "bp-test-1",
        firebaseUid: "admin-uid-1",
        email: "admin@example.com",
        role: "ADMIN",
      }),
    });
    const adminCode = ((await issueAdminCodeRes.json()) as { code: string }).code;
    const adminEx = await (
      await fetch(`${baseUrl}/api/auth/looma/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: adminCode }),
      })
    ).json() as { sessionToken: string; user: { role: string; teamRole: string } };
    assert.equal(adminEx.user.role, "BUSINESS");
    assert.equal(adminEx.user.teamRole, "Business");

    const adminTeamList = await (
      await fetch(`${baseUrl}/api/team`, {
        headers: { "X-Seller-Token": adminEx.sessionToken },
      })
    ).json() as Array<{ email: string; inviteToken: string | null }>;
    const viewerRowForAdmin = adminTeamList.find((m) => m.email === "viewer@example.com");
    assert.ok(viewerRowForAdmin);
    assert.equal(viewerRowForAdmin.inviteToken, null);

    const adminForbiddenTeamWrite = await fetch(`${baseUrl}/api/team/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Seller-Token": adminEx.sessionToken,
      },
      body: JSON.stringify({ email: "x@example.com", role: "Editor" }),
    });
    assert.equal(adminForbiddenTeamWrite.status, 403);

    // 7. POST /api/auth/logout clears session when using X-Seller-Token header even without cookie
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "X-Seller-Token": adminEx.sessionToken },
    });
    assert.equal(logoutRes.status, 200);
    const adminMeAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "X-Seller-Token": adminEx.sessionToken },
    });
    assert.equal(adminMeAfterLogout.status, 401);

    // 8. Looma revocation via /internal/sessions/revoke immediately locks out Owner's session
    const revokeRes = await fetch(`${baseUrl}/api/internal/sessions/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Looma-Internal-Secret": "test_internal_sso_secret_value_123",
      },
      body: JSON.stringify({
        businessProfileId: "bp-test-1",
        firebaseUid: "owner-uid-1",
        email: "owner@example.com",
        removeMember: true,
      }),
    });
    assert.equal(revokeRes.status, 200);
    const ownerMeAfterRevoke = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "X-Seller-Token": exchangeJson.sessionToken },
    });
    assert.equal(ownerMeAfterRevoke.status, 401);

    // 9. Idle expiration check
    const rawExpiredIdleToken = "idle_expired_token_" + randomUUID();
    // Create an Editor session with expired idleExpiresAt
    const issueEdRes = await fetch(`${baseUrl}/api/internal/sso/issue-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Looma-Internal-Secret": "test_internal_sso_secret_value_123",
      },
      body: JSON.stringify({
        businessProfileId: "bp-test-1",
        firebaseUid: "editor-uid-1",
        email: "editor@example.com",
        role: "EDITOR",
      }),
    });
    const edCode = ((await issueEdRes.json()) as { code: string }).code;
    const edEx = await (
      await fetch(`${baseUrl}/api/auth/looma/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: edCode }),
      })
    ).json() as { sessionToken: string; user: { id: string } };

    // Expire idleExpiresAt directly in DB
    const { eq } = await import("drizzle-orm");
    await db
      .update(sessionsTable)
      .set({ idleExpiresAt: new Date(Date.now() - 5000) })
      .where(eq(sessionsTable.token, sha256Hex(edEx.sessionToken)));

    const expiredIdleMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "X-Seller-Token": edEx.sessionToken },
    });
    assert.equal(expiredIdleMe.status, 401);

    // Also test non-existent idle token still fails closed
    const badTokMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "X-Seller-Token": rawExpiredIdleToken },
    });
    assert.equal(badTokMe.status, 401);

    // 10. Rate limit on /api/auth/looma/exchange (20 req/min per IP -> 21st returns 429)
    let gotRateLimited = false;
    for (let i = 0; i < 25; i++) {
      const rlRes = await fetch(`${baseUrl}/api/auth/looma/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.77",
        },
        body: JSON.stringify({ code: "invalid_code_padding_123456" }),
      });
      if (rlRes.status === 429) {
        gotRateLimited = true;
        break;
      }
    }
    assert.equal(gotRateLimited, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
