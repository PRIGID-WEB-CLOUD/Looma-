import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, storesTable, productsTable, productVariantsTable, categoriesTable, reviewsTable, appSettingsTable, ordersTable } from "@workspace/db";
import { sanitizeTenantSlug } from "@workspace/tenant-routing";

const router = Router();

function isStorePubliclyVisible(store: any): boolean {
  return (
    (store?.publishStatus === "PUBLISHED" || store?.isPublished === true) &&
    store?.status !== "suspended" &&
    store?.publishStatus !== "SUSPENDED"
  );
}

router.get("/marketplace/products", async (req: Request, res: Response) => {
  try {
    const storeFilter = typeof req.query.store === "string" ? req.query.store.trim().toLowerCase() : "";
    const categoryFilter = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
    const searchFilter = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

    const [stores, products, variants, categories, allSettings] = await Promise.all([
      db.select().from(storesTable).catch(() => []),
      db.select().from(productsTable).where(eq(productsTable.status, "ACTIVE")).catch(() => []),
      db.select().from(productVariantsTable).catch(() => []),
      db.select().from(categoriesTable).catch(() => []),
      db.select().from(appSettingsTable).catch(() => []),
    ]);

    const publishedStoresById = new Map<string, any>();
    for (const store of stores) {
      if (isStorePubliclyVisible(store)) {
        publishedStoresById.set(store.id, store);
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

    const storeLogoMap = new Map<string, string>();
    const storeTaglineMap = new Map<string, string>();
    for (const row of allSettings) {
      if (row.key === "brand_logo_url" && row.value) storeLogoMap.set(row.storeId, row.value);
      if ((row.key === "brand_tagline" || row.key === "tagline") && row.value && !storeTaglineMap.has(row.storeId)) {
        storeTaglineMap.set(row.storeId, row.value);
      }
    }

    const catalog = products
      .filter((p: any) => publishedStoresById.has(p.storeId))
      .map((p: any) => {
        const store = publishedStoresById.get(p.storeId)!;
        const prodVariants = variantsByProduct.get(p.id) || [];
        const categoryName = p.categoryId ? categoryMap.get(p.categoryId) || "General" : "General";
        const priceNumber = Number(p.price || 0);
        const priceCents = Math.round(priceNumber * 100);
        const effectiveStock =
          prodVariants.length > 0
            ? prodVariants.reduce((sum, v) => sum + Number(v.stock || 0), 0)
            : Number(p.stock || 0);

        return {
          id: p.id,
          storeId: store.id,
          storeSlug: store.slug,
          storeName: store.name,
          storeLogoUrl: storeLogoMap.get(store.id) || "",
          storeTagline: storeTaglineMap.get(store.id) || "",
          businessProfileId: store.businessProfileId || null,
          title: p.name,
          name: p.name,
          description: p.description || "",
          category: categoryName,
          categoryId: p.categoryId || null,
          price: priceNumber,
          priceCents,
          currency: store.currency || "USD",
          stock: effectiveStock,
          trackQuantity: Boolean(p.trackQuantity),
          status: p.status,
          imageUrl: p.imageUrl || "",
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
            (item.businessProfileId && item.businessProfileId.toLowerCase() === storeFilter);
          if (!matchesStore) return false;
        }
        if (categoryFilter && categoryFilter !== "all") {
          if (item.category.toLowerCase() !== categoryFilter) return false;
        }
        if (searchFilter) {
          const hay = `${item.title} ${item.description} ${item.category} ${item.storeName} ${item.tags}`.toLowerCase();
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

    if (!store || !isStorePubliclyVisible(store)) {
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
    const effectiveStock =
      variants.length > 0
        ? variants.reduce((sum, v) => sum + Number(v.stock || 0), 0)
        : Number(product.stock || 0);

    return res.json({
      success: true,
      product: {
        id: product.id,
        storeId: store.id,
        storeSlug: store.slug,
        storeName: settings.store_name || store.name,
        businessProfileId: store.businessProfileId || null,
        title: product.name,
        name: product.name,
        description: product.description || "",
        category: categoryName,
        categoryId: product.categoryId || null,
        price: priceNumber,
        priceCents: Math.round(priceNumber * 100),
        currency: store.currency || "USD",
        stock: effectiveStock,
        trackQuantity: Boolean(product.trackQuantity),
        status: product.status,
        imageUrl: product.imageUrl || "",
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
        businessProfileId: store.businessProfileId || null,
        currency: store.currency || "USD",
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

      const tagline = settings["brand_tagline"] || settings["tagline"] || settings["store_tagline"] ||
        (firstProduct?.description ? firstProduct.description : `${store.name} — Handcrafted Artisanal Collection`);

      const location = settings["store_location"] || settings["store_city"] || settings["brand_location"] || "Global Atelier";

      const heroImage = settings["brand_hero_image"] || settings["hero_image"] || firstProduct?.imageUrl || "";

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
        name: store.name,
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
        location,
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

    return res.json({
      success: true,
      count: enriched.length,
      stores: enriched,
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

export default router;
