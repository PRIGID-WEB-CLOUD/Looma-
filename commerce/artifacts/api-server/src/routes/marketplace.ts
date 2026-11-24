import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  storesTable,
  productsTable,
  productVariantsTable,
  categoriesTable,
  reviewsTable,
  appSettingsTable,
  ordersTable,
  orderItemsTable,
} from "@workspace/db";
import { sanitizeTenantSlug } from "@workspace/tenant-routing";
import { verifyFirebaseIdToken, type VerifiedFirebaseUser } from "../services/firebaseAuth";
import { enqueueOutboxEvent, processPendingOutbox } from "../services/firestoreSyncWorker";
import { enqueueProductOutboxSnapshot, restoreOrderInventoryTx } from "../services/inventoryService";

const router = Router();

function isStorePubliclyVisible(store: any): boolean {
  return (
    (store?.publishStatus === "PUBLISHED" || store?.isPublished === true) &&
    store?.status !== "suspended" &&
    store?.publishStatus !== "SUSPENDED"
  );
}

function isStoreOwnedByUid(store: any, uid: string | null): boolean {
  if (!uid || !store) return false;
  return (
    (store.ownerFirebaseUid && store.ownerFirebaseUid === uid) ||
    (store.ownerId && store.ownerId === uid)
  );
}

function isStoreSuspended(store: any): boolean {
  return !store || store.status === "suspended" || store.publishStatus === "SUSPENDED";
}

async function tryVerifyOptionalFirebaseUid(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const verified = await verifyFirebaseIdToken(token);
    return verified.uid;
  } catch {
    return null;
  }
}

async function requireVerifiedFirebaseUser(
  req: Request,
  res: Response,
  deniedMessage: string
): Promise<VerifiedFirebaseUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: deniedMessage });
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return null;
  }
  try {
    return await verifyFirebaseIdToken(token);
  } catch (authErr: any) {
    res.status(401).json({ error: authErr?.message || "Invalid authentication token." });
    return null;
  }
}

function mapGalleryUrls(product: any): string[] {
  const urls: string[] = [];
  if (typeof product.imageUrl === "string" && product.imageUrl.trim()) {
    urls.push(product.imageUrl.trim());
  }
  const rawImages = product.images;
  if (Array.isArray(rawImages)) {
    for (const entry of rawImages) {
      if (typeof entry === "string" && entry.trim() && !urls.includes(entry.trim())) {
        urls.push(entry.trim());
      }
    }
  } else if (typeof rawImages === "string" && rawImages.trim()) {
    try {
      const parsed = JSON.parse(rawImages);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === "string" && entry.trim() && !urls.includes(entry.trim())) {
            urls.push(entry.trim());
          }
        }
      }
    } catch {
      // ignore malformed string
    }
  }
  return urls.slice(0, 6);
}

function mapMarketplaceOrderResponse(order: any, store: any) {
  const items = Array.isArray(order.items) ? order.items : [];
  const totalCents = Math.round(Number(order.total || 0) * 100);
  const shippingCents = Math.max(0, Number(order.shippingCents || 0));
  const computedSubtotalCents = items.reduce((sum: number, item: any) => {
    const qty = Math.max(1, Number(item.qty ?? item.quantity ?? 1));
    const unitCents =
      typeof item.priceCents === "number"
        ? Math.round(item.priceCents)
        : Math.round(Number(item.price || 0) * 100);
    return sum + unitCents * qty;
  }, 0);
  const subtotalCents =
    computedSubtotalCents > 0 ? computedSubtotalCents : Math.max(0, totalCents - shippingCents);

  return {
    id: order.id,
    storeId: order.storeId,
    storeName: store?.name || "Marketplace Atelier",
    storeSlug: store?.slug || "",
    storeOwnerUid: store?.ownerFirebaseUid || store?.ownerId || "",
    businessProfileId: order.businessProfileId || store?.businessProfileId || null,
    buyerUid: order.buyerFirebaseUid || "",
    buyerName: order.customerName || "Buyer",
    buyerEmail: order.customerEmail || "",
    items,
    subtotalCents,
    shippingCents,
    totalCents,
    currency: (store?.currency || "USD").toUpperCase(),
    paymentMethod: order.paymentMethod || (order.paymentProvider ? "card" : "cod"),
    status: order.status || "PROCESSING",
    paymentStatus: order.paymentStatus || "PENDING",
    paymentProvider: order.paymentProvider || null,
    paymentReference: order.paymentReference || null,
    shippingAddress: order.shippingAddress || null,
    note: order.note || "",
    createdAt: order.createdAt,
    updatedAt: order.paidAt || order.createdAt,
  };
}

router.get("/marketplace/products", async (req: Request, res: Response) => {
  try {
    const storeFilter = typeof req.query.store === "string" ? req.query.store.trim().toLowerCase() : "";
    const categoryFilter = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
    const countryFilter = typeof req.query.country === "string" ? req.query.country.trim().toLowerCase() : "";
    const searchFilter = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const verifiedUid = await tryVerifyOptionalFirebaseUid(req);

    const [stores, products, variants, categories, allSettings] = await Promise.all([
      db.select().from(storesTable).catch(() => []),
      db.select().from(productsTable).where(eq(productsTable.status, "ACTIVE")).catch(() => []),
      db.select().from(productVariantsTable).catch(() => []),
      db.select().from(categoriesTable).catch(() => []),
      db.select().from(appSettingsTable).catch(() => []),
    ]);

    const visibleStoresById = new Map<string, any>();
    for (const store of stores) {
      const ownerDraftAllowed =
        Boolean(storeFilter) &&
        !isStoreSuspended(store) &&
        isStoreOwnedByUid(store, verifiedUid);
      if (isStorePubliclyVisible(store) || ownerDraftAllowed) {
        visibleStoresById.set(store.id, store);
      }
    }

    const categoryMap = new Map<string, string>();
    for (const cat of categories) {
      if (cat.id && cat.name) categoryMap.set(cat.id, cat.name);
    }

    const variantsByProduct = new Map<string, any[]>();
    for (const variant of variants) {
      const list = variantsByProduct.get(variant.productId) || [];
      list.push(variant);
      variantsByProduct.set(variant.productId, list);
    }

    const storeNameMap = new Map<string, string>();
    const storeLogoMap = new Map<string, string>();
    const storeTaglineMap = new Map<string, string>();
    const storeCountryMap = new Map<string, string>();
    const storeCountryCodeMap = new Map<string, string>();
    const storeLocationMap = new Map<string, string>();
    for (const row of allSettings) {
      if (row.key === "store_name" && row.value) storeNameMap.set(row.storeId, row.value.trim());
      if (row.key === "brand_logo_url" && row.value) storeLogoMap.set(row.storeId, row.value);
      if ((row.key === "brand_tagline" || row.key === "tagline") && row.value && !storeTaglineMap.has(row.storeId)) {
        storeTaglineMap.set(row.storeId, row.value);
      }
      if ((row.key === "store_country" || row.key === "country") && row.value && !storeCountryMap.has(row.storeId)) {
        storeCountryMap.set(row.storeId, row.value.trim());
      }
      if ((row.key === "store_country_code" || row.key === "country_code") && row.value && !storeCountryCodeMap.has(row.storeId)) {
        storeCountryCodeMap.set(row.storeId, row.value.trim().toUpperCase());
      }
      if ((row.key === "store_location" || row.key === "store_city" || row.key === "brand_location") && row.value && !storeLocationMap.has(row.storeId)) {
        storeLocationMap.set(row.storeId, row.value.trim());
      }
    }

    const catalog = products
      .filter((p: any) => visibleStoresById.has(p.storeId))
      .map((p: any) => {
        const store = visibleStoresById.get(p.storeId)!;
        const prodVariants = variantsByProduct.get(p.id) || [];
        const categoryName = p.categoryId ? categoryMap.get(p.categoryId) || "General" : "General";
        const priceNumber = Number(p.price || 0);
        const priceCents = Math.round(priceNumber * 100);
        const compareAtNumber = p.compareAtPrice != null ? Number(p.compareAtPrice) : null;
        const compareAtPriceCents =
          compareAtNumber && compareAtNumber > priceNumber
            ? Math.round(compareAtNumber * 100)
            : undefined;
        const effectiveStock =
          prodVariants.length > 0
            ? prodVariants.reduce((sum, v) => sum + Number(v.stock || 0), 0)
            : Number(p.stock || 0);

        const storeCountry = storeCountryMap.get(store.id) || "";
        const storeCountryCode = storeCountryCodeMap.get(store.id) || "";
        const storeLocation = storeLocationMap.get(store.id) || storeCountry || "Global Atelier";
        const ownerUid = store.ownerFirebaseUid || store.ownerId || "";
        const galleryUrls = mapGalleryUrls(p);

        return {
          id: p.id,
          storeId: store.id,
          storeSlug: store.slug,
          storeName: storeNameMap.get(store.id) || store.name,
          storeLogoUrl: storeLogoMap.get(store.id) || "",
          storeTagline: storeTaglineMap.get(store.id) || "",
          ownerUid,
          businessProfileId: store.businessProfileId || null,
          country: storeCountry,
          countryCode: storeCountryCode,
          location: storeLocation,
          title: p.name,
          name: p.name,
          description: p.description || "",
          category: categoryName,
          categoryId: p.categoryId || null,
          price: priceNumber,
          priceCents,
          ...(compareAtPriceCents ? { compareAtPriceCents } : {}),
          currency: store.currency || "USD",
          stock: effectiveStock,
          trackQuantity: Boolean(p.trackQuantity),
          status: p.status,
          imageUrl: p.imageUrl || galleryUrls[0] || "",
          galleryUrls: galleryUrls.length > 0 ? galleryUrls : undefined,
          tags: p.tags || "",
          variants: prodVariants.map((v) => ({
            id: v.id,
            size: v.size || "",
            color: v.color || "",
            stock: Number(v.stock || 0),
            price: v.price != null ? Number(v.price) : null,
            priceCents: v.price != null ? Math.round(Number(v.price) * 100) : null,
            sku: v.sku || "",
          })),
          createdAt: p.createdAt,
        };
      })
      .filter((item) => {
        if (storeFilter) {
          const matchesStore =
            item.storeId.toLowerCase() === storeFilter ||
            item.storeSlug.toLowerCase() === storeFilter ||
            (item.businessProfileId && item.businessProfileId.toLowerCase() === storeFilter) ||
            (item.ownerUid && item.ownerUid.toLowerCase() === storeFilter);
          if (!matchesStore) return false;
        }
        if (categoryFilter && categoryFilter !== "all") {
          if (item.category.toLowerCase() !== categoryFilter) return false;
        }
        if (countryFilter && countryFilter !== "all") {
          const matchesCountry =
            item.country.toLowerCase() === countryFilter ||
            item.countryCode.toLowerCase() === countryFilter ||
            item.location.toLowerCase().includes(countryFilter);
          if (!matchesCountry) return false;
        }
        if (searchFilter) {
          const hay = `${item.title} ${item.description} ${item.category} ${item.storeName} ${item.tags} ${item.country} ${item.location}`.toLowerCase();
          if (!hay.includes(searchFilter)) return false;
        }
        return true;
      });

    return res.json({
      success: true,
      count: catalog.length,
      products: catalog,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load marketplace products" });
  }
});

router.get("/marketplace/products/:id", async (req: Request, res: Response) => {
  try {
    const productId = String(req.params.id || "").trim();
    if (!productId) {
      return res.status(400).json({ error: "Product ID is required." });
    }
    const verifiedUid = await tryVerifyOptionalFirebaseUid(req);

    const [product] = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.status, "ACTIVE")))
      .limit(1);

    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }

    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, product.storeId))
      .limit(1);

    const canOwnerViewDraft = !isStoreSuspended(store) && isStoreOwnedByUid(store, verifiedUid);
    if (!store || (!isStorePubliclyVisible(store) && !canOwnerViewDraft)) {
      return res.status(404).json({ error: "Product is not currently published." });
    }

    const [variants, catRows, settingsRows] = await Promise.all([
      db.select().from(productVariantsTable).where(and(eq(productVariantsTable.productId, product.id), eq(productVariantsTable.storeId, store.id))),
      product.categoryId
        ? db.select().from(categoriesTable).where(and(eq(categoriesTable.id, product.categoryId), eq(categoriesTable.storeId, store.id))).limit(1)
        : Promise.resolve([]),
      db.select().from(appSettingsTable).where(eq(appSettingsTable.storeId, store.id)),
    ]);

    const settings = Object.fromEntries(settingsRows.map((r: any) => [r.key, r.value]));
    const categoryName = catRows[0]?.name || "General";
    const priceNumber = Number(product.price || 0);
    const compareAtNumber = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;
    const compareAtPriceCents =
      compareAtNumber && compareAtNumber > priceNumber
        ? Math.round(compareAtNumber * 100)
        : undefined;
    const effectiveStock =
      variants.length > 0
        ? variants.reduce((sum, v) => sum + Number(v.stock || 0), 0)
        : Number(product.stock || 0);

    const productCountry = settings.store_country || settings.country || "";
    const productCountryCode = (settings.store_country_code || settings.country_code || "").toUpperCase();
    const productLocation = settings.store_location || settings.store_city || settings.brand_location || productCountry || "Global Atelier";
    const ownerUid = store.ownerFirebaseUid || store.ownerId || "";
    const galleryUrls = mapGalleryUrls(product);

    return res.json({
      success: true,
      product: {
        id: product.id,
        storeId: store.id,
        storeSlug: store.slug,
        storeName: settings.store_name || store.name,
        ownerUid,
        businessProfileId: store.businessProfileId || null,
        country: productCountry,
        countryCode: productCountryCode,
        location: productLocation,
        title: product.name,
        name: product.name,
        description: product.description || "",
        category: categoryName,
        categoryId: product.categoryId || null,
        price: priceNumber,
        priceCents: Math.round(priceNumber * 100),
        ...(compareAtPriceCents ? { compareAtPriceCents } : {}),
        currency: store.currency || "USD",
        stock: effectiveStock,
        trackQuantity: Boolean(product.trackQuantity),
        status: product.status,
        imageUrl: product.imageUrl || galleryUrls[0] || "",
        galleryUrls: galleryUrls.length > 0 ? galleryUrls : undefined,
        tags: product.tags || "",
        createdAt: product.createdAt,
      },
      variants: variants.map((v) => ({
        id: v.id,
        size: v.size || "",
        color: v.color || "",
        stock: Number(v.stock || 0),
        price: v.price != null ? Number(v.price) : null,
        priceCents: v.price != null ? Math.round(Number(v.price) * 100) : null,
        sku: v.sku || "",
      })),
      store: {
        id: store.id,
        slug: store.slug,
        name: settings.store_name || store.name,
        ownerUid,
        businessProfileId: store.businessProfileId || null,
        currency: store.currency || "USD",
        country: productCountry,
        countryCode: productCountryCode,
        location: productLocation,
        logoUrl: settings.brand_logo_url || "",
        tagline: settings.brand_tagline || settings.tagline || "",
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load marketplace product." });
  }
});

router.get("/marketplace/stores", async (req: Request, res: Response) => {
  try {
    const stores = await db.select().from(storesTable);
    const publishedStores = stores.filter((s: any) => isStorePubliclyVisible(s));

    const [allSettings, allProducts, allCategories, allReviews] = await Promise.all([
      db.select().from(appSettingsTable).catch(() => []),
      db.select().from(productsTable).catch(() => []),
      db.select().from(categoriesTable).catch(() => []),
      db.select().from(reviewsTable).catch(() => []),
    ]);

    const categoryMap = new Map<string, string>();
    allCategories.forEach((c: any) => {
      if (c.id && c.name) categoryMap.set(c.id, c.name);
    });

    const enriched = publishedStores.map((store: any) => {
      const storeSettingsRows = allSettings.filter((s: any) => s.storeId === store.id);
      const settings = Object.fromEntries(storeSettingsRows.map((s: any) => [s.key, s.value]));

      const storeProducts = allProducts.filter((p: any) => (p.storeId === store.id || p.store_id === store.id) && p.status === "ACTIVE");
      const storeReviews = allReviews.filter((r: any) => r.storeId === store.id || r.store_id === store.id);

      const rating = storeReviews.length > 0
        ? Number((storeReviews.reduce((sum: number, r: any) => sum + Number(r.rating || 5), 0) / storeReviews.length).toFixed(2))
        : 5.0;

      const firstProduct = storeProducts[0];
      const productCategoryName = firstProduct?.categoryId ? categoryMap.get(firstProduct.categoryId) : null;
      const categoryName = settings["brand_category"] || settings["category"] || productCategoryName || "Luxury Collection";

      let categoryKey = "all";
      const catLower = categoryName.toLowerCase();
      if (catLower.includes("couture") || catLower.includes("rtw") || catLower.includes("wear")) categoryKey = "couture";
      else if (catLower.includes("leather") || catLower.includes("shoe") || catLower.includes("footwear")) categoryKey = "leather";
      else if (catLower.includes("jewel") || catLower.includes("gem") || catLower.includes("diamond")) categoryKey = "jewels";
      else if (catLower.includes("watch") || catLower.includes("horolog") || catLower.includes("timepiece")) categoryKey = "horology";
      else if (catLower.includes("silk") || catLower.includes("evening")) categoryKey = "silk";
      else categoryKey = sanitizeTenantSlug(categoryName) || store.slug.toLowerCase();

      const resolvedName = settings["store_name"] || store.name;
      const tagline = settings["brand_tagline"] || settings["tagline"] || settings["store_tagline"] ||
        (firstProduct?.description ? firstProduct.description : `${resolvedName} — Handcrafted Artisanal Collection`);

      const country = settings["store_country"] || settings["country"] || "";
      const countryCode = (settings["store_country_code"] || settings["country_code"] || "").toUpperCase();
      const location = settings["store_location"] || settings["store_city"] || settings["brand_location"] || country || "Global Atelier";

      const heroImage = settings["brand_hero_image"] || settings["hero_image"] || firstProduct?.imageUrl || "";
      const logoUrl = settings["brand_logo_url"] || "";
      const ownerUid = store.ownerFirebaseUid || store.ownerId || "";

      const badge = settings["brand_badge"] || (
        store.planTier === "enterprise" ? "Flagship Maison" :
        store.planTier === "growth" ? "Heritage Atelier" :
        "Verified Maison"
      );

      let highlights: string[] = [];
      if (settings["brand_highlights"]) {
        try {
          const parsed = JSON.parse(settings["brand_highlights"]);
          if (Array.isArray(parsed)) highlights = parsed;
        } catch {
          highlights = String(settings["brand_highlights"]).split(",").map((s) => s.trim()).filter(Boolean);
        }
      }
      if (highlights.length === 0 && storeProducts.length > 0) {
        const tags = new Set<string>();
        storeProducts.forEach((p: any) => {
          if (p.tags) {
            String(p.tags).split(",").forEach((t) => tags.add(t.trim()));
          }
        });
        highlights = Array.from(tags).slice(0, 3);
        if (highlights.length === 0) {
          highlights = storeProducts.slice(0, 3).map((p: any) => p.name);
        }
      }

      const cleanSlug = store.slug.toLowerCase().trim();
      const customDomain = store.customDomain && store.customDomain.trim() ? store.customDomain.trim().toLowerCase() : null;
      const canonicalDomain = customDomain || `${cleanSlug}.prigidcommerce.com`;
      const canonicalUrl = `https://${canonicalDomain}`;
      const previewUrl = `/?store=${encodeURIComponent(cleanSlug)}`;

      return {
        id: store.id,
        businessProfileId: store.businessProfileId || null,
        ownerUid,
        name: resolvedName,
        slug: cleanSlug,
        planTier: store.planTier,
        currency: store.currency || "USD",
        customDomain,
        canonicalDomain,
        canonicalUrl,
        isPublished: true,
        tagline,
        category: categoryName,
        categoryKey,
        country,
        countryCode,
        location,
        logoUrl,
        heroImage,
        badge,
        highlights,
        rating,
        established: settings["store_established"] || "Verified Atelier",
        storeUrl: canonicalUrl,
        previewUrl,
        productCount: storeProducts.length,
      };
    });

    const countryFilter = typeof req.query.country === "string" ? req.query.country.trim().toLowerCase() : "";
    const filteredStores = countryFilter && countryFilter !== "all"
      ? enriched.filter((s: any) =>
          String(s.country || "").toLowerCase() === countryFilter ||
          String(s.countryCode || "").toLowerCase() === countryFilter ||
          String(s.location || "").toLowerCase().includes(countryFilter)
        )
      : enriched;

    return res.json({
      success: true,
      count: filteredStores.length,
      stores: filteredStores,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load marketplace stores" });
  }
});

router.get("/marketplace/stats", async (_req: Request, res: Response) => {
  try {
    const [stores, products, reviews, orders] = await Promise.all([
      db.select().from(storesTable).catch(() => []),
      db.select().from(productsTable).catch(() => []),
      db.select().from(reviewsTable).catch(() => []),
      db.select().from(ordersTable).catch(() => []),
    ]);

    const published = stores.filter((s: any) => isStorePubliclyVisible(s));

    const publishedStoreIds = new Set(published.map((s: any) => s.id));
    const activeProducts = products.filter((p: any) => publishedStoreIds.has(p.storeId || p.store_id) && p.status === "ACTIVE");
    const activeReviews = reviews.filter((r: any) => publishedStoreIds.has(r.storeId || r.store_id));

    let satisfaction = "100%";
    if (activeReviews.length > 0) {
      const positive = activeReviews.filter((r: any) => Number(r.rating || 5) >= 4);
      satisfaction = ((positive.length / activeReviews.length) * 100).toFixed(1) + "%";
    }

    const destinationCountries = new Set<string>();
    orders.forEach((o: any) => {
      const addr = o.shippingAddress;
      if (addr && typeof addr === "object" && addr.country) destinationCountries.add(String(addr.country).toUpperCase());
    });
    const uniqueDestinationsCount = Math.max(destinationCountries.size, published.length);

    return res.json({
      success: true,
      stats: {
        totalMaisons: published.length,
        handcraftedPieces: activeProducts.length,
        deliveryCountries: uniqueDestinationsCount,
        clientSatisfaction: satisfaction,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load stats" });
  }
});

router.get("/marketplace/orders/mine", async (req: Request, res: Response) => {
  try {
    const verified = await requireVerifiedFirebaseUser(
      req,
      res,
      "Authentication required to view buyer orders."
    );
    if (!verified) return;

    const storeFilter = typeof req.query.store === "string" ? req.query.store.trim().toLowerCase() : "";

    const [orders, stores] = await Promise.all([
      db.select().from(ordersTable).where(eq(ordersTable.buyerFirebaseUid, verified.uid)).orderBy(desc(ordersTable.createdAt)).catch(() => []),
      db.select().from(storesTable).catch(() => []),
    ]);

    const storeById = new Map<string, any>();
    for (const s of stores) {
      storeById.set(s.id, s);
    }

    const mappedOrders = orders
      .map((order: any) => mapMarketplaceOrderResponse(order, storeById.get(order.storeId)))
      .filter((o: any) => {
        if (!storeFilter) return true;
        return (
          o.storeId.toLowerCase() === storeFilter ||
          o.storeSlug.toLowerCase() === storeFilter ||
          (o.businessProfileId && o.businessProfileId.toLowerCase() === storeFilter)
        );
      });

    return res.json({
      success: true,
      count: mappedOrders.length,
      orders: mappedOrders,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load buyer orders." });
  }
});

router.get("/marketplace/orders/selling", async (req: Request, res: Response) => {
  try {
    const verified = await requireVerifiedFirebaseUser(
      req,
      res,
      "Authentication required to view storefront orders."
    );
    if (!verified) return;

    const storeFilter = typeof req.query.store === "string" ? req.query.store.trim().toLowerCase() : "";
    const ownedStores = await db
      .select()
      .from(storesTable)
      .where(or(eq(storesTable.ownerFirebaseUid, verified.uid), eq(storesTable.ownerId, verified.uid)))
      .catch(() => []);

    if (ownedStores.length === 0) {
      return res.json({ success: true, count: 0, orders: [] });
    }

    const storeIds = ownedStores.map((s) => s.id);
    const storeById = new Map<string, any>();
    for (const s of ownedStores) storeById.set(s.id, s);

    const orders = await db
      .select()
      .from(ordersTable)
      .where(inArray(ordersTable.storeId, storeIds))
      .orderBy(desc(ordersTable.createdAt))
      .catch(() => []);

    const mappedOrders = orders
      .map((order: any) => mapMarketplaceOrderResponse(order, storeById.get(order.storeId)))
      .filter((o: any) => {
        if (!storeFilter) return true;
        return (
          o.storeId.toLowerCase() === storeFilter ||
          o.storeSlug.toLowerCase() === storeFilter ||
          (o.businessProfileId && o.businessProfileId.toLowerCase() === storeFilter)
        );
      });

    return res.json({
      success: true,
      count: mappedOrders.length,
      orders: mappedOrders,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load seller orders." });
  }
});

const offlineOrderSchema = z.object({
  storeId: z.string().trim().min(1).max(200),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().toLowerCase().email().optional(),
  paymentMethod: z.enum(["cod", "wallet"]).default("cod"),
  shippingCents: z.number().int().min(0).max(500000).optional().default(0),
  note: z.string().trim().max(500).optional().default(""),
  shippingAddress: z.record(z.string().trim().max(500)),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(200),
        variantId: z.string().trim().max(200).optional(),
        quantity: z.number().int().min(1).max(100),
      })
    )
    .min(1)
    .max(50),
});

router.post("/marketplace/orders/offline", async (req: Request, res: Response) => {
  const verified = await requireVerifiedFirebaseUser(
    req,
    res,
    "Authentication required to place an order."
  );
  if (!verified) return;

  const parsed = offlineOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid order payload.", details: parsed.error.flatten() });
  }

  const data = parsed.data;
  try {
    const [store] = await db
      .select()
      .from(storesTable)
      .where(
        or(
          eq(storesTable.id, data.storeId),
          eq(storesTable.slug, data.storeId),
          eq(storesTable.businessProfileId, data.storeId)
        )
      )
      .limit(1);

    if (!store || isStoreSuspended(store)) {
      return res.status(404).json({ error: "Storefront not found or unavailable." });
    }

    const created = await db.transaction(async (tx) => {
      let subtotal = 0;
      const authoritativeItems: Array<{
        productId: string;
        variantId?: string;
        sku: string;
        name: string;
        qty: number;
        price: number;
      }> = [];

      for (const item of data.items) {
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(
            and(
              eq(productsTable.id, item.productId),
              eq(productsTable.storeId, store.id),
              eq(productsTable.status, "ACTIVE")
            )
          )
          .limit(1);

        if (!product) {
          throw Object.assign(new Error(`Product ${item.productId} is no longer available.`), {
            statusCode: 409,
          });
        }

        let unitPrice = Number(product.price || 0);
        let sku = "";

        if (item.variantId) {
          const [reservedVariant] = await tx
            .update(productVariantsTable)
            .set({
              stock: product.trackQuantity
                ? sql`GREATEST(0, ${productVariantsTable.stock} - ${item.quantity})`
                : sql`${productVariantsTable.stock}`,
            })
            .where(
              and(
                eq(productVariantsTable.id, item.variantId),
                eq(productVariantsTable.productId, product.id),
                eq(productVariantsTable.storeId, store.id),
                product.trackQuantity ? gte(productVariantsTable.stock, item.quantity) : sql`true`
              )
            )
            .returning();

          if (!reservedVariant) {
            throw Object.assign(
              new Error(`${product.name} selected variant has insufficient stock.`),
              { statusCode: 409 }
            );
          }
          if (reservedVariant.price != null) unitPrice = Number(reservedVariant.price);
          sku = reservedVariant.sku || "";
        }

        const stockCond = or(
          eq(productsTable.trackQuantity, false),
          gte(productsTable.stock, item.quantity)
        );
        const [reservedProduct] = await tx
          .update(productsTable)
          .set({
            stock: product.trackQuantity
              ? sql`GREATEST(0, ${productsTable.stock} - ${item.quantity})`
              : sql`${productsTable.stock}`,
          })
          .where(and(eq(productsTable.id, product.id), eq(productsTable.storeId, store.id), stockCond))
          .returning();

        if (!reservedProduct) {
          throw Object.assign(new Error(`${product.name} has insufficient stock.`), {
            statusCode: 409,
          });
        }

        subtotal += unitPrice * item.quantity;
        authoritativeItems.push({
          productId: product.id,
          ...(item.variantId ? { variantId: item.variantId } : {}),
          sku,
          name: product.name,
          qty: item.quantity,
          price: unitPrice,
        });
      }

      const shippingFee = Math.max(0, data.shippingCents) / 100;
      const orderId = randomUUID();
      const [orderRow] = await tx
        .insert(ordersTable)
        .values({
          id: orderId,
          storeId: store.id,
          businessProfileId: store.businessProfileId || null,
          buyerFirebaseUid: verified.uid,
          customerName: data.customerName,
          customerEmail: data.customerEmail || verified.email || "buyer@looma.app",
          total: subtotal + shippingFee,
          shippingCents: Math.round(shippingFee * 100),
          paymentMethod: data.paymentMethod,
          note: data.note,
          status: "PENDING",
          paymentStatus: "PENDING",
          items: authoritativeItems,
          shippingAddress: data.shippingAddress,
        })
        .returning();

      await tx.insert(orderItemsTable).values(
        authoritativeItems.map((it) => ({
          id: randomUUID(),
          storeId: store.id,
          orderId,
          productId: it.productId,
          variantId: it.variantId || null,
          sku: it.sku,
          productName: it.name,
          unitPrice: it.price,
          quantity: it.qty,
          total: it.price * it.qty,
        }))
      );

      for (const it of authoritativeItems) {
        await enqueueProductOutboxSnapshot(it.productId, store.id, "PRODUCT_STOCK_UPDATED", tx as any);
      }

      await enqueueOutboxEvent(
        {
          aggregateType: "ORDER",
          aggregateId: orderId,
          storeId: store.id,
          eventType: "ORDER_CREATED",
          payload: {
            id: orderId,
            businessProfileId: store.businessProfileId || null,
            buyerFirebaseUid: verified.uid,
            customerName: orderRow.customerName,
            total: orderRow.total,
            status: orderRow.status,
            paymentStatus: orderRow.paymentStatus,
          },
        },
        tx as any
      );

      return orderRow;
    });

    processPendingOutbox({ storeId: store.id }).catch(() => {});

    return res.status(201).json({
      success: true,
      order: mapMarketplaceOrderResponse(created, store),
    });
  } catch (err: any) {
    return res.status(err?.statusCode || 500).json({
      error: err?.message || "Failed to place offline order.",
    });
  }
});

const sellerOrderUpdateSchema = z.object({
  status: z
    .enum(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"])
    .optional(),
  paymentStatus: z
    .enum(["pending", "paid", "failed", "refunded", "PENDING", "PAID", "FAILED", "REFUNDED"])
    .optional(),
});

router.put("/marketplace/orders/:id/status", async (req: Request, res: Response) => {
  const verified = await requireVerifiedFirebaseUser(
    req,
    res,
    "Authentication required to update order status."
  );
  if (!verified) return;

  const orderId = String(req.params.id || "").trim();
  if (!orderId) {
    return res.status(400).json({ error: "Order ID is required." });
  }

  const parsed = sellerOrderUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid order update payload.", details: parsed.error.flatten() });
  }

  const mappedStatus =
    parsed.data.status === "CONFIRMED" ? "PROCESSING" : parsed.data.status;
  const mappedPaymentStatus = parsed.data.paymentStatus
    ? (parsed.data.paymentStatus.toUpperCase() as "PENDING" | "PAID" | "FAILED" | "REFUNDED")
    : undefined;

  if (!mappedStatus && !mappedPaymentStatus) {
    return res.status(400).json({ error: "No order updates provided." });
  }

  try {
    const [existingOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    if (!existingOrder) {
      return res.status(404).json({ error: "Order not found." });
    }

    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, existingOrder.storeId))
      .limit(1);

    if (!store || !isStoreOwnedByUid(store, verified.uid)) {
      return res.status(403).json({ error: "Forbidden: you do not own this order's storefront." });
    }

    const updatedOrder = await db.transaction(async (tx) => {
      const wasRestored =
        existingOrder.status === "CANCELLED" ||
        existingOrder.status === "REFUNDED" ||
        existingOrder.paymentStatus === "REFUNDED" ||
        existingOrder.paymentStatus === "FAILED";

      const patch: Record<string, unknown> = {};
      if (mappedStatus) patch.status = mappedStatus;
      if (mappedPaymentStatus) patch.paymentStatus = mappedPaymentStatus;

      const [row] = await tx
        .update(ordersTable)
        .set(patch)
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, store.id)))
        .returning();

      const nowRestored =
        row.status === "CANCELLED" ||
        row.status === "REFUNDED" ||
        row.paymentStatus === "REFUNDED" ||
        row.paymentStatus === "FAILED";

      if (!wasRestored && nowRestored) {
        const touchedProducts = await restoreOrderInventoryTx(tx as any, row.id, store.id);
        for (const prodId of touchedProducts) {
          await enqueueProductOutboxSnapshot(prodId, store.id, "PRODUCT_UPSERTED", tx as any);
        }
      }

      await enqueueOutboxEvent(
        {
          aggregateType: "ORDER",
          aggregateId: row.id,
          storeId: store.id,
          eventType: "ORDER_UPDATED",
          payload: {
            id: row.id,
            businessProfileId: row.businessProfileId,
            buyerFirebaseUid: row.buyerFirebaseUid,
            customerName: row.customerName,
            total: row.total,
            status: row.status,
            paymentStatus: row.paymentStatus,
          },
        },
        tx as any
      );

      return row;
    });

    processPendingOutbox({ storeId: store.id }).catch(() => {});

    return res.json({
      success: true,
      order: mapMarketplaceOrderResponse(updatedOrder, store),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to update order." });
  }
});

export default router;
