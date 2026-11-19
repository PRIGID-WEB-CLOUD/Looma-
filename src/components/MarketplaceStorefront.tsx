import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Layers,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  X,
} from 'lucide-react';
import type {
  CheckoutCustomerInfo,
  CheckoutResponse,
  MarketplaceStats,
  MarketplaceStore,
  StoreProduct,
  StoreProductVariant,
} from '../types/marketplace';
import {
  fetchMarketplaceStats,
  fetchMarketplaceStores,
  fetchStorefrontStatus,
  fetchStoreProducts,
  submitStorefrontCheckout,
  type StorefrontStatus,
} from '../services/storefrontService';

interface MarketplaceStorefrontProps {
  onBackToFeed?: () => void;
}

interface CartItemEntry {
  product: StoreProduct;
  selectedVariant?: StoreProductVariant;
  quantity: number;
}

export function MarketplaceStorefront({ onBackToFeed }: MarketplaceStorefrontProps) {
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [stats, setStats] = useState<MarketplaceStats | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [proxyStatus, setProxyStatus] = useState<StorefrontStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedStoreSlug, setSelectedStoreSlug] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'stock'>('featured');

  // Modals & Drawers
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [activeVariant, setActiveVariant] = useState<StoreProductVariant | null>(null);
  const [productDetailQty, setProductDetailQty] = useState(1);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);

  // Cart State
  const [cartItems, setCartItems] = useState<CartItemEntry[]>([]);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResponse | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Customer Form
  const [customerInfo, setCustomerInfo] = useState<CheckoutCustomerInfo>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'United States',
    postalCode: '',
    notes: '',
  });

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [statusRes, storesRes, statsRes, productsRes] = await Promise.all([
        fetchStorefrontStatus(),
        fetchMarketplaceStores(),
        fetchMarketplaceStats(),
        fetchStoreProducts({
          storeSlug: selectedStoreSlug === 'all' ? undefined : selectedStoreSlug,
          category: selectedCategory === 'all' ? undefined : selectedCategory,
          search: searchQuery,
        }),
      ]);

      setProxyStatus(statusRes);
      setStores(storesRes.stores);
      setStats(statsRes);
      setProducts(productsRes);
    } catch {
      // handled inside service
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedStoreSlug, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStoreProducts({
      storeSlug: selectedStoreSlug === 'all' ? undefined : selectedStoreSlug,
      category: selectedCategory === 'all' ? undefined : selectedCategory,
      search: searchQuery,
    }).then(setProducts);
  };

  const categories = useMemo(() => {
    const list = [
      { id: 'all', label: 'All Collections' },
      { id: 'leather', label: 'Leathercraft' },
      { id: 'jewels', label: 'Haute Joaillerie' },
      { id: 'horology', label: 'Haute Horlogerie' },
      { id: 'couture', label: 'Haute Couture' },
      { id: 'decor', label: 'Sculptural Decor' },
    ];
    return list;
  }, []);

  const sortedProducts = useMemo(() => {
    const items = [...products];
    if (sortBy === 'price-asc') {
      items.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      items.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'stock') {
      items.sort((a, b) => b.stock - a.stock);
    }
    return items;
  }, [products, sortBy]);

  const openProductDetail = (p: StoreProduct) => {
    setSelectedProduct(p);
    setActiveVariant(p.variants?.[0] || null);
    setProductDetailQty(1);
  };

  const addToCart = (product: StoreProduct, variant?: StoreProductVariant, quantity = 1) => {
    setCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.product.id === product.id && it.selectedVariant?.id === variant?.id
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].quantity += quantity;
        return copy;
      }
      return [...prev, { product, selectedVariant: variant, quantity }];
    });
  };

  const updateCartQuantity = (index: number, delta: number) => {
    setCartItems((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      const nextQty = target.quantity + delta;
      if (nextQty <= 0) {
        return copy.filter((_, i) => i !== index);
      }
      target.quantity = nextQty;
      return copy;
    });
  };

  const removeCartItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, it) => {
      const unitPrice = it.selectedVariant?.price ?? it.product.price;
      return sum + unitPrice * it.quantity;
    }, 0);
  }, [cartItems]);

  const totalCartCount = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + it.quantity, 0);
  }, [cartItems]);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) return;
    setCheckoutSubmitting(true);
    setCheckoutError(null);

    const primaryStoreSlug = cartItems[0]?.product.storeSlug || 'luxe-boutique';
    const payload = {
      storeSlug: primaryStoreSlug,
      items: cartItems.map((it) => ({
        productId: it.product.id,
        productName: it.product.name,
        variantId: it.selectedVariant?.id,
        variantDescription: it.selectedVariant
          ? `${it.selectedVariant.size} - ${it.selectedVariant.color}`
          : undefined,
        quantity: it.quantity,
        unitPrice: it.selectedVariant?.price ?? it.product.price,
        storeSlug: it.product.storeSlug,
      })),
      customer: customerInfo,
    };

    try {
      const res = await submitStorefrontCheckout(payload);
      setCheckoutResult(res);
      setCartItems([]);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to complete checkout request.');
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  const formatPrice = (price: number, currency = 'USD') => {
    const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
    return `${symbol}${price.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
  };

  return (
    <div className="w-full space-y-6">
      {/* ── Storefront Header & Direct Proxy Indicator ──────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-white">Looma Marketplace</span>
              <span aria-hidden="true">·</span>
              <span>Option A: Server-Side API Proxy</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Connected to E-Commerce Suite</span>
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Curated Ateliers & Luxury Maisons
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              Explore bespoke craft, horology, haute joaillerie, and couture from verified independent boutiques powered by your standalone e-commerce backend.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setInfoModalOpen(true)}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Proxy & Dashboard Link</span>
            </button>

            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              aria-label={`Open shopping bag (${totalCartCount} items)`}
              className="relative min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 inline-flex items-center gap-2 cursor-pointer transition-colors shrink-0"
            >
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              <span>Bag</span>
              {totalCartCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Quiet Ateliers / Stats strip */}
        {stats && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-400">Verified Maisons</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums text-sm">
                {stats.totalMaisons} Flagship Ateliers
              </p>
            </div>
            <div>
              <p className="text-slate-400">Handcrafted Pieces</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums text-sm">
                {stats.handcraftedPieces} Editions
              </p>
            </div>
            <div>
              <p className="text-slate-400">Client Satisfaction</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums text-sm">
                {stats.clientSatisfaction}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Global White-Glove</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums text-sm">
                {stats.deliveryCountries} Countries
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Hero Campaign Banner ────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 min-h-[220px] sm:min-h-[280px] flex items-end">
        <img
          src="/src/assets/images/marketplace_hero_banner_1795018937349.jpg"
          alt="Curated luxury atelier showroom exhibiting artisanal craftsmanship"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
        <div className="relative z-10 p-6 sm:p-8 space-y-2 max-w-2xl text-white">
          <div className="flex items-center gap-2 text-xs tracking-wider uppercase text-slate-300">
            <span>Autumn & Winter Haute Edition</span>
            <span aria-hidden="true">·</span>
            <span>Direct Atelier Sourcing</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
            Florentine Leather, Swiss Joaillerie & Tokyo Horology
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 line-clamp-2">
            Every piece is certified by its founding atelier and delivered in reinforced secure white-glove packaging with full authenticity provenance.
          </p>
        </div>
      </div>

      {/* ── Search, Boutique Filter & Category Segmented Controls ────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search handcrafted pieces, materials, or ateliers..."
              className="w-full pl-10 pr-20 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Maison Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={selectedStoreSlug}
              onChange={(e) => setSelectedStoreSlug(e.target.value)}
              aria-label="Filter by boutique atelier"
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            >
              <option value="all">All Boutiques ({stores.length})</option>
              {stores.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name} ({s.location})
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort product catalog"
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            >
              <option value="featured">Featured Curations</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="stock">Highest Stock</option>
            </select>

            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={refreshing}
              aria-label="Refresh marketplace catalog"
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Category Segmented Tabs (Buttons with click handlers) */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl overflow-x-auto no-scrollbar">
          {categories.map((c) => {
            const active = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Product Grid ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-96 animate-pulse p-4 space-y-3"
            >
              <div className="w-full h-56 bg-slate-200 dark:bg-slate-800 rounded-xl" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
              <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : sortedProducts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
          <Package className="w-10 h-10 text-slate-400 mx-auto" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            No pieces match this selection
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Try adjusting your search query, selecting another category, or viewing all verified boutiques.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setSelectedStoreSlug('all');
              setSearchQuery('');
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedProducts.map((p) => {
            const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
            return (
              <article
                key={p.id}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col transition-all hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm"
              >
                {/* 65-75% visual height */}
                <div className="relative w-full aspect-4/3 bg-stone-100 dark:bg-stone-900/60 overflow-hidden cursor-pointer" onClick={() => openProductDetail(p)}>
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
                  />
                  {p.stock <= 3 && p.stock > 0 && (
                    <div className="absolute top-3 left-3 bg-stone-900/80 backdrop-blur-xs text-amber-300 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                      Only {p.stock} left in atelier
                    </div>
                  )}
                </div>

                {/* Card Content with Zero-Pill Unboxed Metadata */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="truncate">{p.storeName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{p.categoryName || 'Luxury Collection'}</span>
                    </div>

                    <h3
                      onClick={() => openProductDetail(p)}
                      className="font-semibold text-base text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1 cursor-pointer"
                    >
                      {p.name}
                    </h3>

                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatPrice(p.price, p.currency)}
                      </span>
                      {p.compareAtPrice && p.compareAtPrice > p.price && (
                        <span className="font-mono text-xs text-slate-400 line-through tabular-nums">
                          {formatPrice(p.compareAtPrice, p.currency)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openProductDetail(p)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          addToCart(p, p.variants?.[0], 1);
                          setCartDrawerOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Add to Bag
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Product Detail Modal (PDP) ──────────────────────────────────────── */}
      {selectedProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
        >
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden my-8">
            <button
              type="button"
              onClick={() => setSelectedProduct(null)}
              aria-label="Close product detail"
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Left Gallery Image */}
              <div className="relative aspect-4/3 md:aspect-auto md:h-full bg-stone-100 dark:bg-stone-900/70 overflow-hidden">
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Right Contiguous Purchase Module */}
              <div className="p-6 md:p-8 flex flex-col justify-between space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {selectedProduct.storeName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedProduct.atelierLocation || 'Verified Atelier'}</span>
                  </div>

                  <h2
                    id="product-modal-title"
                    className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-snug"
                  >
                    {selectedProduct.name}
                  </h2>

                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatPrice(
                        activeVariant?.price ?? selectedProduct.price,
                        selectedProduct.currency
                      )}
                    </span>
                    {selectedProduct.compareAtPrice && (
                      <span className="font-mono text-sm text-slate-400 line-through tabular-nums">
                        {formatPrice(selectedProduct.compareAtPrice, selectedProduct.currency)}
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {selectedProduct.description}
                  </p>

                  {/* Variant Selection */}
                  {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Select Atelier Specification:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedProduct.variants.map((v) => {
                          const isSelected = activeVariant?.id === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setActiveVariant(v)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <span>{v.size}</span>
                              <span className="text-slate-400 ml-1">({v.color})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Craftsmanship Highlights */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-hidden="true" />
                      <span>Certified Atelier Authenticity & Documentation</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-hidden="true" />
                      <span>Complimentary Insured Courier & Signature Delivery</span>
                    </div>
                  </div>
                </div>

                {/* Purchase Bar */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 p-1">
                    <button
                      type="button"
                      onClick={() => setProductDetailQty((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                      className="w-7 h-7 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <span className="w-8 text-center font-mono text-xs font-bold tabular-nums">
                      {productDetailQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setProductDetailQty((q) => q + 1)}
                      aria-label="Increase quantity"
                      className="w-7 h-7 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      addToCart(selectedProduct, activeVariant || undefined, productDetailQty);
                      setSelectedProduct(null);
                      setCartDrawerOpen(true);
                    }}
                    className="flex-1 min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                    <span>Add to Bag · {formatPrice((activeVariant?.price ?? selectedProduct.price) * productDetailQty, selectedProduct.currency)}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Cart & Checkout Slide-Over Drawer ───────────────────────────────── */}
      {cartDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Shopping bag and checkout"
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h2 className="font-semibold text-base text-slate-900 dark:text-white">
                  Shopping Bag ({totalCartCount})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                aria-label="Close bag drawer"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {checkoutResult ? (
                <div className="p-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto" aria-hidden="true" />
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Order Confirmed
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Reference: <span className="font-mono font-bold text-slate-900 dark:text-white">{checkoutResult.orderNumber}</span>
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Your acquisition has been dispatched to the atelier order queue. Delivery window: {checkoutResult.receiptSummary.estimatedDelivery}.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutResult(null);
                        setCartDrawerOpen(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      Continue Browsing
                    </button>
                  </div>
                </div>
              ) : cartItems.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <Package className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Your bag is empty</p>
                  <p className="text-xs text-slate-500">Discover handcrafted pieces from our partner ateliers.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cartItems.map((it, idx) => {
                    const price = it.selectedVariant?.price ?? it.product.price;
                    return (
                      <div
                        key={`${it.product.id}_${it.selectedVariant?.id || 'base'}`}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start gap-3 bg-slate-50/50 dark:bg-slate-950/40"
                      >
                        <img
                          src={it.product.imageUrl}
                          alt={it.product.name}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 rounded-lg object-cover bg-stone-100 shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {it.product.name}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {it.product.storeName}
                            {it.selectedVariant && ` · ${it.selectedVariant.size}`}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                              {formatPrice(price * it.quantity, it.product.currency)}
                            </span>
                            <div className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(idx, -1)}
                                className="text-slate-500 hover:text-slate-900 text-xs px-1"
                              >
                                -
                              </button>
                              <span className="font-mono text-xs font-bold tabular-nums px-1">
                                {it.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(idx, 1)}
                                className="text-slate-500 hover:text-slate-900 text-xs px-1"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Customer Information Form */}
                  <form onSubmit={handleCheckoutSubmit} className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Client Delivery Details
                    </h3>
                    <div className="space-y-2">
                      <input
                        type="text"
                        required
                        value={customerInfo.name}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                        placeholder="Full Legal Name"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
                      />
                      <input
                        type="email"
                        required
                        value={customerInfo.email}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                        placeholder="Client Email (for receipt & tracking)"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        required
                        value={customerInfo.address}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                        placeholder="Delivery Street Address"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          value={customerInfo.city}
                          onChange={(e) => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                          placeholder="City"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          required
                          value={customerInfo.postalCode}
                          onChange={(e) => setCustomerInfo({ ...customerInfo, postalCode: e.target.value })}
                          placeholder="Postal Code"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {checkoutError && (
                      <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                        {checkoutError}
                      </p>
                    )}

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Courier & Insurance</span>
                        <span className="text-emerald-600 font-semibold">Complimentary</span>
                      </div>
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>Total Acquisition</span>
                        <span className="font-mono text-base font-bold tabular-nums">
                          {formatPrice(cartTotal)}
                        </span>
                      </div>

                      <button
                        type="submit"
                        disabled={checkoutSubmitting}
                        className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                      >
                        {checkoutSubmitting ? 'Initiating Checkout...' : 'Confirm Acquisition Order'}
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Architecture & Proxy Integration Modal ──────────────────────────── */}
      {infoModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="E-Commerce Architecture & Proxy Information"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setInfoModalOpen(false)}
              aria-label="Close architecture modal"
              className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                  Server-Side API Proxy Integration
                </h3>
                <p className="text-xs text-slate-500">
                  Option A Architecture (Cloned from PRIGID-WEB-CLOUD/looma-commerce-)
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Proxy Status:</span>
                  <span className="text-emerald-600 font-bold">Active (/api/store/*)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Upstream Backend:</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {proxyStatus?.baseUrl || 'Auto-Fallback (Standalone Safe)'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Active Tenant Scope:</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {selectedStoreSlug === 'all' ? 'Multi-Boutique Federation' : selectedStoreSlug}
                  </span>
                </div>
              </div>

              <p>
                <strong>How it connects:</strong> The Looma client makes requests to <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/api/store/products</code> and <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/api/store/checkout</code>. Looma’s backend worker proxies these to your standalone e-commerce API server configured via <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">STORE_API_BASE_URL</code>, keeping all product management, database mutations, and order administration securely isolated in your e-commerce dashboard.
              </p>

              <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 space-y-1">
                <p className="font-bold">E-Commerce Admin Dashboard Location:</p>
                <p className="font-mono text-[11px]">/looma-commerce/artifacts/luxe-boutique-admin</p>
                <p className="text-[11px] opacity-90">
                  Runs on port 5173 or separate production domain.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setInfoModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
