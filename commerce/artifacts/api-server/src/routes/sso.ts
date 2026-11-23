import { Router, type Request, type Response } from "express";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  appSettingsTable,
  commerceSsoCodesTable,
  commerceSyncOutboxTable,
  db,
  sessionsTable,
  storesTable,
  teamMembersTable,
  usersTable,
} from "@workspace/db";
import { buildTenantUrl, sanitizeTenantSlug } from "@workspace/tenant-routing";
import { ADMIN_IDLE_TTL_MS, SESSION_COOKIE } from "../middleware/requireAdmin";
import { reconcileStoreOutbox } from "../services/firestoreSyncWorker";
import { isRateLimited } from "./auth";

const router = Router();
const SSO_CODE_TTL_MS = 60 * 1000;
const ADMIN_SESSION_ABS_TTL_MS = 24 * 60 * 60 * 1000;
const ssoExchangeMemoryRate = new Map<string, { windowStart: number; count: number }>();

function sanitizePublicLoomaUrl(raw?: string | null): string | null {
  const trimmed = (raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

async function isSsoExchangeRateLimited(req: Request): Promise<boolean> {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const clientIp = forwarded || req.ip || "unknown";
  const key = `looma_sso_exchange:${clientIp}`;
  try {
    return await isRateLimited(key, 20, 60_000);
  } catch {
    const now = Date.now();
    const existing = ssoExchangeMemoryRate.get(key);
    if (!existing || now - existing.windowStart >= 60_000) {
      ssoExchangeMemoryRate.set(key, { windowStart: now, count: 1 });
      return false;
    }
    if (existing.count >= 20) return true;
    existing.count += 1;
    return false;
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }
  return Boolean(req.secure || process.env.NODE_ENV === "production");
}

function verifyInternalSecret(req: Request, res: Response): boolean {
  const configured = (process.env.COMMERCE_INTERNAL_SSO_SECRET || "").trim();
  if (!configured) {
    res.status(503).json({ error: "COMMERCE_INTERNAL_SSO_SECRET is not configured." });
    return false;
  }
  const provided = (req.header("x-looma-internal-secret") || "").trim();
  if (!provided) {
    res.status(401).json({ error: "Missing internal SSO authentication secret." });
    return false;
  }
  const left = Buffer.from(sha256Hex(provided), "hex");
  const right = Buffer.from(sha256Hex(configured), "hex");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    res.status(403).json({ error: "Invalid internal SSO authentication secret." });
    return false;
  }
  return true;
}

export function mapLoomaRoleToCommerce(role: string): {
  systemRole: "BUSINESS_OWNER" | "BUSINESS";
  teamRole: "Owner" | "Business" | "Editor" | "Viewer";
} {
  switch ((role || "").trim().toUpperCase()) {
    case "OWNER":
      return { systemRole: "BUSINESS_OWNER", teamRole: "Owner" };
    case "ADMIN":
      return { systemRole: "BUSINESS", teamRole: "Business" };
    case "EDITOR":
      return { systemRole: "BUSINESS", teamRole: "Editor" };
    case "VIEWER":
      return { systemRole: "BUSINESS", teamRole: "Viewer" };
    default:
      throw new Error(`Unsupported Looma role for Commerce SSO: ${role}`);
  }
}

const provisionSchema = z.object({
  businessProfileId: z.string().trim().min(1).max(160),
  ownerFirebaseUid: z.string().trim().min(1).max(160),
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerName: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(120),
  currency: z.string().trim().min(3).max(8).optional().default("USD"),
});

router.post("/internal/stores/provision", async (req: Request, res: Response) => {
  if (!verifyInternalSecret(req, res)) return;

  const parsed = provisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid store provision payload.", details: parsed.error.flatten() });
  }

  const { businessProfileId, ownerFirebaseUid, ownerEmail, ownerName, slug, name, currency } = parsed.data;

  try {
    const [existingByBp] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.businessProfileId, businessProfileId))
      .limit(1);

    if (existingByBp) {
      return res.status(200).json({
        storeId: existingByBp.id,
        storeSlug: existingByBp.slug,
        alreadyProvisioned: true,
      });
    }

    const baseSlug = sanitizeTenantSlug(slug) || `bp-${randomBytes(3).toString("hex")}`;
    let finalSlug = baseSlug;
    let attempts = 0;
    while (attempts < 10) {
      const [collision] = await db
        .select({ id: storesTable.id })
        .from(storesTable)
        .where(eq(storesTable.slug, finalSlug))
        .limit(1);
      if (!collision) break;
      attempts += 1;
      finalSlug = `${baseSlug}-${randomBytes(2).toString("hex")}`;
    }

    const storeId = `store-${randomBytes(6).toString("hex")}`;
    const userId = randomUUID();
    const pubKey = `pk_live_${randomBytes(24).toString("hex")}`;
    const secretKeyHash = sha256Hex(`sk_live_${randomBytes(24).toString("hex")}`);
    const cleanCurrency = currency.toUpperCase().slice(0, 8) || "USD";

    await db.transaction(async (tx) => {
      await tx.insert(storesTable).values({
        id: storeId,
        slug: finalSlug,
        name,
        ownerId: userId,
        businessProfileId,
        ownerFirebaseUid,
        planTier: "starter",
        status: "active",
        isPublished: false,
        publishStatus: "DRAFT",
        publishableKey: pubKey,
        secretKeyHash,
        currency: cleanCurrency,
      });

      await tx.insert(usersTable).values({
        id: userId,
        storeId,
        firebaseUid: ownerFirebaseUid,
        name: ownerName,
        email: ownerEmail,
        role: "BUSINESS_OWNER",
        passwordHash: "",
      });

      await tx.insert(teamMembersTable).values({
        id: randomUUID(),
        storeId,
        name: ownerName,
        email: ownerEmail,
        role: "Owner",
        status: "Active",
      });

      await tx.insert(appSettingsTable).values([
        { id: randomUUID(), storeId, key: "store_name", value: name, updatedAt: new Date() },
        { id: randomUUID(), storeId, key: "store_email", value: ownerEmail, updatedAt: new Date() },
        { id: randomUUID(), storeId, key: "store_currency", value: cleanCurrency, updatedAt: new Date() },
        { id: randomUUID(), storeId, key: "brand_primary_color", value: "#0f172a", updatedAt: new Date() },
      ]);

      await tx.insert(commerceSyncOutboxTable).values({
        id: randomUUID(),
        aggregateType: "STORE",
        aggregateId: storeId,
        storeId,
        eventType: "STORE_PROVISIONED",
        payload: {
          storeId,
          storeSlug: finalSlug,
          businessProfileId,
          ownerFirebaseUid,
          name,
          currency: cleanCurrency,
          publishStatus: "DRAFT",
        },
        attempts: 0,
      });
    });

    return res.status(201).json({
      storeId,
      storeSlug: finalSlug,
      alreadyProvisioned: false,
    });
  } catch (err: any) {
    console.error("[Commerce Provision Store Error]", err);
    return res.status(500).json({ error: err?.message || "Failed to provision Commerce store." });
  }
});

const issueCodeSchema = z.object({
  businessProfileId: z.string().trim().min(1).max(160),
  firebaseUid: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).max(160).optional(),
  role: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]),
});

router.post("/internal/sso/issue-code", async (req: Request, res: Response) => {
  if (!verifyInternalSecret(req, res)) return;

  const parsed = issueCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid SSO issue-code payload.", details: parsed.error.flatten() });
  }

  const { businessProfileId, firebaseUid, email, displayName, role } = parsed.data;

  try {
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.businessProfileId, businessProfileId))
      .limit(1);

    if (!store) {
      return res.status(404).json({
        error: "No provisioned Commerce store found for this Business Profile.",
        code: "STORE_NOT_PROVISIONED",
      });
    }

    if (store.status === "suspended" || store.publishStatus === "SUSPENDED") {
      return res.status(403).json({ error: "Merchant store is suspended." });
    }

    const rawCode = randomBytes(32).toString("base64url");
    const codeHash = sha256Hex(rawCode);
    const expiresAt = new Date(Date.now() + SSO_CODE_TTL_MS);

    await db.insert(commerceSsoCodesTable).values({
      codeHash,
      businessProfileId,
      storeId: store.id,
      firebaseUid,
      email,
      displayName: displayName || email.split("@")[0] || "Merchant",
      role,
      expiresAt,
      consumedAt: null,
    });

    return res.status(201).json({
      code: rawCode,
      storeId: store.id,
      storeSlug: store.slug,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err: any) {
    console.error("[Commerce SSO Issue Error]", err);
    return res.status(500).json({ error: err?.message || "Failed to issue one-time SSO authorization code." });
  }
});

const revokeSessionSchema = z.object({
  businessProfileId: z.string().trim().min(1).max(160),
  firebaseUid: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  nextRole: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]).optional(),
  removeMember: z.boolean().optional(),
});

router.post("/internal/sessions/revoke", async (req: Request, res: Response) => {
  if (!verifyInternalSecret(req, res)) return;

  const parsed = revokeSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid session revocation payload." });
  }

  const { businessProfileId, firebaseUid, email, nextRole, removeMember } = parsed.data;

  try {
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.businessProfileId, businessProfileId))
      .limit(1);

    if (!store) {
      return res.json({ ok: true, revoked: 0 });
    }

    let revokedCount = 0;

    if (firebaseUid || email) {
      const targetUser = firebaseUid
        ? (
            await db
              .select()
              .from(usersTable)
              .where(and(eq(usersTable.storeId, store.id), eq(usersTable.firebaseUid, firebaseUid)))
              .limit(1)
          )[0]
        : (
            await db
              .select()
              .from(usersTable)
              .where(and(eq(usersTable.storeId, store.id), eq(usersTable.email, email!)))
              .limit(1)
          )[0];

      if (targetUser) {
        const updatedSessions = await db
          .update(sessionsTable)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessionsTable.storeId, store.id), eq(sessionsTable.userId, targetUser.id)))
          .returning();
        revokedCount += updatedSessions.length;

        const memberEmail = email || targetUser.email;
        if (removeMember) {
          await db
            .update(teamMembersTable)
            .set({ status: "Revoked" })
            .where(and(eq(teamMembersTable.storeId, store.id), eq(teamMembersTable.email, memberEmail)));
          await db
            .update(usersTable)
            .set({ role: "CUSTOMER" })
            .where(and(eq(usersTable.id, targetUser.id), eq(usersTable.storeId, store.id)));
        } else if (nextRole) {
          const mapped = mapLoomaRoleToCommerce(nextRole);
          await db
            .update(teamMembersTable)
            .set({ role: mapped.teamRole, status: "Active" })
            .where(and(eq(teamMembersTable.storeId, store.id), eq(teamMembersTable.email, memberEmail)));
          await db
            .update(usersTable)
            .set({ role: mapped.systemRole })
            .where(and(eq(usersTable.id, targetUser.id), eq(usersTable.storeId, store.id)));
        }
      }
    } else {
      const updatedSessions = await db
        .update(sessionsTable)
        .set({ revokedAt: new Date() })
        .where(eq(sessionsTable.storeId, store.id))
        .returning();
      revokedCount += updatedSessions.length;
    }

    return res.json({ ok: true, revoked: revokedCount });
  } catch (err: any) {
    console.error("[Commerce Revoke Sessions Error]", err);
    return res.status(500).json({ error: err?.message || "Failed to revoke merchant sessions." });
  }
});

const exchangeCodeSchema = z.object({
  code: z.string().trim().min(16).max(256),
});

router.get("/auth/looma/config", (_req: Request, res: Response) => {
  const loomaAppUrl = sanitizePublicLoomaUrl(
    process.env.LOOMA_APP_URL || process.env.PUBLIC_LOOMA_APP_URL || process.env.VITE_LOOMA_APP_URL
  );
  return res.json({ loomaAppUrl });
});

router.post("/auth/looma/exchange", async (req: Request, res: Response) => {
  if (await isSsoExchangeRateLimited(req)) {
    return res.status(429).json({ error: "Too many authorization attempts. Please wait a moment." });
  }

  const parsed = exchangeCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Valid one-time authorization code is required." });
  }

  const codeHash = sha256Hex(parsed.data.code);

  try {
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const [consumed] = await tx
        .update(commerceSsoCodesTable)
        .set({ consumedAt: now })
        .where(
          and(
            eq(commerceSsoCodesTable.codeHash, codeHash),
            isNull(commerceSsoCodesTable.consumedAt),
            gt(commerceSsoCodesTable.expiresAt, now)
          )
        )
        .returning();

      if (!consumed) {
        return { error: "Invalid, expired, or already used Looma authorization code.", status: 401 as const };
      }

      const [store] = await tx
        .select()
        .from(storesTable)
        .where(eq(storesTable.id, consumed.storeId))
        .limit(1);

      if (!store || store.status === "suspended" || store.publishStatus === "SUSPENDED") {
        return { error: "Target merchant store is unavailable.", status: 403 as const };
      }

      const normalizedRole = (consumed.role || "VIEWER").toUpperCase() as "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
      const mapped = mapLoomaRoleToCommerce(normalizedRole);

      let [user] = await tx
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.storeId, store.id), eq(usersTable.email, consumed.email)))
        .limit(1);

      if (!user) {
        const [createdUser] = await tx
          .insert(usersTable)
          .values({
            id: randomUUID(),
            storeId: store.id,
            firebaseUid: consumed.firebaseUid,
            name: consumed.displayName || consumed.email.split("@")[0],
            email: consumed.email,
            role: mapped.systemRole,
            passwordHash: "",
          })
          .returning();
        user = createdUser;
      } else {
        const [updatedUser] = await tx
          .update(usersTable)
          .set({
            firebaseUid: consumed.firebaseUid,
            name: consumed.displayName || user.name,
            role: mapped.systemRole,
          })
          .where(eq(usersTable.id, user.id))
          .returning();
        if (updatedUser) user = updatedUser;
      }

      const [existingMember] = await tx
        .select()
        .from(teamMembersTable)
        .where(and(eq(teamMembersTable.storeId, store.id), eq(teamMembersTable.email, consumed.email)))
        .limit(1);

      if (existingMember) {
        await tx
          .update(teamMembersTable)
          .set({
            name: consumed.displayName || existingMember.name,
            role: mapped.teamRole,
            status: "Active",
          })
          .where(eq(teamMembersTable.id, existingMember.id));
      } else {
        await tx.insert(teamMembersTable).values({
          id: randomUUID(),
          storeId: store.id,
          name: consumed.displayName || consumed.email.split("@")[0],
          email: consumed.email,
          role: mapped.teamRole,
          status: "Active",
        });
      }

      const sessionToken = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + ADMIN_SESSION_ABS_TTL_MS);
      const idleExpiresAt = new Date(Date.now() + ADMIN_IDLE_TTL_MS);

      await tx
        .delete(sessionsTable)
        .where(and(eq(sessionsTable.userId, user.id), eq(sessionsTable.storeId, store.id)));

      await tx.insert(sessionsTable).values({
        token: sha256Hex(sessionToken),
        userId: user.id,
        storeId: store.id,
        businessProfileId: consumed.businessProfileId,
        expiresAt,
        idleExpiresAt,
        revokedAt: null,
      });

      return {
        status: 200 as const,
        sessionToken,
        store,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: mapped.systemRole,
          storeId: store.id,
          businessProfileId: consumed.businessProfileId,
          teamRole: mapped.teamRole,
        },
      };
    });

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    const isHttps = isHttpsRequest(req);
    res.cookie(SESSION_COOKIE, result.sessionToken, {
      httpOnly: true,
      sameSite: isHttps ? "none" : "lax",
      secure: isHttps,
      path: "/",
      maxAge: ADMIN_SESSION_ABS_TTL_MS,
    });
    res.cookie("prigid_store_slug", result.store.slug, {
      sameSite: isHttps ? "none" : "lax",
      secure: isHttps,
      path: "/",
      maxAge: 86400 * 1000,
    });

    const hostHeader = (req.headers["x-forwarded-host"] || req.get("host") || req.hostname) as string;
    const canonicalUrl = buildTenantUrl(
      { slug: result.store.slug, customDomain: result.store.customDomain, path: "/seller" },
      hostHeader
    );

    return res.json({
      ok: true,
      sessionToken: result.sessionToken,
      storeId: result.store.id,
      storeSlug: result.store.slug,
      businessProfileId: result.user.businessProfileId,
      canonicalUrl,
      user: result.user,
    });
  } catch (err: any) {
    console.error("[Commerce SSO Exchange Error]", err);
    return res.status(500).json({ error: err?.message || "Failed to complete Looma merchant SSO exchange." });
  }
});

router.post("/internal/sync/reconcile/:storeId", async (req: Request, res: Response) => {
  if (!verifyInternalSecret(req, res)) return;
  const storeId = String(req.params.storeId || "").trim();
  if (!storeId) {
    return res.status(400).json({ error: "Store ID is required." });
  }
  try {
    const result = await reconcileStoreOutbox(storeId);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    return res.status(err?.statusCode || 500).json({ error: err?.message || "Failed to reconcile store outbox." });
  }
});

export default router;
