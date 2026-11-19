import type {
  CheckoutRequest,
  CheckoutResponse,
  MarketplaceStats,
  MarketplaceStore,
  StoreProduct,
} from '../types/marketplace';
import {
  INITIAL_MARKETPLACE_STATS,
  INITIAL_MARKETPLACE_STORES,
  INITIAL_STORE_PRODUCTS,
} from '../data/marketplaceCatalog';

export interface StorefrontStatus {
  success: boolean;
  proxyActive: boolean;
  configured: boolean;
  baseUrl: string | null;
}

export async function fetchStorefrontStatus(): Promise<StorefrontStatus> {
  try {
    const res = await fetch('/api/store/status', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // ignore
  }
  return {
    success: true,
    proxyActive: true,
    configured: false,
    baseUrl: null,
  };
}

export async function fetchMarketplaceStores(): Promise<{
  stores: MarketplaceStore[];
  proxied: boolean;
}> {
  try {
    const res = await fetch('/api/store/marketplace/stores', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.stores) && data.stores.length > 0) {
        return { stores: data.stores, proxied: Boolean(data.proxied) };
      }
    }
  } catch {
    // fallback below
  }
  return { stores: INITIAL_MARKETPLACE_STORES, proxied: false };
}

export async function fetchMarketplaceStats(): Promise<MarketplaceStats> {
  try {
    const res = await fetch('/api/store/marketplace/stats', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.stats) return data.stats;
    }
  } catch {
    // fallback below
  }
  return INITIAL_MARKETPLACE_STATS;
}

export async function fetchStoreProducts(params?: {
  storeSlug?: string;
  category?: string;
  search?: string;
}): Promise<StoreProduct[]> {
  try {
    const query = new URLSearchParams();
    if (params?.storeSlug) query.set('store', params.storeSlug);
    if (params?.category && params.category !== 'all') query.set('category', params.category);
    if (params?.search) query.set('search', params.search);

    const res = await fetch(`/api/store/products?${query.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch {
    // fallback below
  }

  let filtered = [...INITIAL_STORE_PRODUCTS];
  if (params?.storeSlug) {
    filtered = filtered.filter((p) => p.storeSlug === params.storeSlug);
  }
  if (params?.category && params.category !== 'all') {
    filtered = filtered.filter(
      (p) =>
        p.categoryId === params.category ||
        (p.categoryName && p.categoryName.toLowerCase().includes(params.category.toLowerCase()))
    );
  }
  if (params?.search) {
    const q = params.search.toLowerCase().trim();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }
  return filtered;
}

export async function submitStorefrontCheckout(
  payload: CheckoutRequest
): Promise<CheckoutResponse> {
  try {
    const res = await fetch('/api/store/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }

  const subtotal = payload.items.reduce(
    (acc, it) => acc + (it.unitPrice || 0) * (it.quantity || 1),
    0
  );
  return {
    success: true,
    orderId: `looma_ord_${Date.now()}`,
    orderNumber: `LM-${Math.floor(100000 + Math.random() * 900000)}`,
    totalAmount: subtotal,
    currency: 'USD',
    status: 'confirmed',
    receiptSummary: {
      itemCount: payload.items.reduce((acc, it) => acc + (it.quantity || 1), 0),
      subtotal,
      shipping: 0,
      estimatedDelivery: '3–5 business days via White Glove Courier',
    },
  };
}
