import { type Request, type Response, type NextFunction } from "express";
import { db, storesTable, sessionsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { extractTenantFromHost, validateTenantSlug, type TenantHostInfo } from "@workspace/tenant-routing";
import { logger } from "../lib/logger";
import { createHash } from "node:crypto";

export interface TenantRequest extends Request {
  storeId?: string;
  store?: typeof storesTable.$inferSelect;
  tenantInfo?: TenantHostInfo;
}

function sessionDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function extractToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.["luxe_session"] as string | undefined;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

function isSessionTimestampActive(session: {
  expiresAt: Date | string;
  idleExpiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
}): boolean {
  if (session.revokedAt) return false;
  const now = Date.now();
  const absExp = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(absExp) || now > absExp) return false;
  if (session.idleExpiresAt) {
    const idleExp = new Date(session.idleExpiresAt).getTime();
    if (!Number.isFinite(idleExp) || now > idleExp) return false;
  }
  return true;
}

export async function isUserAdminOfStore(req: Request, storeId: string): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;

  try {
    const rows = await db
      .select({
        user: usersTable,
        session: sessionsTable,
      })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(eq(sessionsTable.token, sessionDigest(token)))
      .limit(1);

    const row = rows[0];
    if (!row || !isSessionTimestampActive(row.session)) return false;

    const role = row.user.role?.toUpperCase();
    if (role === "PLATFORM_ADMIN") return true;
    if (row.session.storeId !== storeId) return false;
    return role === "ADMIN" || role === "SUPER_ADMIN";
  } catch (err) {
    logger.error({ err, storeId }, "Error checking admin status");
    return false;
  }
}

function isSellerAdminPath(checkPath: string): boolean {
  return (
    checkPath.startsWith("/api/admin") ||
    checkPath.startsWith("/api/settings") ||
    checkPath.startsWith("/api/team") ||
    checkPath.startsWith("/api/analytics") ||
    checkPath.startsWith("/api/apikeys") ||
    checkPath.startsWith("/api/media") ||
    checkPath.startsWith("/api/coupons") ||
    checkPath.startsWith("/api/blog") ||
    checkPath.startsWith("/api/channels") ||
    checkPath.startsWith("/api/providers") ||
    checkPath.startsWith("/api/showroom-locations") ||
    checkPath.startsWith("/api/events") ||
    checkPath.startsWith("/api/eprolo") ||
    checkPath.startsWith("/api/low-stock") ||
    checkPath.startsWith("/api/payments/providers") ||
    checkPath.startsWith("/api/payments/audit-logs") ||
    checkPath.startsWith("/api/payments/transactions") ||
    checkPath.startsWith("/api/payments/refund")
  );
}

/**
 * Middleware to resolve and enforce strict tenant isolation for all requests.
 * Rejects cross-tenant header/query overrides on admin paths and never falls back to a default store.
 */
export async function tenantResolver(req: TenantRequest, res: Response, next: NextFunction) {
  const checkPath = req.path.startsWith("/api") ? req.path : `/api${req.path}`;

  // Platform-level, Looma internal/SSO, and global marketplace routes that do not pre-bind to one store
  if (
    checkPath === "/api/health" ||
    checkPath.startsWith("/api/platform-admin") ||
    checkPath.startsWith("/api/marketplace") ||
    checkPath.startsWith("/api/internal") ||
    checkPath.startsWith("/api/auth/seller") ||
    checkPath.startsWith("/api/auth/looma") ||
    checkPath.startsWith("/api/admin/stores") ||
    checkPath.startsWith("/api/payments/webhooks")
  ) {
    return next();
  }

  const hostHeader = (req.headers["x-forwarded-host"] || req.get("host") || req.hostname) as string;
  const tenantInfo = extractTenantFromHost(hostHeader);
  req.tenantInfo = tenantInfo;

  const storeIdHeader = ((req.headers["x-store-id"] || req.query.storeId) as string | undefined)?.trim();
  const pubKeyHeader = (
    (req.headers["x-publishable-key"] ||
      req.query.publishableKey ||
      req.headers["x-api-key"]) as string | undefined
  )?.trim();
  const querySlug = (req.query.store as string | undefined)?.trim();
  const sessionToken = extractToken(req);

  try {
    let storeRecord: typeof storesTable.$inferSelect | undefined;
    let sessionBoundStoreId: string | undefined;
    let sessionRole: string | undefined;

    if (sessionToken) {
      const sessionRows = await db
        .select({
          session: sessionsTable,
          userRole: usersTable.role,
        })
        .from(sessionsTable)
        .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
        .where(eq(sessionsTable.token, sessionDigest(sessionToken)))
        .limit(1);

      const active = sessionRows[0];
      if (active && isSessionTimestampActive(active.session)) {
        sessionBoundStoreId = active.session.storeId;
        sessionRole = active.userRole?.toUpperCase();
      }
    }

    const adminPath = isSellerAdminPath(checkPath);

    // Reject client-supplied store overrides that contradict the verified session on admin routes
    if (
      adminPath &&
      sessionBoundStoreId &&
      storeIdHeader &&
      storeIdHeader !== sessionBoundStoreId &&
      sessionRole !== "PLATFORM_ADMIN"
    ) {
      return res.status(403).json({
        error: "Forbidden: Store identifier mismatch with authenticated session.",
        code: "TENANT_SESSION_MISMATCH",
      });
    }

    // 1. Prefer verified session store binding on seller/admin routes and /api/auth/me
    if ((adminPath || checkPath === "/api/auth/me" || checkPath === "/api/auth/logout") && sessionBoundStoreId) {
      const targetId =
        sessionRole === "PLATFORM_ADMIN" && storeIdHeader ? storeIdHeader : sessionBoundStoreId;
      const [found] = await db.select().from(storesTable).where(eq(storesTable.id, targetId)).limit(1);
      storeRecord = found;
    }

    // 2. If unauthenticated on /api/auth/me, fail closed with 401 rather than 404 Tenant Not Found
    if (checkPath === "/api/auth/me" && !storeRecord) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // 3. Explicit X-Store-Id or ?storeId= on non-admin or platform-admin calls
    if (!storeRecord && storeIdHeader) {
      const [found] = await db.select().from(storesTable).where(eq(storesTable.id, storeIdHeader)).limit(1);
      storeRecord = found;
    }

    // 4. Explicit Publishable Key header/query
    if (!storeRecord && pubKeyHeader) {
      const [found] = await db
        .select()
        .from(storesTable)
        .where(eq(storesTable.publishableKey, pubKeyHeader))
        .limit(1);
      storeRecord = found;
    }

    // 5. Query slug (?store=slug) or hostname subdomain slug
    const candidateSlug =
      querySlug && validateTenantSlug(querySlug)
        ? querySlug.toLowerCase()
        : tenantInfo.type === "subdomain" && tenantInfo.slug && validateTenantSlug(tenantInfo.slug)
          ? tenantInfo.slug.toLowerCase()
          : undefined;
    if (!storeRecord && candidateSlug) {
      const [found] = await db.select().from(storesTable).where(eq(storesTable.slug, candidateSlug)).limit(1);
      storeRecord = found;
    }

    // 6. Custom domain resolution
    if (!storeRecord && tenantInfo.type === "custom_domain" && tenantInfo.domain) {
      const domainToMatch = tenantInfo.domain.toLowerCase().replace(/^www\./, "");
      const [directMatch] = await db
        .select()
        .from(storesTable)
        .where(eq(storesTable.customDomain, domainToMatch))
        .limit(1);
      storeRecord = directMatch;
      if (!storeRecord) {
        const [rawMatch] = await db
          .select()
          .from(storesTable)
          .where(eq(storesTable.customDomain, tenantInfo.domain))
          .limit(1);
        storeRecord = rawMatch;
      }
    }

    if (!storeRecord) {
      if (checkPath.startsWith("/api/auth/")) {
        return res.status(401).json({
          error: "Store tenant session required.",
          code: "TENANT_RESOLUTION_FAILED",
        });
      }
      return res.status(404).json({
        error: "Tenant Not Found",
        code: "TENANT_RESOLUTION_FAILED",
        message: "Unable to identify the store tenant for this request.",
      });
    }

    // Enforce Suspended status
    if (storeRecord.status === "suspended" || storeRecord.publishStatus === "SUSPENDED") {
      return res.status(403).json({
        error: "Store Suspended",
        code: "STORE_SUSPENDED",
        message: "This boutique has been suspended. Please contact PRIGID Commerce Group support.",
      });
    }

    // Publication status enforcement for public storefront endpoints
    const isPublicStorefrontEndpoint =
      !adminPath &&
      !checkPath.startsWith("/api/auth/me") &&
      !checkPath.startsWith("/api/auth/logout") &&
      !checkPath.startsWith("/api/auth/admin");

    if (isPublicStorefrontEndpoint && storeRecord.publishStatus !== "PUBLISHED" && storeRecord.isPublished !== true) {
      const isAdmin = await isUserAdminOfStore(req, storeRecord.id);
      if (!isAdmin) {
        return res.status(403).json({
          error: "Private Atelier",
          code: "STORE_UNPUBLISHED",
          message: "This boutique is currently configuring its digital showroom and is not publicly accessible.",
          isPublished: false,
        });
      }
    }

    req.storeId = storeRecord.id;
    req.store = storeRecord;

    return next();
  } catch (error) {
    logger.error({ err: error, path: req.path }, "Tenant resolution failed");
    return res.status(500).json({ error: "Internal Server Error during tenant resolution" });
  }
}

