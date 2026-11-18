import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  Edit3,
  ExternalLink,
  Package,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { UserProfile } from '../../src/types/social';
import type {
  CommerceProxyStatus,
  MarketplaceOrder,
  MarketplaceProduct,
  MarketplaceStore,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  StorePublishStatus,
  UpstreamAdminStats,
} from '../../src/types/marketplace';
import {
  fetchCommerceProxyStatus,
  fetchUpstreamAdminStats,
} from '../../src/services/commerce';
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_STUDIO_ASSETS,
  formatCurrencyCents,
  slugifyStoreHandle,
} from '../../src/services/marketplaceCatalogAssets';
import { formatRelativeTime } from '../../src/utils/socialLogic';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';

interface CommerceOpsSectionProps {
  currentProfile: UserProfile;
  communityUsers: UserProfile[];
  stores: MarketplaceStore[];
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
  marketplaceEnabled: boolean;
  onToggleMarketplaceFlag: () => Promise<void>;
  onUploadMedia?: (
    file: File,
    folder: 'posts' | 'stories'
  ) => Promise<{ ok: boolean; url?: string; kind?: string; error?: string }>;
  onSeedShowroom: () => Promise<{ ok: boolean; count?: number; error?: string }>;
  onSaveStore: (input: {
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
  }) => Promise<{ ok: boolean; error?: string }>;
  onSaveProduct: (input: {
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
    stock: number;
    status: ProductStatus;
    featured: boolean;
    tag?: string;
    isCreate: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDeleteProduct: (productId: string) => Promise<{ ok: boolean; error?: string }>;
  onUpdateOrder: (
    orderId: string,
    updates: { status: OrderStatus; paymentStatus: PaymentStatus }
  ) => Promise<{ ok: boolean; error?: string }>;
}

type CommerceTab = 'overview' | 'stores' | 'products' | 'orders';

const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'paid', 'refunded'];
const STORE_STATUSES: StorePublishStatus[] = ['DRAFT', 'PUBLISHED', 'SUSPENDED'];
const PRODUCT_STATUSES: ProductStatus[] = ['ACTIVE', 'DRAFT', 'ARCHIVED'];

function formatCentsDollarInput(cents?: number): string {
  if (typeof cents !== 'number' || cents <= 0) return '';
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(raw: string): number {
  const num = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export function CommerceOpsSection({
  currentProfile,
  communityUsers,
  stores,
  products,
  orders,
  marketplaceEnabled,
  onToggleMarketplaceFlag,
  onUploadMedia,
  onSeedShowroom,
  onSaveStore,
  onSaveProduct,
  onDeleteProduct,
  onUpdateOrder,
}: CommerceOpsSectionProps) {
  const [tab, setTab] = useState<CommerceTab>('overview');
  const [proxyStatus, setProxyStatus] = useState<CommerceProxyStatus | null>(null);
  const [upstreamStats, setUpstreamStats] = useState<UpstreamAdminStats | null>(null);
  const [upstreamError, setUpstreamError] = useState<string | null>(null);
  const [loadingProxy, setLoadingProxy] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Filters
  const [productSearch, setProductSearch] = useState('');
  const [productStoreFilter, setProductStoreFilter] = useState('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Store modal state
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<MarketplaceStore | null>(null);
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [storeTagline, setStoreTagline] = useState('');
  const [storeOwnerUid, setStoreOwnerUid] = useState(currentProfile.uid || '');
  const [storeCategory, setStoreCategory] = useState<string>('Timepieces');
  const [storeCurrency, setStoreCurrency] = useState('USD');
  const [storeExternalId, setStoreExternalId] = useState('');
  const [storeBannerUrl, setStoreBannerUrl] = useState<string>(MARKETPLACE_STUDIO_ASSETS.heroShowcase);
  const [storePublishStatus, setStorePublishStatus] = useState<StorePublishStatus>('PUBLISHED');
  const [storeVerified, setStoreVerified] = useState(true);
  const [storeFeatured, setStoreFeatured] = useState(false);
  const [savingStore, setSavingStore] = useState(false);

  // Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MarketplaceProduct | null>(null);
  const [prodStoreId, setProdStoreId] = useState('');
  const [prodTitle, setProdTitle] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodCategory, setProdCategory] = useState<string>('Timepieces');
  const [prodPriceDollars, setProdPriceDollars] = useState('120.00');
  const [prodCompareDollars, setProdCompareDollars] = useState('');
  const [prodStock, setProdStock] = useState('10');
  const [prodStatus, setProdStatus] = useState<ProductStatus>('ACTIVE');
  const [prodTag, setProdTag] = useState('');
  const [prodFeatured, setProdFeatured] = useState(false);
  const [prodImageUrl, setProdImageUrl] = useState<string>(MARKETPLACE_STUDIO_ASSETS.watchChronograph);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const memberOptions = useMemo(() => {
    const map = new Map<string, UserProfile>();
    if (currentProfile.uid) map.set(currentProfile.uid, currentProfile);
    for (const u of communityUsers) {
      if (u.uid) map.set(u.uid, u);
    }
    return Array.from(map.values());
  }, [communityUsers, currentProfile]);

  const refreshCommerceProxy = useCallback(async () => {
    setLoadingProxy(true);
    setUpstreamError(null);
    try {
      const status = await fetchCommerceProxyStatus();
      setProxyStatus(status);
      if (status.upstreamConfigured) {
        const statsRes = await fetchUpstreamAdminStats(status.defaultStoreId || undefined);
        if (statsRes.ok && statsRes.data) {
          setUpstreamStats(statsRes.data);
        } else {
          setUpstreamStats(null);
          setUpstreamError(statsRes.error || 'Unable to query upstream admin stats.');
        }
      } else {
        setUpstreamStats(null);
      }
    } finally {
      setLoadingProxy(false);
    }
  }, []);

  useEffect(() => {
    void refreshCommerceProxy();
  }, [refreshCommerceProxy]);

  const metrics = useMemo(() => {
    const publishedStores = stores.filter((s) => s.publishStatus === 'PUBLISHED').length;
    const activeProducts = products.filter((p) => p.status === 'ACTIVE').length;
    const lowStockProducts = products.filter((p) => p.stock < 5);
    const activeOrders = orders.filter((o) => o.status !== 'CANCELLED');
    const grossCents = activeOrders.reduce((sum, o) => sum + (o.totalCents || 0), 0);
    const pendingOrders = orders.filter(
      (o) => o.status === 'PENDING' || o.status === 'CONFIRMED'
    ).length;
    return {
      publishedStores,
      totalStores: stores.length,
      activeProducts,
      totalProducts: products.length,
      lowStockProducts,
      totalOrders: orders.length,
      pendingOrders,
      grossCents,
    };
  }, [orders, products, stores]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (productStoreFilter !== 'all' && p.storeId !== productStoreFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.storeName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [productSearch, productStoreFilter, products]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (orderStatusFilter !== 'ALL' && o.status !== orderStatusFilter) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.buyerName.toLowerCase().includes(q) ||
        o.buyerEmail.toLowerCase().includes(q) ||
        o.storeName.toLowerCase().includes(q)
      );
    });
  }, [orderSearch, orderStatusFilter, orders]);

  const openCreateStore = () => {
    setEditingStore(null);
    setStoreName('');
    setStoreSlug('');
    setStoreTagline('');
    setStoreOwnerUid(currentProfile.uid || memberOptions[0]?.uid || '');
    setStoreCategory('Timepieces');
    setStoreCurrency('USD');
    setStoreExternalId(proxyStatus?.defaultStoreId || '');
    setStoreBannerUrl(MARKETPLACE_STUDIO_ASSETS.heroShowcase);
    setStorePublishStatus('PUBLISHED');
    setStoreVerified(true);
    setStoreFeatured(false);
    setStoreModalOpen(true);
  };

  const openEditStore = (store: MarketplaceStore) => {
    setEditingStore(store);
    setStoreName(store.name);
    setStoreSlug(store.slug);
    setStoreTagline(store.tagline);
    setStoreOwnerUid(store.ownerUid);
    setStoreCategory(store.category || 'Timepieces');
    setStoreCurrency(store.currency || 'USD');
    setStoreExternalId(store.externalStoreId || '');
    setStoreBannerUrl(store.bannerUrl || MARKETPLACE_STUDIO_ASSETS.heroShowcase);
    setStorePublishStatus(store.publishStatus);
    setStoreVerified(store.verified);
    setStoreFeatured(store.featured);
    setStoreModalOpen(true);
  };

  const handleSubmitStore = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const cleanName = storeName.trim();
    if (cleanName.length < 2) {
      setFeedback({ type: 'err', text: 'Storefront name must be at least 2 characters.' });
      return;
    }
    const owner =
      memberOptions.find((u) => u.uid === storeOwnerUid) || currentProfile;
    const ownerUid = owner.uid || storeOwnerUid || currentProfile.uid;
    if (!ownerUid) {
      setFeedback({ type: 'err', text: 'Select a verified owner UID for this storefront.' });
      return;
    }

    setSavingStore(true);
    try {
      const res = await onSaveStore({
        id: editingStore?.id,
        slug: slugifyStoreHandle(storeSlug || cleanName),
        name: cleanName,
        tagline: storeTagline.trim(),
        ownerUid,
        ownerHandle: (owner.handle || 'creator').replace(/^@+/, ''),
        logoUrl: owner.avatarUrl || '',
        bannerUrl: storeBannerUrl.trim(),
        category: storeCategory,
        currency: storeCurrency.trim().toUpperCase() || 'USD',
        publishStatus: storePublishStatus,
        externalStoreId: storeExternalId.trim() || undefined,
        verified: storeVerified,
        featured: storeFeatured,
        isCreate: !editingStore,
      });
      if (res.ok) {
        setStoreModalOpen(false);
        setFeedback({
          type: 'ok',
          text: editingStore
            ? `Updated storefront "${cleanName}".`
            : `Created storefront "${cleanName}".`,
        });
      } else {
        setFeedback({ type: 'err', text: res.error || 'Failed to save storefront.' });
      }
    } finally {
      setSavingStore(false);
    }
  };

  const handleQuickStoreStatus = async (
    store: MarketplaceStore,
    nextStatus: StorePublishStatus
  ) => {
    setFeedback(null);
    const res = await onSaveStore({
      ...store,
      publishStatus: nextStatus,
      isCreate: false,
    });
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: `Storefront "${store.name}" set to ${nextStatus}.`,
      });
    } else {
      setFeedback({ type: 'err', text: res.error || 'Unable to update store status.' });
    }
  };

  const openCreateProduct = () => {
    const defaultStore = stores[0];
    if (!defaultStore) {
      setFeedback({
        type: 'err',
        text: 'Create a storefront (or seed the starter showroom) before adding products.',
      });
      return;
    }
    setEditingProduct(null);
    setProdStoreId(defaultStore.id);
    setProdTitle('');
    setProdDesc('');
    setProdCategory(defaultStore.category || 'Timepieces');
    setProdPriceDollars('145.00');
    setProdCompareDollars('');
    setProdStock('12');
    setProdStatus('ACTIVE');
    setProdTag('Atelier Drop');
    setProdFeatured(false);
    setProdImageUrl(MARKETPLACE_STUDIO_ASSETS.watchChronograph);
    setProductModalOpen(true);
  };

  const openEditProduct = (product: MarketplaceProduct) => {
    setEditingProduct(product);
    setProdStoreId(product.storeId);
    setProdTitle(product.title);
    setProdDesc(product.description);
    setProdCategory(product.category || 'Timepieces');
    setProdPriceDollars(formatCentsDollarInput(product.priceCents));
    setProdCompareDollars(formatCentsDollarInput(product.compareAtPriceCents));
    setProdStock(String(product.stock));
    setProdStatus(product.status);
    setProdTag(product.tag || '');
    setProdFeatured(product.featured);
    setProdImageUrl(product.imageUrl || MARKETPLACE_STUDIO_ASSETS.watchChronograph);
    setProductModalOpen(true);
  };

  const handleUploadProductImage = async (file: File) => {
    if (!onUploadMedia) return;
    setUploadingImage(true);
    setFeedback(null);
    try {
      const res = await onUploadMedia(file, 'posts');
      if (res.ok && res.url) {
        setProdImageUrl(res.url);
      } else {
        setFeedback({ type: 'err', text: res.error || 'Image upload failed.' });
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmitProduct = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const parentStore = stores.find((s) => s.id === prodStoreId) || stores[0];
    if (!parentStore) {
      setFeedback({ type: 'err', text: 'Select a parent storefront.' });
      return;
    }
    const cleanTitle = prodTitle.trim();
    if (!cleanTitle) {
      setFeedback({ type: 'err', text: 'Product title is required.' });
      return;
    }
    const priceCents = parseDollarsToCents(prodPriceDollars);
    const compareAtPriceCents = prodCompareDollars.trim()
      ? parseDollarsToCents(prodCompareDollars)
      : undefined;
    const stock = Math.max(0, Number.parseInt(prodStock || '0', 10) || 0);

    setSavingProduct(true);
    try {
      const res = await onSaveProduct({
        id: editingProduct?.id,
        storeId: parentStore.id,
        storeName: parentStore.name,
        storeSlug: parentStore.slug,
        ownerUid: parentStore.ownerUid,
        title: cleanTitle,
        description: prodDesc.trim(),
        category: prodCategory,
        priceCents,
        compareAtPriceCents:
          compareAtPriceCents && compareAtPriceCents > priceCents
            ? compareAtPriceCents
            : undefined,
        currency: parentStore.currency || 'USD',
        imageUrl: prodImageUrl.trim(),
        stock,
        status: prodStatus,
        featured: prodFeatured,
        tag: prodTag.trim() || undefined,
        isCreate: !editingProduct,
      });
      if (res.ok) {
        setProductModalOpen(false);
        setFeedback({
          type: 'ok',
          text: editingProduct
            ? `Updated "${cleanTitle}".`
            : `Published product "${cleanTitle}" to ${parentStore.name}.`,
        });
      } else {
        setFeedback({ type: 'err', text: res.error || 'Failed to save product.' });
      }
    } finally {
      setSavingProduct(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setFeedback(null);
    try {
      const res = await onSeedShowroom();
      if (res.ok) {
        setFeedback({
          type: 'ok',
          text: `Starter showroom seeded with Luxe Atelier and ${res.count ?? 3} curated products.`,
        });
      } else {
        setFeedback({ type: 'err', text: res.error || 'Unable to seed starter showroom.' });
      }
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-commerce-section">
      {/* Header & Top Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>Marketplace &amp; Commerce</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage multi-tenant storefronts, studio catalog SKUs, buyer orders, and the reverse-proxy bridge to your Ecommerce Dashboard.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={marketplaceEnabled}
            onClick={() => void onToggleMarketplaceFlag()}
            className={`min-h-[38px] px-3 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              marketplaceEnabled
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
            }`}
          >
            Storefront: {marketplaceEnabled ? 'LIVE' : 'OFF'}
          </button>

          <button
            type="button"
            disabled={loadingProxy}
            onClick={() => void refreshCommerceProxy()}
            className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingProxy ? 'animate-spin' : ''}`} />
            <span>Sync Proxy</span>
          </button>

          {proxyStatus?.adminDashboardUrl && (
            <a
              href={proxyStatus.adminDashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-blue-600 dark:hover:bg-blue-500 dark:hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Ecommerce Dashboard</span>
            </a>
          )}

          {(stores.length === 0 || products.length === 0) && (
            <button
              type="button"
              disabled={seeding}
              onClick={() => void handleSeed()}
              className="min-h-[38px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{seeding ? 'Seeding...' : 'Seed Starter Showroom'}</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'err' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto">
        {(
          [
            { id: 'overview', label: 'Overview & Proxy' },
            { id: 'stores', label: `Storefronts (${stores.length})` },
            { id: 'products', label: `Catalog (${products.length})` },
            { id: 'orders', label: `Orders (${orders.length})` },
          ] as Array<{ id: CommerceTab; label: string }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              tab === item.id
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400">
                Published Stores
              </p>
              <p className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-1 tabular-nums">
                {metrics.publishedStores}
                <span className="text-xs font-normal text-slate-400"> / {metrics.totalStores}</span>
              </p>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                Multi-tenant storefronts
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400">
                Active Catalog SKUs
              </p>
              <p className="text-2xl font-bold font-display text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
                {metrics.activeProducts}
                <span className="text-xs font-normal text-slate-400"> / {metrics.totalProducts}</span>
              </p>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block tabular-nums">
                {metrics.lowStockProducts.length} low-stock alerts (&lt; 5)
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400">
                Marketplace Orders
              </p>
              <p className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-1 tabular-nums">
                {metrics.totalOrders}
              </p>
              <span className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 block tabular-nums">
                {metrics.pendingOrders} awaiting fulfillment
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400">
                Gross Volume
              </p>
              <p className="text-2xl font-bold font-display text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                {formatCurrencyCents(metrics.grossCents, 'USD')}
              </p>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                Excludes cancelled orders
              </span>
            </div>
          </div>

          {/* Upstream Commerce Proxy Bridge Card */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Ecommerce Server Proxy &amp; Dashboard Bridge
                </h2>
              </div>
              <span
                className={`font-mono text-[11px] font-bold uppercase ${
                  proxyStatus?.upstreamConfigured
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-blue-700 dark:text-blue-400'
                }`}
              >
                {proxyStatus?.upstreamConfigured
                  ? 'UPSTREAM API CONNECTED'
                  : 'FIRESTORE NATIVE MODE'}
              </span>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2.5 text-xs">
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Looma routes <code className="font-mono text-[11px]">/api/commerce/*</code> and{' '}
                  <code className="font-mono text-[11px]">/api/marketplace/*</code> through the server proxy with automatic tenant headers and Firebase token verification, while maintaining live Firestore sync as primary/fallback storage.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                    <span className="text-slate-400 block">Default Tenant ID</span>
                    <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">
                      {proxyStatus?.defaultStoreId || 'store-001 (default)'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                    <span className="text-slate-400 block">Publishable Key</span>
                    <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">
                      {proxyStatus?.hasPublishableKey ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2">
                {proxyStatus?.upstreamConfigured && upstreamStats ? (
                  <>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Live Upstream Ecommerce Stats
                    </p>
                    <div className="grid grid-cols-2 gap-3 pt-1 text-xs tabular-nums">
                      <div>
                        <span className="text-[11px] text-slate-500">Upstream Revenue</span>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {typeof upstreamStats.totalRevenue === 'number'
                            ? formatCurrencyCents(Math.round(upstreamStats.totalRevenue * 100), 'USD')
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500">Upstream Orders</span>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {upstreamStats.totalOrders ?? '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500">Pending Queue</span>
                        <p className="font-bold text-amber-600 dark:text-amber-400">
                          {upstreamStats.pendingOrders ?? '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500">Low Stock SKUs</span>
                        <p className="font-bold text-rose-600 dark:text-rose-400">
                          {Array.isArray(upstreamStats.lowStockProducts)
                            ? upstreamStats.lowStockProducts.length
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {upstreamError
                        ? 'Upstream Stats Unavailable'
                        : 'Operating in Standalone Firestore Mode'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {upstreamError ||
                        'Set COMMERCE_API_URL, COMMERCE_PUBLISHABLE_KEY, and COMMERCE_ADMIN_DASHBOARD_URL in environment secrets to mirror an external Looma Commerce API server.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Quick Actions & Low Stock */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Quick Catalog Actions
                </h3>
                <a
                  href="/marketplace"
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Preview Storefront</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openCreateStore}
                  className="min-h-[38px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>New Storefront</span>
                </button>
                <button
                  type="button"
                  onClick={openCreateProduct}
                  className="min-h-[38px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Product</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('orders')}
                  className="min-h-[38px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Manage Orders</span>
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Low Stock Inventory Alerts
              </h3>
              {metrics.lowStockProducts.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  All active catalog SKUs have healthy inventory levels (5+ units).
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {metrics.lowStockProducts.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      className="py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {p.title}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">{p.storeName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditProduct(p)}
                        className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline shrink-0 cursor-pointer tabular-nums"
                      >
                        {p.stock} left · Restock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Stores Tab */}
      {tab === 'stores' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Publish, verify, or suspend creator storefronts and link external Looma Commerce tenant IDs.
            </p>
            <button
              type="button"
              onClick={openCreateStore}
              className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Storefront</span>
            </button>
          </div>

          {stores.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
              <Store className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                No storefronts configured yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Seed the starter showroom to launch Luxe Atelier with curated photography, or create a custom storefront from scratch.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stores.map((store) => (
                <article
                  key={store.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="h-28 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      {store.bannerUrl ? (
                        <img
                          src={store.bannerUrl}
                          alt={store.name}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="p-5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                          <span className="truncate">{store.name}</span>
                          {store.verified && <VerifiedBadge size={14} />}
                        </h3>
                        <span
                          className={`font-mono text-[11px] font-bold uppercase shrink-0 ${
                            store.publishStatus === 'PUBLISHED'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : store.publishStatus === 'SUSPENDED'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {store.publishStatus}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {store.tagline || 'No storefront tagline configured.'}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        @{store.ownerHandle} · /{store.slug}
                        {store.externalStoreId ? ` · Tenant: ${store.externalStoreId}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {store.publishStatus !== 'PUBLISHED' && (
                        <button
                          type="button"
                          onClick={() => void handleQuickStoreStatus(store, 'PUBLISHED')}
                          className="min-h-[30px] px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                        >
                          Publish
                        </button>
                      )}
                      {store.publishStatus !== 'SUSPENDED' && (
                        <button
                          type="button"
                          onClick={() => void handleQuickStoreStatus(store, 'SUSPENDED')}
                          className="min-h-[30px] px-2.5 rounded-lg border border-rose-200 dark:border-rose-900 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        >
                          Suspend
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => openEditStore(store)}
                      className="min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Products Tab */}
      {tab === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search SKU title, store, category..."
                  className="w-full min-h-[38px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <select
                aria-label="Filter products by storefront"
                value={productStoreFilter}
                onChange={(e) => setProductStoreFilter(e.target.value)}
                className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="all">All Storefronts</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={openCreateProduct}
              className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
              <ShoppingBag className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                No products match your filter
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => (
                <article
                  key={product.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="p-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="text-slate-500 dark:text-slate-400 truncate">
                          {product.storeName} · {product.category}
                        </span>
                        <span
                          className={
                            product.status === 'ACTIVE'
                              ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                              : 'text-amber-600 dark:text-amber-400 font-bold'
                          }
                        >
                          {product.status}
                        </span>
                      </div>
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                        {product.title}
                      </h3>
                      <div className="flex items-baseline justify-between gap-2 pt-1 tabular-nums">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {formatCurrencyCents(product.priceCents, product.currency)}
                        </span>
                        <span
                          className={`text-xs font-mono ${
                            product.stock < 5
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          Stock: {product.stock}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openEditProduct(product)}
                      className="min-h-[32px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    {confirmDeleteProductId === product.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await onDeleteProduct(product.id);
                            setConfirmDeleteProductId(null);
                            if (res.ok) {
                              setFeedback({ type: 'ok', text: `Deleted "${product.title}".` });
                            } else {
                              setFeedback({
                                type: 'err',
                                text: res.error || 'Failed to delete product.',
                              });
                            }
                          }}
                          className="min-h-[32px] px-2.5 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteProductId(null)}
                          className="min-h-[32px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteProductId(product.id)}
                        aria-label={`Delete ${product.title}`}
                        className="min-h-[32px] px-2.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Orders Tab */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search order ID, buyer name, email, store..."
                className="w-full min-h-[38px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              aria-label="Filter orders by status"
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value as 'ALL' | OrderStatus)}
              className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono"
            >
              <option value="ALL">All Statuses</option>
              {ORDER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
              <Package className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                No orders found
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <article
                  key={order.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {order.id}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {order.storeName}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {formatRelativeTime(order.createdAtMs)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Buyer: <span className="font-semibold">{order.buyerName}</span>
                        {order.buyerEmail ? ` (${order.buyerEmail})` : ''} · Ship to{' '}
                        {order.shippingName}, {order.shippingAddress}, {order.shippingCity} ({order.shippingPhone})
                      </p>
                      {order.note && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          Note: {order.note}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span className="font-display text-base font-bold text-slate-900 dark:text-white tabular-nums mr-2">
                        {formatCurrencyCents(order.totalCents, order.currency)}
                      </span>

                      <select
                        aria-label={`Order status for ${order.id}`}
                        disabled={updatingOrderId === order.id}
                        value={order.status}
                        onChange={async (e) => {
                          setUpdatingOrderId(order.id);
                          const nextStatus = e.target.value as OrderStatus;
                          const res = await onUpdateOrder(order.id, {
                            status: nextStatus,
                            paymentStatus: order.paymentStatus,
                          });
                          setUpdatingOrderId(null);
                          if (!res.ok) {
                            setFeedback({
                              type: 'err',
                              text: res.error || 'Failed to update order status.',
                            });
                          }
                        }}
                        className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs"
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label={`Payment status for ${order.id}`}
                        disabled={updatingOrderId === order.id}
                        value={order.paymentStatus}
                        onChange={async (e) => {
                          setUpdatingOrderId(order.id);
                          const nextPay = e.target.value as PaymentStatus;
                          const res = await onUpdateOrder(order.id, {
                            status: order.status,
                            paymentStatus: nextPay,
                          });
                          setUpdatingOrderId(null);
                          if (!res.ok) {
                            setFeedback({
                              type: 'err',
                              text: res.error || 'Failed to update payment status.',
                            });
                          }
                        }}
                        className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs uppercase"
                      >
                        {PAYMENT_STATUSES.map((ps) => (
                          <option key={ps} value={ps}>
                            {ps}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                    {order.items.map((item, idx) => (
                      <span key={`${order.id}_${item.productId}_${idx}`}>
                        {item.quantity}x {item.title} ({formatCurrencyCents(item.priceCents, order.currency)})
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Storefront Modal */}
      {storeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingStore ? 'Edit Storefront' : 'Create Storefront'}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl looma-stage-enter">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {editingStore ? `Edit ${editingStore.name}` : 'Create Marketplace Storefront'}
              </h3>
              <button
                type="button"
                onClick={() => setStoreModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmitStore(e)} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Storefront Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => {
                      setStoreName(e.target.value);
                      if (!editingStore) {
                        setStoreSlug(slugifyStoreHandle(e.target.value));
                      }
                    }}
                    placeholder="Luxe Atelier"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    URL Slug *
                  </label>
                  <input
                    type="text"
                    required
                    value={storeSlug}
                    onChange={(e) => setStoreSlug(slugifyStoreHandle(e.target.value))}
                    placeholder="luxe-atelier"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  maxLength={180}
                  value={storeTagline}
                  onChange={(e) => setStoreTagline(e.target.value)}
                  placeholder="Architectural objects, timepieces & leather carry."
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Seller / Owner
                  </label>
                  <select
                    value={storeOwnerUid}
                    onChange={(e) => setStoreOwnerUid(e.target.value)}
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  >
                    {memberOptions.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.displayName} (@{m.handle})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Primary Category
                  </label>
                  <select
                    value={storeCategory}
                    onChange={(e) => setStoreCategory(e.target.value)}
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  >
                    {MARKETPLACE_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Publish Status
                  </label>
                  <select
                    value={storePublishStatus}
                    onChange={(e) => setStorePublishStatus(e.target.value as StorePublishStatus)}
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs"
                  >
                    {STORE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    External Ecommerce Tenant ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={storeExternalId}
                    onChange={(e) => setStoreExternalId(e.target.value)}
                    placeholder="store-001"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Currency
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    value={storeCurrency}
                    onChange={(e) => setStoreCurrency(e.target.value.toUpperCase())}
                    placeholder="USD"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Banner Image URL
                </label>
                <input
                  type="text"
                  value={storeBannerUrl}
                  onChange={(e) => setStoreBannerUrl(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={storeVerified}
                    onChange={(e) => setStoreVerified(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Verified Merchant
                  </span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={storeFeatured}
                    onChange={(e) => setStoreFeatured(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Featured Showroom
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStoreModalOpen(false)}
                  className="min-h-[38px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStore}
                  className="min-h-[38px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingStore ? 'Saving...' : editingStore ? 'Save Changes' : 'Create Storefront'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {productModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingProduct ? 'Edit Product' : 'Add Product'}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl looma-stage-enter">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {editingProduct ? `Edit ${editingProduct.title}` : 'Add Catalog Product'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmitProduct(e)} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Storefront *
                  </label>
                  <select
                    value={prodStoreId}
                    onChange={(e) => setProdStoreId(e.target.value)}
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  >
                    {MARKETPLACE_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Product Title *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={prodTitle}
                  onChange={(e) => setProdTitle(e.target.value)}
                  placeholder="Chrono Minimaliste Steel 40mm"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Editorial Description
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  placeholder="Materials, dimensions, provenance..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs resize-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Price (USD) *
                  </label>
                  <input
                    type="text"
                    required
                    value={prodPriceDollars}
                    onChange={(e) => setProdPriceDollars(e.target.value)}
                    placeholder="145.00"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Compare At
                  </label>
                  <input
                    type="text"
                    value={prodCompareDollars}
                    onChange={(e) => setProdCompareDollars(e.target.value)}
                    placeholder="Optional"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Stock *
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    required
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={prodStatus}
                    onChange={(e) => setProdStatus(e.target.value as ProductStatus)}
                    className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs"
                  >
                    {PRODUCT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Product Image URL
                  </label>
                  {onUploadMedia && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleUploadProductImage(file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={uploadingImage}
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingImage ? 'Uploading to R2...' : 'Upload to R2'}</span>
                      </button>
                    </>
                  )}
                </div>

                <input
                  type="text"
                  value={prodImageUrl}
                  onChange={(e) => setProdImageUrl(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-slate-400">Studio Presets:</span>
                  {(
                    [
                      ['Chronograph', MARKETPLACE_STUDIO_ASSETS.watchChronograph],
                      ['Leather Tote', MARKETPLACE_STUDIO_ASSETS.leatherTote],
                      ['Ceramic Carafe', MARKETPLACE_STUDIO_ASSETS.ceramicCarafe],
                    ] as const
                  ).map(([label, url]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setProdImageUrl(url)}
                      className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Optional Tag Label
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={prodTag}
                    onChange={(e) => setProdTag(e.target.value)}
                    placeholder="Limited Run"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  />
                </div>
                <label className="inline-flex items-center gap-2 pt-4 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={prodFeatured}
                    onChange={(e) => setProdFeatured(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Feature in Showroom Hero Grid
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="min-h-[38px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="min-h-[38px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingProduct ? 'Saving...' : editingProduct ? 'Save SKU' : 'Publish Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
