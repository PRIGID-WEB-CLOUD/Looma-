import { type Request, type Response, type NextFunction } from "express";
import { db, sessionsTable, usersTable, teamMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { createHash } from "node:crypto";
import { type TenantRequest } from "./tenantContext";

export const SESSION_COOKIE = "luxe_session";
export const ADMIN_IDLE_TTL_MS = 4 * 60 * 60 * 1000;

function sessionDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type UserRole = "CUSTOMER" | "BUSINESS" | "BUSINESS_OWNER" | "PLATFORM_ADMIN";
export type TeamRole = "Owner" | "Business" | "Editor" | "Viewer";

export interface CommerceAuthContext {
  storeId: string;
  businessProfileId?: string | null;
  role: TeamRole;
  uid: string;
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  storeId?: string | null;
  businessProfileId?: string | null;
  firebaseUid?: string | null;
  teamRole?: TeamRole;
}

declare global {
  namespace Express {
    interface Request {
      adminUser?: StoredUser;
      commerceAuth?: CommerceAuthContext;
    }
  }
}

function isSessionActive(session: {
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

async function slideIdleExpiration(
  tokenHash: string,
  expiresAt: Date | string,
  idleExpiresAt?: Date | string | null
) {
  if (!idleExpiresAt) return;
  const absMs = new Date(expiresAt).getTime();
  const nextIdle = new Date(Math.min(Date.now() + ADMIN_IDLE_TTL_MS, absMs));
  await db
    .update(sessionsTable)
    .set({ idleExpiresAt: nextIdle })
    .where(eq(sessionsTable.token, tokenHash))
    .catch(() => {});
}

export async function resolveTeamRole(
  email: string,
  systemRole: UserRole,
  storeId?: string | null
): Promise<TeamRole | null> {
  if (systemRole === "PLATFORM_ADMIN") {
    return "Owner";
  }

  if (systemRole !== "BUSINESS" && systemRole !== "BUSINESS_OWNER") {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const filter = storeId
    ? and(eq(teamMembersTable.email, normalizedEmail), eq(teamMembersTable.storeId, storeId))
    : eq(teamMembersTable.email, normalizedEmail);

  const [member] = await db
    .select({ role: teamMembersTable.role, status: teamMembersTable.status })
    .from(teamMembersTable)
    .where(filter)
    .limit(1);

  if (member) {
    const status = (member.status || "").trim().toLowerCase();
    if (status !== "active") {
      return null;
    }
    const r = member.role.trim().toLowerCase();
    if (r === "owner") return "Owner";
    if (r === "business" || r === "admin") return "Business";
    if (r === "editor") return "Editor";
    if (r === "viewer") return "Viewer";
    return null;
  }

  // Legacy fallback: BUSINESS_OWNER store creator without a teamMembersTable row
  if (systemRole === "BUSINESS_OWNER") {
    return "Owner";
  }

  // Fail closed when no active team membership exists for BUSINESS
  return null;
}

function toStoredUser(
  user: typeof usersTable.$inferSelect,
  teamRole?: TeamRole | null,
  businessProfileId?: string | null
): StoredUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    storeId: user.storeId,
    businessProfileId: businessProfileId ?? null,
    firebaseUid: user.firebaseUid ?? null,
    teamRole: teamRole ?? undefined,
  };
}

export function extractToken(req: Pick<Request, "headers" | "cookies"> & { header?: (name: string) => string | undefined }): string | undefined {
  const customHeader = (req.headers["x-seller-token"] || req.headers["x-seller-session-token"]) as string | undefined;
  if (customHeader && customHeader.trim()) return customHeader.trim();

  const authHeader = req.headers.authorization || (typeof req.header === "function" ? req.header("authorization") : undefined);
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) return match[1].trim();
  }

  const cookieToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (cookieToken && cookieToken.trim()) return cookieToken.trim();

  return undefined;
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function evaluateTeamAccess(
  teamRole: TeamRole,
  method: string,
  reqPath: string,
  systemRole?: UserRole
): { allowed: boolean; error?: string } {
  const upperMethod = (method || "GET").toUpperCase();
  const normalizedPath = (reqPath || "/").split("?")[0].toLowerCase();
  const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(upperMethod);

  if (systemRole === "PLATFORM_ADMIN" || teamRole === "Owner") {
    return { allowed: true };
  }

  // Secret & credential configuration routes are strictly Owner-only (including reads)
  if (
    matchesPrefix(normalizedPath, "/apikeys") ||
    matchesPrefix(normalizedPath, "/settings/google-config") ||
    normalizedPath.includes("/keys")
  ) {
    return {
      allowed: false,
      error: "Access Denied: Only the store Owner is authorized to access API keys and credential settings.",
    };
  }

  // Team, settings, and payment provider mutations are strictly Owner-only
  const ownerOnlyWritePrefixes = ["/apikeys", "/settings", "/team", "/payments/providers"];
  if (isMutation && ownerOnlyWritePrefixes.some((p) => matchesPrefix(normalizedPath, p))) {
    return {
      allowed: false,
      error: "Access Denied: Only the store Owner is authorized to perform this administrative change.",
    };
  }

  if (teamRole === "Viewer") {
    if (isMutation) {
      return {
        allowed: false,
        error: "Access Denied: Viewers do not have permission to make changes.",
      };
    }
    return { allowed: true };
  }

  if (teamRole === "Editor") {
    if (isMutation) {
      const allowedWritePaths = [
        "/media",
        "/blog",
        "/posts",
        "/coupons",
        "/upload",
        "/uploads",
        "/products",
        "/categories",
        "/newsletter",
      ];
      if (!allowedWritePaths.some((p) => matchesPrefix(normalizedPath, p))) {
        return {
          allowed: false,
          error: "Access Denied: Editors are restricted to catalog, blog posts, newsletters, coupons, and media assets.",
        };
      }
    }
    return { allowed: true };
  }

  return { allowed: true };
}

export async function getSessionUser(req: Request, storeId?: string): Promise<StoredUser | null> {
  const token = extractToken(req);
  if (!token) return null;

  const rows = await db
    .select({ user: usersTable, session: sessionsTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(eq(sessionsTable.token, sessionDigest(token)))
    .limit(1);
  const row = rows[0];
  if (!row || !isSessionActive(row.session)) return null;

  // Cross-tenant isolation: only PLATFORM_ADMIN may operate across tenants
  if (storeId && row.user.role !== "PLATFORM_ADMIN" && row.session.storeId !== storeId) {
    return null;
  }

  const systemRole = row.user.role as UserRole;
  const effectiveStoreId = storeId || row.session.storeId || row.user.storeId;
  const teamRole = await resolveTeamRole(row.user.email, systemRole, effectiveStoreId);

  // Fail closed for merchant accounts whose team membership was revoked or disabled
  if ((systemRole === "BUSINESS" || systemRole === "BUSINESS_OWNER") && !teamRole) {
    return null;
  }

  return toStoredUser(row.user, teamRole, row.session.businessProfileId);
}

export async function requireAdmin(req: TenantRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required." });

  const tokenHash = sessionDigest(token);
  const storeId = req.storeId;

  const rows = await db
    .select({ user: usersTable, session: sessionsTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(eq(sessionsTable.token, tokenHash))
    .limit(1);

  const row = rows[0];

  if (!row) return res.status(401).json({ error: "Session expired or invalid for this store — please log in again." });
  if (!isSessionActive(row.session)) {
    return res.status(401).json({ error: "Session expired or revoked — please log in again." });
  }

  // Multi-tenant check: Session must belong to the resolved store unless PLATFORM_ADMIN
  if (row.user.role !== "PLATFORM_ADMIN" && storeId && row.session.storeId !== storeId) {
    return res.status(403).json({ error: "Access Denied: You do not have permission for this store." });
  }

  const systemRole = row.user.role as UserRole;
  if (systemRole !== "BUSINESS" && systemRole !== "BUSINESS_OWNER" && systemRole !== "PLATFORM_ADMIN") {
    return res.status(403).json({ error: "Business access required." });
  }

  const effectiveStoreId = storeId || row.session.storeId || row.user.storeId;
  const teamRole = await resolveTeamRole(row.user.email, systemRole, effectiveStoreId);
  if (!teamRole) {
    return res.status(403).json({ error: "Access Denied: Active store team membership required." });
  }

  void slideIdleExpiration(tokenHash, row.session.expiresAt, row.session.idleExpiresAt);

  req.adminUser = toStoredUser(row.user, teamRole, row.session.businessProfileId);
  req.commerceAuth = {
    storeId: effectiveStoreId || "",
    businessProfileId: row.session.businessProfileId ?? null,
    role: teamRole,
    uid: row.user.firebaseUid || row.user.id,
  };

  const access = evaluateTeamAccess(teamRole, req.method, req.path, systemRole);
  if (!access.allowed) {
    return res.status(403).json({ error: access.error });
  }

  return next();
}

export async function requireSuperAdmin(req: TenantRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required." });

  const tokenHash = sessionDigest(token);
  const storeId = req.storeId;
  const rows = await db
    .select({ user: usersTable, session: sessionsTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(eq(sessionsTable.token, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row || !isSessionActive(row.session)) {
    return res.status(401).json({ error: "Session expired — please log in again." });
  }

  if (row.user.role !== "PLATFORM_ADMIN" && storeId && row.session.storeId !== storeId) {
    return res.status(403).json({ error: "Access Denied: You do not have permission for this store." });
  }

  const systemRole = row.user.role as UserRole;
  const effectiveStoreId = storeId || row.session.storeId || row.user.storeId;
  const teamRole = await resolveTeamRole(row.user.email, systemRole, effectiveStoreId);

  if (teamRole !== "Owner") {
    return res.status(403).json({ error: "Super admin / Owner access required." });
  }

  void slideIdleExpiration(tokenHash, row.session.expiresAt, row.session.idleExpiresAt);

  req.adminUser = toStoredUser(row.user, teamRole, row.session.businessProfileId);
  req.commerceAuth = {
    storeId: effectiveStoreId || "",
    businessProfileId: row.session.businessProfileId ?? null,
    role: teamRole,
    uid: row.user.firebaseUid || row.user.id,
  };
  return next();
}

export async function requirePlatformAdmin(req: TenantRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required." });

  const rows = await db
    .select({ user: usersTable, session: sessionsTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(eq(sessionsTable.token, sessionDigest(token)))
    .limit(1);

  const row = rows[0];
  if (!row || !isSessionActive(row.session)) {
    return res.status(401).json({ error: "Session expired — please log in again." });
  }

  if (row.user.role !== "PLATFORM_ADMIN") {
    return res.status(403).json({ error: "Platform administration access required." });
  }

  req.adminUser = toStoredUser(row.user, "Owner", row.session.businessProfileId);
  return next();
}

