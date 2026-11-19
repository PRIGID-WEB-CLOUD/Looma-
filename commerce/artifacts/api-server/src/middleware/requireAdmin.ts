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

export type UserRole = "CUSTOMER" | "ADMIN" | "SUPER_ADMIN" | "PLATFORM_ADMIN";
export type TeamRole = "Owner" | "Admin" | "Editor" | "Viewer";

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
  if (systemRole === "PLATFORM_ADMIN" || systemRole === "SUPER_ADMIN") {
    return "Owner";
  }

  if (systemRole !== "ADMIN") {
    return null;
  }

  const filter = storeId
    ? and(eq(teamMembersTable.email, email), eq(teamMembersTable.storeId, storeId))
    : eq(teamMembersTable.email, email);

  const [member] = await db
    .select({ role: teamMembersTable.role, status: teamMembersTable.status })
    .from(teamMembersTable)
    .where(filter)
    .limit(1);

  if (member) {
    const status = (member.status || "").trim().toLowerCase();
    if (status === "revoked" || status === "suspended" || status === "removed") {
      return null;
    }
    const r = member.role.trim().toLowerCase();
    if (r === "owner") return "Owner";
    if (r === "admin") return "Admin";
    if (r === "editor") return "Editor";
    if (r === "viewer") return "Viewer";
  }

  // Fail closed when no team membership exists
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

function extractToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return undefined;
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
  if (systemRole !== "ADMIN" && systemRole !== "SUPER_ADMIN" && systemRole !== "PLATFORM_ADMIN") {
    return res.status(403).json({ error: "Admin access required." });
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

  const method = req.method;
  const path = req.path;

  // 1. Viewer has STRICTLY read-only access
  if (teamRole === "Viewer") {
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      return res.status(403).json({ error: "Access Denied: Viewers do not have permission to make changes." });
    }
  }

  // 2. Editor can ONLY execute writes on Media, Blog Posts, and Coupons
  if (teamRole === "Editor") {
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const allowedWritePaths = ["/media", "/blog", "/coupons", "/uploads"];
      const isAllowed = allowedWritePaths.some((p) => path.startsWith(p));
      if (!isAllowed) {
        return res.status(403).json({
          error: "Access Denied: Editors are restricted to managing blog posts, coupons, and media assets.",
        });
      }
    }
  }

  // 3. Only Owner can make administrative modifications to team, settings, or API keys
  if (teamRole === "Admin" || teamRole === "Editor" || teamRole === "Viewer") {
    const restrictedActions = ["/apikeys", "/settings", "/team"];
    const isRestrictedPath = restrictedActions.some((p) => path.startsWith(p));
    if (isRestrictedPath && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      return res.status(403).json({
        error: "Access Denied: Only the store Owner is authorized to perform this administrative change.",
      });
    }

    if (path.startsWith("/apikeys") || path.startsWith("/settings")) {
      if (["POST", "PUT", "DELETE", "PATCH"].includes(method) || path.includes("/keys")) {
        return res.status(403).json({
          error: "Access Denied: Only the store Owner is authorized to configure API keys and settings.",
        });
      }
    }
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

