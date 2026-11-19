import { Router, type Response } from "express";
import { createHash, randomBytes, randomUUID } from "crypto";
import { db, usersTable, sessionsTable, authRateLimitsTable, appSettingsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { SESSION_COOKIE, getSessionUser, requireAdmin } from "../middleware/requireAdmin";
import { validate } from "../middleware/validate";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sendEmail, buildWelcomeEmail, getStoreUrl, loadBrandingCache, getBranding } from "../services/mailer";
import {
  sendWhatsAppNotification,
  buildWhatsAppWelcomeMessage,
} from "../services/whatsappService";
import { type TenantRequest } from "../middleware/tenantContext";
import { verifyFirebaseIdToken } from "../services/firebaseAuth";

const router = Router();
const PASSWORD_SCHEMA = z.string().min(8).max(128);
const emailSchema = z.string().trim().toLowerCase().email();

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function isRateLimited(key: string, limit: number, windowMs: number) {
  const now = new Date();
  const [entry] = await db.select().from(authRateLimitsTable)
    .where(eq(authRateLimitsTable.key, key)).limit(1);
  if (!entry || now.getTime() - entry.windowStart.getTime() >= windowMs) {
    await db.insert(authRateLimitsTable).values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({ target: authRateLimitsTable.key, set: { windowStart: now, count: 1 } });
    return false;
  }
  if (entry.count >= limit) {
    return true;
  }
  await db.update(authRateLimitsTable).set({ count: entry.count + 1 })
    .where(eq(authRateLimitsTable.key, key));
  return false;
}

async function setSession(
  res: Response,
  userId: string,
  storeId: string,
  options?: { businessProfileId?: string | null; isAdminSession?: boolean }
) {
  const token = randomBytes(32).toString("base64url");
  const isAdminSession = Boolean(options?.isAdminSession);
  const absTtlMs = isAdminSession ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + absTtlMs);
  const idleExpiresAt = isAdminSession ? new Date(Date.now() + 4 * 60 * 60 * 1000) : null;

  await db.delete(sessionsTable).where(and(eq(sessionsTable.userId, userId), eq(sessionsTable.storeId, storeId)));
  await db.insert(sessionsTable).values({
    token: digest(token),
    userId,
    storeId,
    businessProfileId: options?.businessProfileId ?? null,
    expiresAt,
    idleExpiresAt,
    revokedAt: null,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: absTtlMs,
  });
  return token;
}

async function clearSession(req: TenantRequest, res: Response) {
  let token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }
  if (token) {
    const storeId = req.storeId!;
    let filters = eq(sessionsTable.token, digest(token));
    filters = and(filters, eq(sessionsTable.storeId, storeId));
    await db.delete(sessionsTable).where(filters);
  }
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

const registerSchema = z.object({ name: z.string().trim().min(1).max(120), email: emailSchema, password: PASSWORD_SCHEMA });
router.get("/auth/me", async (req: TenantRequest, res: Response) => {
  const user = await getSessionUser(req, req.storeId);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  return res.json(user);
});

router.post("/auth/seller/register", async (_req: any, res: Response) => {
  return res.status(410).json({
    error: "Standalone seller registration is disabled. Merchant stores are provisioned automatically through your Looma Business Profile.",
  });
});

router.post("/auth/seller/login", async (_req: any, res: Response) => {
  return res.status(410).json({
    error: "Standalone seller password login is disabled. Seller portal access is managed exclusively via Looma Business Profile SSO.",
  });
});

router.post("/auth/register", async (_req: any, res: Response) => {
  return res.status(410).json({
    error: "Standalone storefront customer registration is deprecated. Customers authenticate seamlessly through their verified Looma account via /api/auth/firebase.",
  });
});

router.post("/auth/login", async (_req: any, res: Response) => {
  return res.status(410).json({
    error: "Standalone storefront customer password login is deprecated. Customers authenticate seamlessly through their verified Looma account via /api/auth/firebase.",
  });
});

const firebaseAuthSchema = z.object({
  idToken: z.string().min(10),
});

router.post("/auth/firebase", validate(firebaseAuthSchema), async (req: TenantRequest, res: Response) => {
  const storeId = req.storeId!;
  const { idToken } = req.body;
  
  let verified;
  try {
    verified = await verifyFirebaseIdToken(idToken);
  } catch (err: any) {
    return res.status(401).json({ error: err.message || "Invalid or unverified Firebase ID token." });
  }

  const { email, name, uid } = verified;
  
  let [user] = await db.select().from(usersTable).where(and(eq(usersTable.email, email), eq(usersTable.storeId, storeId))).limit(1);
  if (!user) {
    const userId = uid || randomUUID();
    const newUser = {
      id: userId,
      storeId,
      firebaseUid: uid,
      name: name || email.split("@")[0] || "Valued Customer",
      email,
      role: "CUSTOMER" as const,
      passwordHash: "",
    };
    await db.insert(usersTable).values(newUser);
    user = newUser;

    // Dispatch welcome email asynchronously for new user
    Promise.all([getStoreUrl(storeId), loadBrandingCache(storeId)]).then(([storeUrl]) => {
      const storeName = getBranding(storeId).store_name;
      sendEmail({ to: newUser.email, ...buildWelcomeEmail({ name: newUser.name, email: newUser.email, storeUrl, storeId, storeName }), storeId }).catch(() => {});
    }).catch(() => {});
  } else if (!user.firebaseUid) {
    await db.update(usersTable).set({ firebaseUid: uid }).where(eq(usersTable.id, user.id)).catch(() => {});
  }
  
  const isAdminUser = ["ADMIN", "SUPER_ADMIN", "PLATFORM_ADMIN"].includes((user.role || "").toUpperCase());
  await setSession(res, user.id, storeId, { isAdminSession: isAdminUser });
  const { passwordHash: _, ...safe } = user;
  return res.json(safe);
});

router.post("/auth/logout", async (req: TenantRequest, res: Response) => { await clearSession(req, res); return res.json({ ok: true }); });
router.post("/auth/logout-all", requireAdmin, async (req: TenantRequest, res: Response) => {
  const storeId = req.storeId!;
  await db.delete(sessionsTable).where(and(eq(sessionsTable.userId, req.adminUser!.id), eq(sessionsTable.storeId, storeId)));
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res.json({ ok: true });
});

router.get("/auth/admin/exists", async (req: TenantRequest, res: Response) => {
  const storeId = req.storeId!;
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.storeId, storeId),
      inArray(usersTable.role, ["ADMIN", "SUPER_ADMIN", "PLATFORM_ADMIN"])
    ));
  return res.json({
    exists: rows.length > 0,
    admins: [],
  });
});

router.post("/auth/admin/quick-login", async (_req: TenantRequest, res: Response) => {
  return res.status(410).json({
    error: "Quick-login bypass is permanently removed. Seller portal access is managed exclusively via Looma Business Profile SSO.",
  });
});

router.post("/auth/admin/bootstrap", async (_req: TenantRequest, res: Response) => {
  return res.status(410).json({
    error: "Admin bootstrap is disabled. Store administration is managed through Looma Business Profiles.",
  });
});

router.post("/auth/admin/request-otp", async (_req: TenantRequest, res: Response) => {
  return res.status(410).json({
    error: "Standalone OTP authentication is disabled. Seller portal access is managed exclusively via Looma Business Profile SSO.",
  });
});

router.post("/auth/admin/verify-otp", async (_req: TenantRequest, res: Response) => {
  return res.status(410).json({
    error: "Standalone OTP verification is disabled. Seller portal access is managed exclusively via Looma Business Profile SSO.",
  });
});

router.post("/auth/forgot-password", async (_req: TenantRequest, res: Response) => {
  return res.status(410).json({
    error: "Standalone password reset is disabled. Account authentication is managed via Looma Auth.",
  });
});

router.post("/auth/reset-password", async (_req: TenantRequest, res: Response) => {
  return res.status(410).json({
    error: "Standalone password reset is disabled. Account authentication is managed via Looma Auth.",
  });
});

router.get("/auth/google", async (req: TenantRequest, res: Response) => {
  const storeId = req.storeId!;
  const returnUrl = (req.query.returnUrl as string) || "";
  
  // 1. Fetch Google Client Credentials (Database per-tenant first, Env fallback)
  const [dbClientId] = await db.select()
    .from(appSettingsTable)
    .where(and(eq(appSettingsTable.storeId, storeId), eq(appSettingsTable.key, "google_client_id")))
    .limit(1);
  const clientId = dbClientId?.value || process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.redirect("/?auth_error=google_not_configured");
  }

  // 2. Build redirect details
  const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
  
  // Bundle storeId and returnUrl in the state so we can restore context in callback
  const statePayload = Buffer.from(JSON.stringify({ storeId, returnUrl })).toString("base64url");
  
  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", statePayload);
  googleAuthUrl.searchParams.set("prompt", "select_account");

  return res.redirect(googleAuthUrl.toString());
});

router.get("/auth/google/callback", async (req: TenantRequest, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) {
    return res.redirect("/?auth_error=invalid_callback_params");
  }

  try {
    // 1. Decode the state parameter
    const stateJson = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const { storeId, returnUrl } = stateJson as { storeId: string; returnUrl: string };
    if (!storeId) {
      return res.redirect("/?auth_error=invalid_store_context");
    }

    // 2. Get Google Client Credentials (DB per-tenant first, env fallback)
    const rows = await db.select()
      .from(appSettingsTable)
      .where(and(eq(appSettingsTable.storeId, storeId), inArray(appSettingsTable.key, ["google_client_id", "google_client_secret"])));
    const config = Object.fromEntries(rows.map(r => [r.key, r.value]));

    const clientId = config.google_client_id || process.env.GOOGLE_CLIENT_ID;
    let clientSecret: string | undefined;
    if (config.google_client_secret) {
      const { decryptCredential } = await import("../services/credentialVault");
      clientSecret = decryptCredential(config.google_client_secret);
    }
    if (!clientSecret) {
      clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    }

    if (!clientId || !clientSecret) {
      return res.redirect("/?auth_error=google_credentials_missing");
    }

    // 3. Exchange code for access_token
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("[Google OAuth Callback] Token exchange failed:", errText);
      return res.redirect("/?auth_error=token_exchange_failed");
    }

    const tokenData = await tokenResponse.json() as { access_token: string };

    // 4. Fetch userinfo using access_token
    const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoResponse.ok) {
      return res.redirect("/?auth_error=userinfo_fetch_failed");
    }

    const profile = await userinfoResponse.json() as { id: string; email: string; name: string; picture?: string };
    const email = profile.email.trim().toLowerCase();

    // 5. Look up or create user in usersTable
    let [user] = await db.select()
      .from(usersTable)
      .where(and(eq(usersTable.email, email), eq(usersTable.storeId, storeId)))
      .limit(1);

    if (!user) {
      const generatedPassword = randomBytes(24).toString("hex");
      const passwordHash = await bcrypt.hash(generatedPassword, 10);
      const [newUser] = await db.insert(usersTable).values({
        id: randomUUID(),
        storeId,
        email,
        name: profile.name || email.split("@")[0],
        role: "CUSTOMER",
        passwordHash,
      }).returning();
      user = newUser;

      // Send Welcome Email asynchronously
      Promise.all([getStoreUrl(storeId), loadBrandingCache(storeId)]).then(([storeUrl]) => {
        const storeName = getBranding(storeId).store_name;
        sendEmail({
          to: user.email,
          ...buildWelcomeEmail({ name: user.name, email: user.email, storeUrl, storeId, storeName }),
          storeId
        }).catch(() => {});
      }).catch(err => console.error("Failed to send welcome email for oauth user:", err));
    }

    // 6. Establish Session and Redirect Back
    await setSession(res, user.id, storeId);
    
    // Construct safe return URL
    const destination = returnUrl || "/account";
    return res.redirect(destination);
  } catch (err: any) {
    console.error("[Google OAuth Callback] Error:", err?.message || err);
    return res.redirect("/?auth_error=callback_processing_failed");
  }
});
export { requireAdmin, getSessionUser };
export default router;
