import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { MARKETPLACE_STUDIO_ASSETS, makeCommerceId, slugifyStoreHandle } from './marketplaceCatalogAssets';
import type {
  CartItem,
  CommerceProxyStatus,
  MarketplaceOrder,
  MarketplaceProduct,
  MarketplaceStore,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductCondition,
  ProductStatus,
  StorePublishStatus,
  UpstreamAdminStats,
} from '../types/marketplace';
import type { UserProfile } from '../types/social';

function timestampToMs(val: unknown, fallback: number = Date.now()): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (
    val &&
    typeof val === 'object' &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return fallback;
}

async function buildAuthHeaders(extra?: Record<string, string>): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // Proceed unauthenticated for public GET routes
  }
  return headers;
}

export async function fetchCommerceProxyStatus(): Promise<CommerceProxyStatus> {
  try {
    const res = await fetch('/api/commerce/status', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        configured: false,
        upstreamConfigured: false,
        defaultStoreId: null,
        hasPublishableKey: false,
        adminDashboardUrl: null,
      };
    }
    return (await res.json()) as CommerceProxyStatus;
  } catch {
    return {
      configured: false,
      upstreamConfigured: false,
      defaultStoreId: null,
      hasPublishableKey: false,
      adminDashboardUrl: null,
    };
  }
}

export async function fetchUpstreamAdminStats(
  storeId?: string
): Promise<{ ok: boolean; data?: UpstreamAdminStats; error?: string }> {
  try {
    const headers = await buildAuthHeaders(
      storeId ? { 'X-Store-Id': storeId } : undefined
    );
    const res = await fetch('/api/commerce/admin/stats', {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof payload.error === 'string'
            ? payload.error
            : `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      data: payload as unknown as UpstreamAdminStats,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach commerce proxy.',
    };
  }
}

export async function fetchUpstreamMarketplaceCatalog(storeId?: string): Promise<{
  ok: boolean;
  stores?: MarketplaceStore[];
  products?: MarketplaceProduct[];
}> {
  try {
    const headers = await buildAuthHeaders(
      storeId ? { 'X-Store-Id': storeId } : undefined
    );
    const endpoint = storeId
      ? `/api/commerce/products?storeId=${encodeURIComponent(storeId)}`
      : '/api/marketplace/products';
    const res = await fetch(endpoint, { headers, cache: 'no-store' });
    if (!res.ok) return { ok: false };
    const payload = (await res.json().catch(() => null)) as
      | { stores?: MarketplaceStore[]; products?: MarketplaceProduct[] }
      | MarketplaceProduct[]
      | null;
    if (!payload) return { ok: false };
    if (Array.isArray(payload)) {
      return { ok: true, products: payload };
    }
    return {
      ok: true,
      stores: Array.isArray(payload.stores) ? payload.stores : undefined,
      products: Array.isArray(payload.products) ? payload.products : undefined,
    };
  } catch {
    return { ok: false };
  }
}

export async function submitUpstreamProxyCheckout(input: {
  storeId: string;
  items: CartItem[];
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  note: string;
  paymentMethod: PaymentMethod;
}): Promise<{ ok: boolean; checkoutUrl?: string; orderId?: string; error?: string }> {
  try {
    const headers = await buildAuthHeaders({
      'X-Store-Id': input.storeId,
    });
    const res = await fetch('/api/commerce/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storeId: input.storeId,
        paymentMethod: input.paymentMethod,
        customer: {
          name: input.shippingName,
          phone: input.shippingPhone,
          address: input.shippingAddress,
          city: input.shippingCity,
        },
        note: input.note,
        items: input.items.map((item) => ({
          productId: item.productId,
          qty: item.quantity,
          priceCents: item.priceCents,
        })),
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof payload.error === 'string'
            ? payload.error
            : `Checkout proxy error (HTTP ${res.status})`,
      };
    }
    return {
      ok: true,
      checkoutUrl:
        typeof payload.checkoutUrl === 'string'
          ? payload.checkoutUrl
          : typeof payload.url === 'string'
            ? payload.url
            : undefined,
      orderId: typeof payload.orderId === 'string' ? payload.orderId : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Checkout proxy request failed.',
    };
  }
}

function mapStoreDoc(id: string, data: Record<string, unknown>): MarketplaceStore {
  return {
    id,
    slug: typeof data.slug === 'string' ? data.slug : id,
    name: typeof data.name === 'string' ? data.name : 'Storefront',
    tagline: typeof data.tagline === 'string' ? data.tagline : '',
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    ownerHandle: typeof data.ownerHandle === 'string' ? data.ownerHandle : 'creator',
    logoUrl: typeof data.logoUrl === 'string' ? data.logoUrl : '',
    bannerUrl: typeof data.bannerUrl === 'string' ? data.bannerUrl : '',
    category: typeof data.category === 'string' ? data.category : 'General',
    currency: typeof data.currency === 'string' ? data.currency : 'USD',
    publishStatus:
      data.publishStatus === 'PUBLISHED' || data.publishStatus === 'SUSPENDED'
        ? data.publishStatus
        : 'DRAFT',
    externalStoreId:
      typeof data.externalStoreId === 'string' ? data.externalStoreId : undefined,
    verified: Boolean(data.verified),
    featured: Boolean(data.featured),
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

function mapProductDoc(id: string, data: Record<string, unknown>): MarketplaceProduct {
  const rawGallery = Array.isArray(data.galleryUrls)
    ? data.galleryUrls.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4)
    : undefined;
  const rawCondition =
    data.condition === 'New' ||
    data.condition === 'Used - Like New' ||
    data.condition === 'Used - Good' ||
    data.condition === 'Used - Fair'
      ? data.condition
      : undefined;
  return {
    id,
    storeId: typeof data.storeId === 'string' ? data.storeId : '',
    storeName: typeof data.storeName === 'string' ? data.storeName : 'Storefront',
    storeSlug: typeof data.storeSlug === 'string' ? data.storeSlug : 'store',
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    title: typeof data.title === 'string' ? data.title : 'Product',
    description: typeof data.description === 'string' ? data.description : '',
    category: typeof data.category === 'string' ? data.category : 'General',
    priceCents: typeof data.priceCents === 'number' ? data.priceCents : 0,
    compareAtPriceCents:
      typeof data.compareAtPriceCents === 'number'
        ? data.compareAtPriceCents
        : undefined,
    currency: typeof data.currency === 'string' ? data.currency : 'USD',
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    galleryUrls: rawGallery && rawGallery.length > 0 ? rawGallery : undefined,
    location: typeof data.location === 'string' && data.location.trim() ? data.location.trim() : undefined,
    condition: rawCondition,
    stock: typeof data.stock === 'number' ? data.stock : 0,
    status:
      data.status === 'ACTIVE' || data.status === 'ARCHIVED'
        ? data.status
        : 'DRAFT',
    featured: Boolean(data.featured),
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

function mapOrderDoc(id: string, data: Record<string, unknown>): MarketplaceOrder {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    id,
    buyerUid: typeof data.buyerUid === 'string' ? data.buyerUid : '',
    buyerName: typeof data.buyerName === 'string' ? data.buyerName : 'Member',
    buyerEmail: typeof data.buyerEmail === 'string' ? data.buyerEmail : '',
    storeId: typeof data.storeId === 'string' ? data.storeId : '',
    storeName: typeof data.storeName === 'string' ? data.storeName : 'Storefront',
    storeOwnerUid: typeof data.storeOwnerUid === 'string' ? data.storeOwnerUid : '',
    items: rawItems.map((entry) => {
      const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      return {
        productId: typeof item.productId === 'string' ? item.productId : '',
        title: typeof item.title === 'string' ? item.title : 'Item',
        priceCents: typeof item.priceCents === 'number' ? item.priceCents : 0,
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : '',
      };
    }),
    subtotalCents: typeof data.subtotalCents === 'number' ? data.subtotalCents : 0,
    shippingCents: typeof data.shippingCents === 'number' ? data.shippingCents : 0,
    totalCents: typeof data.totalCents === 'number' ? data.totalCents : 0,
    currency: typeof data.currency === 'string' ? data.currency : 'USD',
    paymentMethod:
      data.paymentMethod === 'card' || data.paymentMethod === 'wallet'
        ? data.paymentMethod
        : 'cod',
    paymentStatus:
      data.paymentStatus === 'paid' || data.paymentStatus === 'refunded'
        ? data.paymentStatus
        : 'pending',
    status:
      data.status === 'CONFIRMED' ||
      data.status === 'SHIPPED' ||
      data.status === 'DELIVERED' ||
      data.status === 'CANCELLED'
        ? data.status
        : 'PENDING',
    shippingName: typeof data.shippingName === 'string' ? data.shippingName : '',
    shippingPhone: typeof data.shippingPhone === 'string' ? data.shippingPhone : '',
    shippingAddress: typeof data.shippingAddress === 'string' ? data.shippingAddress : '',
    shippingCity: typeof data.shippingCity === 'string' ? data.shippingCity : '',
    note: typeof data.note === 'string' ? data.note : '',
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

export function subscribePublishedMarketplaceStores(
  onData: (stores: MarketplaceStore[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, 'marketplaceStores'),
    where('publishStatus', '==', 'PUBLISHED')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapStoreDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => Number(b.featured) - Number(a.featured) || b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'marketplaceStores');
    }
  );
}

export function subscribeAllMarketplaceStoresAdmin(
  onData: (stores: MarketplaceStore[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'marketplaceStores'),
    (snap) => {
      const items = snap.docs
        .map((d) => mapStoreDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'marketplaceStores');
    }
  );
}

export function subscribeActiveMarketplaceProducts(
  onData: (products: MarketplaceProduct[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, 'marketplaceProducts'),
    where('status', '==', 'ACTIVE')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapProductDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => Number(b.featured) - Number(a.featured) || b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'marketplaceProducts');
    }
  );
}

export function subscribeAllMarketplaceProductsAdmin(
  onData: (products: MarketplaceProduct[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'marketplaceProducts'),
    (snap) => {
      const items = snap.docs
        .map((d) => mapProductDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'marketplaceProducts');
    }
  );
}

export function subscribeBuyerMarketplaceOrders(
  buyerUid: string,
  onData: (orders: MarketplaceOrder[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, 'marketplaceOrders'),
    where('buyerUid', '==', buyerUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'marketplaceOrders');
    }
  );
}

export function subscribeSellerMarketplaceOrders(
  storeOwnerUid: string,
  onData: (orders: MarketplaceOrder[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, 'marketplaceOrders'),
    where('storeOwnerUid', '==', storeOwnerUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'marketplaceOrders');
    }
  );
}

export function subscribeAllMarketplaceOrdersAdmin(
  onData: (orders: MarketplaceOrder[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'marketplaceOrders'),
    (snap) => {
      const items = snap.docs
        .map((d) => mapOrderDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'marketplaceOrders');
    }
  );
}

export async function saveMarketplaceStoreRecord(input: {
  id?: string;
  slug: string;
  name: string;
  tagline: string;
  ownerUid: string;
  ownerHandle: string;
  logoUrl: string;
  bannerUrl: string;
  category: string;
  currency: string;
  publishStatus: StorePublishStatus;
  externalStoreId?: string;
  verified: boolean;
  featured: boolean;
  isCreate: boolean;
}): Promise<string> {
  const id = (input.id || makeCommerceId('store')).trim();
  const payload: Record<string, unknown> = {
    id,
    slug: slugifyStoreHandle(input.slug || input.name),
    name: input.name.trim().slice(0, 80),
    tagline: input.tagline.trim().slice(0, 180),
    ownerUid: input.ownerUid.trim(),
    ownerHandle: input.ownerHandle.trim().replace(/^@+/, '').slice(0, 32) || 'creator',
    logoUrl: input.logoUrl.trim().slice(0, 250000),
    bannerUrl: input.bannerUrl.trim().slice(0, 250000),
    category: input.category.trim().slice(0, 40) || 'General',
    currency: (input.currency || 'USD').trim().toUpperCase().slice(0, 8),
    publishStatus: input.publishStatus,
    verified: Boolean(input.verified),
    featured: Boolean(input.featured),
    updatedAt: serverTimestamp(),
  };
  if (input.externalStoreId && input.externalStoreId.trim()) {
    payload.externalStoreId = input.externalStoreId.trim().slice(0, 128);
  }
  try {
    const ref = doc(db, 'marketplaceStores', id);
    if (input.isCreate) {
      payload.createdAt = serverTimestamp();
      await setDoc(ref, payload);
    } else {
      await updateDoc(ref, payload);
    }
    return id;
  } catch (err) {
    handleFirestoreError(
      err,
      input.isCreate ? OperationType.CREATE : OperationType.UPDATE,
      `marketplaceStores/${id}`
    );
  }
}

export async function ensurePersonalMarketplaceStore(params: {
  profile: UserProfile;
  category: string;
  currency: string;
  existingStores: MarketplaceStore[];
  persistToFirestore: boolean;
}): Promise<MarketplaceStore> {
  const { profile, category, currency, existingStores, persistToFirestore } = params;
  const owned = existingStores.find(
    (s) => s.ownerUid === profile.uid && s.publishStatus !== 'SUSPENDED'
  );
  if (owned) return owned;

  const storeId = `store_member_${profile.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
  const slug = slugifyStoreHandle(`${profile.handle || profile.displayName}-${profile.uid.slice(0, 6)}`);
  const now = Date.now();
  const nextStore: MarketplaceStore = {
    id: storeId,
    slug,
    name: (profile.displayName || 'Marketplace Seller').trim().slice(0, 80),
    tagline: (profile.bio || 'Independent seller on Looma Marketplace.').trim().slice(0, 180),
    ownerUid: profile.uid,
    ownerHandle: (profile.handle || 'creator').replace(/^@+/, '').slice(0, 32) || 'creator',
    logoUrl: (profile.avatarUrl || '').slice(0, 250000),
    bannerUrl: '',
    category: (category || 'General').slice(0, 40),
    currency: (currency || 'USD').trim().toUpperCase().slice(0, 8),
    publishStatus: 'PUBLISHED',
    verified: false,
    featured: false,
    createdAtMs: now,
    updatedAtMs: now,
  };

  if (persistToFirestore) {
    await saveMarketplaceStoreRecord({
      id: nextStore.id,
      slug: nextStore.slug,
      name: nextStore.name,
      tagline: nextStore.tagline,
      ownerUid: nextStore.ownerUid,
      ownerHandle: nextStore.ownerHandle,
      logoUrl: nextStore.logoUrl,
      bannerUrl: nextStore.bannerUrl,
      category: nextStore.category,
      currency: nextStore.currency,
      publishStatus: 'PUBLISHED',
      verified: false,
      featured: false,
      isCreate: true,
    });
  }

  return nextStore;
}

export async function saveMarketplaceProductRecord(input: {
  id?: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  ownerUid: string;
  title: string;
  description: string;
  category: string;
  priceCents: number;
  compareAtPriceCents?: number;
  currency: string;
  imageUrl: string;
  galleryUrls?: string[];
  location?: string;
  condition?: ProductCondition;
  stock: number;
  status: ProductStatus;
  featured: boolean;
  tag?: string;
  isCreate: boolean;
}): Promise<string> {
  const id = (input.id || makeCommerceId('prod')).trim();
  const payload: Record<string, unknown> = {
    id,
    storeId: input.storeId.trim(),
    storeName: input.storeName.trim().slice(0, 80),
    storeSlug: slugifyStoreHandle(input.storeSlug),
    ownerUid: input.ownerUid.trim(),
    title: input.title.trim().slice(0, 100),
    description: input.description.trim().slice(0, 1000),
    category: input.category.trim().slice(0, 40) || 'General',
    priceCents: Math.max(0, Math.round(input.priceCents)),
    currency: (input.currency || 'USD').trim().toUpperCase().slice(0, 8),
    imageUrl: input.imageUrl.trim().slice(0, 600000),
    stock: Math.max(0, Math.round(input.stock)),
    status: input.status,
    featured: Boolean(input.featured),
    updatedAt: serverTimestamp(),
  };
  if (
    typeof input.compareAtPriceCents === 'number' &&
    input.compareAtPriceCents > 0
  ) {
    payload.compareAtPriceCents = Math.round(input.compareAtPriceCents);
  }
  if (input.tag && input.tag.trim()) {
    payload.tag = input.tag.trim().slice(0, 40);
  }
  if (input.location && input.location.trim()) {
    payload.location = input.location.trim().slice(0, 80);
  }
  if (input.condition) {
    payload.condition = input.condition;
  }
  if (Array.isArray(input.galleryUrls) && input.galleryUrls.length > 0) {
    const cleanGallery = input.galleryUrls
      .map((u) => (u || '').trim().slice(0, 600000))
      .filter(Boolean)
      .slice(0, 4);
    if (cleanGallery.length > 0) {
      payload.galleryUrls = cleanGallery;
    }
  }
  try {
    const ref = doc(db, 'marketplaceProducts', id);
    if (input.isCreate) {
      payload.createdAt = serverTimestamp();
      await setDoc(ref, payload);
    } else {
      await updateDoc(ref, payload);
    }
    return id;
  } catch (err) {
    handleFirestoreError(
      err,
      input.isCreate ? OperationType.CREATE : OperationType.UPDATE,
      `marketplaceProducts/${id}`
    );
  }
}

export async function deleteMarketplaceProductRecord(productId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'marketplaceProducts', productId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `marketplaceProducts/${productId}`);
  }
}

export async function createMarketplaceOrderRecord(input: {
  buyerUid: string;
  buyerName: string;
  buyerEmail: string;
  storeId: string;
  storeName: string;
  storeOwnerUid: string;
  items: CartItem[];
  shippingCents: number;
  currency: string;
  paymentMethod: PaymentMethod;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  note: string;
}): Promise<string> {
  const id = makeCommerceId('ord');
  const subtotalCents = input.items.reduce(
    (sum, item) => sum + Math.round(item.priceCents) * Math.max(1, Math.round(item.quantity)),
    0
  );
  const shippingCents = Math.max(0, Math.round(input.shippingCents));
  const totalCents = subtotalCents + shippingCents;

  try {
    await setDoc(doc(db, 'marketplaceOrders', id), {
      id,
      buyerUid: input.buyerUid,
      buyerName: input.buyerName.trim().slice(0, 80) || 'Member',
      buyerEmail: input.buyerEmail.trim().slice(0, 200),
      storeId: input.storeId,
      storeName: input.storeName.trim().slice(0, 80) || 'Storefront',
      storeOwnerUid: input.storeOwnerUid,
      items: input.items.slice(0, 25).map((item) => ({
        productId: item.productId,
        title: item.title.slice(0, 100),
        priceCents: Math.round(item.priceCents),
        quantity: Math.max(1, Math.round(item.quantity)),
        imageUrl: item.imageUrl.slice(0, 2000),
      })),
      subtotalCents,
      shippingCents,
      totalCents,
      currency: (input.currency || 'USD').trim().toUpperCase().slice(0, 8),
      paymentMethod: input.paymentMethod,
      paymentStatus: 'pending',
      status: 'PENDING',
      shippingName: input.shippingName.trim().slice(0, 80),
      shippingPhone: input.shippingPhone.trim().slice(0, 40),
      shippingAddress: input.shippingAddress.trim().slice(0, 240),
      shippingCity: input.shippingCity.trim().slice(0, 80),
      note: input.note.trim().slice(0, 400),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `marketplaceOrders/${id}`);
  }
}

export async function updateMarketplaceOrderAdmin(
  orderId: string,
  updates: {
    status: OrderStatus;
    paymentStatus: PaymentStatus;
  }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'marketplaceOrders', orderId), {
      status: updates.status,
      paymentStatus: updates.paymentStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `marketplaceOrders/${orderId}`);
  }
}

export async function cancelMarketplaceOrderBuyer(orderId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'marketplaceOrders', orderId), {
      status: 'CANCELLED',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `marketplaceOrders/${orderId}`);
  }
}

export async function updateSellerMarketplaceOrderStatus(
  orderId: string,
  updates: {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.status) payload.status = updates.status;
  if (updates.paymentStatus) payload.paymentStatus = updates.paymentStatus;
  try {
    await updateDoc(doc(db, 'marketplaceOrders', orderId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `marketplaceOrders/${orderId}`);
  }
}

export async function seedStarterMarketplaceShowroom(adminUser: {
  uid: string;
  handle: string;
  displayName: string;
}): Promise<{ storeId: string; productCount: number }> {
  const storeId = 'store_luxe_atelier';
  await saveMarketplaceStoreRecord({
    id: storeId,
    slug: 'luxe-atelier',
    name: 'Luxe Atelier',
    tagline: 'Curated architectural objects, mechanical timepieces, and full-grain carry.',
    ownerUid: adminUser.uid,
    ownerHandle: adminUser.handle || 'looma_admin',
    logoUrl: '',
    bannerUrl: MARKETPLACE_STUDIO_ASSETS.heroShowcase,
    category: 'Timepieces',
    currency: 'USD',
    publishStatus: 'PUBLISHED',
    externalStoreId: 'store-001',
    verified: true,
    featured: true,
    isCreate: true,
  });

  const starterProducts = [
    {
      id: 'prod_chrono_01',
      title: 'Chrono Minimaliste Steel 40mm',
      description:
        'Brushed 316L stainless steel mechanical chronograph with sapphire crystal, recessed sub-dials, and vegetable-tanned Italian calfskin strap.',
      category: 'Timepieces',
      priceCents: 68500,
      compareAtPriceCents: 75000,
      imageUrl: MARKETPLACE_STUDIO_ASSETS.watchChronograph,
      stock: 14,
      featured: true,
      tag: 'Limited Run',
    },
    {
      id: 'prod_tote_02',
      title: 'Archetype Structured Leather Tote',
      description:
        'Full-grain espresso leather carryall with solid brushed brass hardware, reinforced base feet, and padded 16-inch laptop divider.',
      category: 'Leather Goods',
      priceCents: 44000,
      imageUrl: MARKETPLACE_STUDIO_ASSETS.leatherTote,
      stock: 9,
      featured: true,
      tag: 'Atelier Drop',
    },
    {
      id: 'prod_carafe_03',
      title: 'Kuro Stoneware Pour-Over Set',
      description:
        'Hand-thrown matte charcoal stoneware dripper, 650ml server carafe, and two matching espresso cups fired at 1,260°C.',
      category: 'Home & Ceramics',
      priceCents: 14500,
      imageUrl: MARKETPLACE_STUDIO_ASSETS.ceramicCarafe,
      stock: 22,
      featured: false,
      tag: 'In Stock',
    },
  ];

  for (const prod of starterProducts) {
    await saveMarketplaceProductRecord({
      id: prod.id,
      storeId,
      storeName: 'Luxe Atelier',
      storeSlug: 'luxe-atelier',
      ownerUid: adminUser.uid,
      title: prod.title,
      description: prod.description,
      category: prod.category,
      priceCents: prod.priceCents,
      compareAtPriceCents: prod.compareAtPriceCents,
      currency: 'USD',
      imageUrl: prod.imageUrl,
      stock: prod.stock,
      status: 'ACTIVE',
      featured: prod.featured,
      tag: prod.tag,
      isCreate: true,
    });
  }

  return { storeId, productCount: starterProducts.length };
}
