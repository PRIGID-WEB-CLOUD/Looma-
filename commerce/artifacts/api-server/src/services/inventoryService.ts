import { and, eq, sql } from "drizzle-orm";
import {
  appSettingsTable,
  categoriesTable,
  db,
  orderItemsTable,
  ordersTable,
  productsTable,
  productVariantsTable,
  storesTable,
} from "@workspace/db";
import { enqueueOutboxEvent } from "./firestoreSyncWorker";

type DbExecutor = typeof db;

export async function restoreOrderInventoryTx(
  tx: DbExecutor,
  orderId: string,
  storeId: string
): Promise<string[]> {
  const [order] = await tx
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId)))
    .limit(1);

  if (!order) return [];

  const orderItems = await tx
    .select()
    .from(orderItemsTable)
    .where(and(eq(orderItemsTable.orderId, orderId), eq(orderItemsTable.storeId, storeId)));

  const itemsToRestore: Array<{ productId: string; variantId?: string | null; quantity: number }> =
    orderItems.length > 0
      ? orderItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: Number(i.quantity || 0),
        }))
      : Array.isArray(order.items)
        ? order.items.map((i: any) => ({
            productId: String(i.productId || ""),
            variantId: i.variantId ? String(i.variantId) : null,
            quantity: Number(i.qty ?? i.quantity ?? 0),
          }))
        : [];

  const touchedProductIds = new Set<string>();

  for (const item of itemsToRestore) {
    if (!item.productId || item.quantity <= 0) continue;

    if (item.variantId) {
      await tx
        .update(productVariantsTable)
        .set({ stock: sql`${productVariantsTable.stock} + ${item.quantity}` })
        .where(
          and(
            eq(productVariantsTable.id, item.variantId),
            eq(productVariantsTable.productId, item.productId),
            eq(productVariantsTable.storeId, storeId)
          )
        );
    }

    const [product] = await tx
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.storeId, storeId)))
      .limit(1);

    if (product && product.trackQuantity) {
      await tx
        .update(productsTable)
        .set({ stock: sql`${productsTable.stock} + ${item.quantity}` })
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.storeId, storeId)));
    }

    touchedProductIds.add(item.productId);
  }

  return Array.from(touchedProductIds);
}

export async function enqueueStoreOutboxSnapshot(
  storeId: string,
  eventType: string,
  tx: DbExecutor = db
): Promise<void> {
  const [store] = await tx.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (!store) return;

  const settingsRows = await tx
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.storeId, storeId));
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));

  const publishStatus =
    store.status === "suspended" || store.publishStatus === "SUSPENDED"
      ? "SUSPENDED"
      : store.isPublished || store.publishStatus === "PUBLISHED"
        ? "PUBLISHED"
        : "UNPUBLISHED";

  await enqueueOutboxEvent(
    {
      aggregateType: "STORE",
      aggregateId: store.id,
      storeId: store.id,
      eventType,
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
    },
    tx
  );
}

export async function enqueueProductOutboxSnapshot(
  productId: string,
  storeId: string,
  eventType: "PRODUCT_UPSERTED" | "PRODUCT_DELETED" | "PRODUCT_STOCK_UPDATED",
  tx: DbExecutor = db
): Promise<void> {
  if (eventType === "PRODUCT_DELETED") {
    await enqueueOutboxEvent(
      {
        aggregateType: "PRODUCT",
        aggregateId: productId,
        storeId,
        eventType,
        payload: { id: productId, storeId },
      },
      tx
    );
    return;
  }

  const [store] = await tx.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  const [product] = await tx
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)))
    .limit(1);

  if (!store || !product) return;

  const settingsRows = await tx
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.storeId, storeId));
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));

  let categoryName = "General";
  if (product.categoryId) {
    const [cat] = await tx
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, product.categoryId), eq(categoriesTable.storeId, storeId)))
      .limit(1);
    if (cat?.name) categoryName = cat.name;
  }

  const storeIsPublished =
    (store.isPublished || store.publishStatus === "PUBLISHED") &&
    store.status !== "suspended" &&
    store.publishStatus !== "SUSPENDED";

  await enqueueOutboxEvent(
    {
      aggregateType: "PRODUCT",
      aggregateId: product.id,
      storeId,
      eventType,
      payload: {
        id: product.id,
        storeId,
        storeName: settings.store_name || store.name,
        storeSlug: store.slug,
        ownerUid: store.ownerFirebaseUid || store.ownerId || "",
        title: product.name,
        description: product.description || "",
        category: categoryName,
        priceCents: Math.round(Number(product.price || 0) * 100),
        currency: store.currency || "USD",
        imageUrl: product.imageUrl || "",
        stock: Number(product.stock || 0),
        status: storeIsPublished ? product.status : "DRAFT",
        featured: false,
      },
    },
    tx
  );
}
