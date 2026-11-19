import { createSign, randomUUID } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import {
  appSettingsTable,
  categoriesTable,
  commerceSyncOutboxTable,
  db,
  productsTable,
  storesTable,
} from "@workspace/db";

export type OutboxAggregateType = "STORE" | "PRODUCT" | "ORDER";

export interface EnqueueOutboxParams {
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  storeId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

const MAX_OUTBOX_ATTEMPTS = 8;

function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof value === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function getFirestoreTargetConfig(): {
  projectId: string;
  databaseId: string;
  serviceAccount: { client_email: string; private_key: string } | null;
} {
  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  const databaseId = (process.env.FIREBASE_DATABASE_ID || "ai-studio-82404cfa-89f7-49b0-ab36-ea32adf1e5cc").trim();
  const rawSa = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();

  let serviceAccount: { client_email: string; private_key: string } | null = null;
  if (rawSa) {
    try {
      const parsed = JSON.parse(rawSa) as { client_email?: string; private_key?: string };
      if (parsed.client_email && parsed.private_key) {
        serviceAccount = {
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch {
      serviceAccount = null;
    }
  }

  return { projectId, databaseId, serviceAccount };
}

let cachedServiceToken: { token: string; expiresAtMs: number } | null = null;

async function getGoogleServiceAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  if (cachedServiceToken && cachedServiceToken.expiresAtMs > Date.now() + 60_000) {
    return cachedServiceToken.token;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    })
  ).toString("base64url");

  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(sa.private_key).toString("base64url");
  const assertion = `${unsigned}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!tokenRes.ok) {
    throw new Error(`Google OAuth token exchange failed with HTTP ${tokenRes.status}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
  if (!tokenJson.access_token) {
    throw new Error("Google OAuth token response missing access_token");
  }

  cachedServiceToken = {
    token: tokenJson.access_token,
    expiresAtMs: Date.now() + (Number(tokenJson.expires_in || 3600) * 1000),
  };
  return cachedServiceToken.token;
}

export async function enqueueOutboxEvent(
  params: EnqueueOutboxParams,
  txExecutor: typeof db = db
): Promise<string> {
  const id = randomUUID();
  try {
    await txExecutor.insert(commerceSyncOutboxTable).values({
      id,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      storeId: params.storeId,
      eventType: params.eventType,
      payload: params.payload,
      attempts: 0,
      lastError: null,
      processedAt: null,
    });
  } catch (err) {
    console.warn("[FirestoreSyncWorker] Unable to enqueue outbox event:", err);
  }
  return id;
}

async function commitOutboxToFirestore(
  event: typeof commerceSyncOutboxTable.$inferSelect,
  config: { projectId: string; databaseId: string; token: string }
): Promise<void> {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    config.projectId
  )}/databases/${encodeURIComponent(config.databaseId)}/documents:commit`;

  const payload = (event.payload || {}) as Record<string, unknown>;
  const writes: Array<Record<string, unknown>> = [];

  if (event.aggregateType === "STORE") {
    const storeDocPath = `projects/${config.projectId}/databases/${config.databaseId}/documents/marketplaceStores/${event.aggregateId}`;
    const fields: Record<string, unknown> = {};
    for (const key of [
      "id",
      "slug",
      "name",
      "tagline",
      "ownerUid",
      "ownerHandle",
      "logoUrl",
      "bannerUrl",
      "category",
      "currency",
      "publishStatus",
      "externalStoreId",
      "verified",
      "featured",
    ]) {
      if (payload[key] !== undefined) {
        fields[key] = toFirestoreValue(payload[key]);
      }
    }
    writes.push({
      update: {
        name: storeDocPath,
        fields,
      },
      updateMask: {
        fieldPaths: Object.keys(fields),
      },
      updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
    });
  } else if (event.aggregateType === "PRODUCT") {
    const prodDocPath = `projects/${config.projectId}/databases/${config.databaseId}/documents/marketplaceProducts/${event.aggregateId}`;
    if (event.eventType === "PRODUCT_DELETED") {
      writes.push({ delete: prodDocPath });
    } else {
      const fields: Record<string, unknown> = {};
      for (const key of [
        "id",
        "storeId",
        "storeName",
        "storeSlug",
        "ownerUid",
        "title",
        "description",
        "category",
        "priceCents",
        "compareAtPriceCents",
        "currency",
        "imageUrl",
        "galleryUrls",
        "stock",
        "status",
        "featured",
        "tag",
      ]) {
        if (payload[key] !== undefined) {
          fields[key] = toFirestoreValue(payload[key]);
        }
      }
      writes.push({
        update: {
          name: prodDocPath,
          fields,
        },
        updateMask: {
          fieldPaths: Object.keys(fields),
        },
        updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      });
    }
  } else if (event.aggregateType === "ORDER" && typeof payload.businessProfileId === "string" && payload.businessProfileId) {
    const notifId = `bnotif_${event.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32)}`;
    const notifPath = `projects/${config.projectId}/databases/${config.databaseId}/documents/businessProfiles/${payload.businessProfileId}/notifications/${notifId}`;
    writes.push({
      update: {
        name: notifPath,
        fields: {
          id: toFirestoreValue(notifId),
          businessProfileId: toFirestoreValue(payload.businessProfileId),
          actorId: toFirestoreValue(String(payload.buyerFirebaseUid || "buyer")),
          actorName: toFirestoreValue(String(payload.customerName || "Customer")),
          actorAvatar: toFirestoreValue(""),
          type: toFirestoreValue("order"),
          title: toFirestoreValue(
            event.eventType === "ORDER_UPDATED"
              ? `Order #${event.aggregateId.slice(0, 8)} status: ${String(payload.status || "UPDATED")}`
              : `New order #${event.aggregateId.slice(0, 8)}`
          ),
          body: toFirestoreValue(
            `Order total: ${Number(payload.total || 0).toLocaleString()} (${String(payload.paymentStatus || "PENDING")})`
          ),
          targetId: toFirestoreValue(event.aggregateId),
          read: toFirestoreValue(false),
        },
      },
      updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
    });
  }

  if (writes.length === 0) {
    return;
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({ writes }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Firestore sync commit failed (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }
}

export async function processPendingOutbox(options?: {
  storeId?: string;
  limit?: number;
}): Promise<{ processed: number; failed: number; deferred: number }> {
  const cfg = getFirestoreTargetConfig();
  const limit = Math.max(1, Math.min(100, options?.limit ?? 25));

  const conditions = [isNull(commerceSyncOutboxTable.processedAt), lt(commerceSyncOutboxTable.attempts, MAX_OUTBOX_ATTEMPTS)];
  if (options?.storeId) {
    conditions.push(eq(commerceSyncOutboxTable.storeId, options.storeId));
  }

  const pending = await db
    .select()
    .from(commerceSyncOutboxTable)
    .where(and(...conditions))
    .limit(limit);

  if (pending.length === 0) {
    return { processed: 0, failed: 0, deferred: 0 };
  }

  if (!cfg.projectId || !cfg.serviceAccount) {
    return { processed: 0, failed: 0, deferred: pending.length };
  }

  let token = "";
  try {
    token = await getGoogleServiceAccessToken(cfg.serviceAccount);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth token error";
    for (const row of pending) {
      await db
        .update(commerceSyncOutboxTable)
        .set({ attempts: row.attempts + 1, lastError: message })
        .where(eq(commerceSyncOutboxTable.id, row.id));
    }
    return { processed: 0, failed: pending.length, deferred: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      await commitOutboxToFirestore(event, {
        projectId: cfg.projectId,
        databaseId: cfg.databaseId,
        token,
      });
      await db
        .update(commerceSyncOutboxTable)
        .set({ processedAt: new Date(), lastError: null })
        .where(eq(commerceSyncOutboxTable.id, event.id));
      processed += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(commerceSyncOutboxTable)
        .set({ attempts: event.attempts + 1, lastError: msg.slice(0, 500) })
        .where(eq(commerceSyncOutboxTable.id, event.id));
    }
  }

  return { processed, failed, deferred: 0 };
}

export async function reconcileStoreOutbox(storeId: string): Promise<{
  storeId: string;
  queued: number;
  processed: number;
  failed: number;
  deferred: number;
}> {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (!store) {
    throw Object.assign(new Error("Store not found."), { statusCode: 404 });
  }

  const [settingsRows, products, categories] = await Promise.all([
    db.select().from(appSettingsTable).where(eq(appSettingsTable.storeId, storeId)),
    db.select().from(productsTable).where(eq(productsTable.storeId, storeId)),
    db.select().from(categoriesTable).where(eq(categoriesTable.storeId, storeId)),
  ]);

  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const publishStatus =
    store.status === "suspended" || store.publishStatus === "SUSPENDED"
      ? "SUSPENDED"
      : store.isPublished || store.publishStatus === "PUBLISHED"
        ? "PUBLISHED"
        : "DRAFT";

  await enqueueOutboxEvent({
    aggregateType: "STORE",
    aggregateId: store.id,
    storeId: store.id,
    eventType: "STORE_RECONCILED",
    payload: {
      id: store.id,
      slug: store.slug,
      name: settings.store_name || store.name,
      tagline: settings.brand_tagline || "",
      ownerUid: store.ownerFirebaseUid || store.ownerId || "",
      ownerHandle: store.slug,
      logoUrl: settings.brand_logo_url || "",
      bannerUrl: settings.brand_hero_image || "",
      category: settings.brand_category || "General",
      currency: store.currency || "USD",
      publishStatus,
      externalStoreId: store.id,
      verified: false,
      featured: false,
    },
  });

  for (const prod of products) {
    const categoryName = prod.categoryId ? categoryMap.get(prod.categoryId) || "General" : "General";
    await enqueueOutboxEvent({
      aggregateType: "PRODUCT",
      aggregateId: prod.id,
      storeId: store.id,
      eventType: "PRODUCT_RECONCILED",
      payload: {
        id: prod.id,
        storeId: store.id,
        storeName: settings.store_name || store.name,
        storeSlug: store.slug,
        ownerUid: store.ownerFirebaseUid || store.ownerId || "",
        title: prod.name,
        description: prod.description || "",
        category: categoryName,
        priceCents: Math.round(Number(prod.price || 0) * 100),
        currency: store.currency || "USD",
        imageUrl: prod.imageUrl || "",
        stock: Number(prod.stock || 0),
        status: publishStatus === "PUBLISHED" ? prod.status : "DRAFT",
        featured: false,
      },
    });
  }

  const result = await processPendingOutbox({ storeId, limit: 100 });
  return {
    storeId,
    queued: 1 + products.length,
    ...result,
  };
}
