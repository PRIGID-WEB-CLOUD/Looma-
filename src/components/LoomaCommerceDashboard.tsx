import { useState, useEffect, useMemo, type FormEvent, type ChangeEvent } from 'react';
import {
  ShoppingBag,
  Store,
  Plus,
  Package,
  TrendingUp,
  Clock,
  CheckCircle,
  Truck,
  ArrowLeft,
  Search,
  ExternalLink,
  Upload,
  AlertCircle,
  Check,
  DollarSign,
  Share2,
  Trash2,
  X,
  Layers,
  Settings,
  ShieldCheck,
  Tag,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import {
  ensurePersonalMarketplaceStore,
  saveMarketplaceProductRecord,
  deleteMarketplaceProductRecord,
  saveMarketplaceStoreRecord,
  subscribePublishedMarketplaceStores,
  subscribePublishedMarketplaceProducts,
  subscribeSellerMarketplaceOrders,
  updateSellerMarketplaceOrderStatus,
} from '../services/commerce';
import { uploadMediaToCloudflareR2 } from '../services/storage';
import { MARKETPLACE_CATEGORIES } from '../types/social';
import type {
  MarketplaceProduct,
  MarketplaceStore,
  MarketplaceOrder,
  ProductCondition,
  ProductStatus,
  OrderStatus,
  PaymentStatus,
} from '../types/marketplace';
import type { UserProfile } from '../types/social';

export type CommerceDashboardTab = 'sell' | 'overview' | 'products' | 'orders' | 'channels' | 'settings';

export interface LoomaCommerceDashboardProps {
  profile: UserProfile;
  accountEmail?: string | null;
  isFirebaseBacked?: boolean;
  onReturnToMarketplace: () => void;
  initialTab?: CommerceDashboardTab;
}

interface CrossAuthData {
  uid: string;
  displayName: string;
  handle: string;
  email: string;
  avatarUrl: string;
}

function formatMoney(cents: number, currency = 'USD'): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

export default function LoomaCommerceDashboard({
  profile,
  accountEmail,
  isFirebaseBacked = false,
  onReturnToMarketplace,
  initialTab,
}: LoomaCommerceDashboardProps) {
  // Resolve cross-auth identity from URL parameters, localStorage, or current profile
  const [crossAuth, setCrossAuth] = useState<CrossAuthData>(() => {
    let resolvedUid = profile.uid || 'guest';
    let resolvedName = profile.displayName || 'Marketplace Seller';
    let resolvedHandle = profile.handle || 'seller';
    let resolvedEmail = accountEmail || '';
    let resolvedAvatar = profile.avatarUrl || '';

    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('socialUid')) {
          resolvedUid = params.get('socialUid')!;
          resolvedName = params.get('socialName') || resolvedName;
          resolvedHandle = params.get('socialHandle') || resolvedHandle;
          resolvedEmail = params.get('socialEmail') || resolvedEmail;
          resolvedAvatar = params.get('socialAvatar') || resolvedAvatar;
        } else {
          const stored = localStorage.getItem('looma_social_cross_auth_v1');
          if (stored) {
            const parsed = JSON.parse(stored) as Partial<CrossAuthData>;
            if (parsed.uid) {
              resolvedUid = parsed.uid;
              resolvedName = parsed.displayName || resolvedName;
              resolvedHandle = parsed.handle || resolvedHandle;
              resolvedEmail = parsed.email || resolvedEmail;
              resolvedAvatar = parsed.avatarUrl || resolvedAvatar;
            }
          }
        }
      } catch {}
    }

    return {
      uid: resolvedUid,
      displayName: resolvedName,
      handle: resolvedHandle,
      email: resolvedEmail,
      avatarUrl: resolvedAvatar,
    };
  });

  // Current Dashboard Tab
  const [activeTab, setActiveTab] = useState<CommerceDashboardTab>(() => {
    if (initialTab) return initialTab;
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('/products/new') || path.includes('/sell')) return 'sell';
      if (path.includes('/catalog') || path.includes('/products')) return 'products';
      if (path.includes('/orders')) return 'orders';
      if (path.includes('/channels')) return 'channels';
      if (path.includes('/settings')) return 'settings';
      const searchTab = new URLSearchParams(window.location.search).get('tab');
      if (searchTab === 'sell' || searchTab === 'products' || searchTab === 'orders' || searchTab === 'channels' || searchTab === 'settings') {
        return searchTab as CommerceDashboardTab;
      }
    }
    return 'overview';
  });

  // Stores & Products state
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [currentStore, setCurrentStore] = useState<MarketplaceStore | null>(null);

  // Status feedback toast
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4500);
  };

  // Form state for "Add Product / Sell Item"
  const [sellTitle, setSellTitle] = useState('');
  const [sellDescription, setSellDescription] = useState('');
  const [sellCategory, setSellCategory] = useState('Electronics & computers');
  const [sellPrice, setSellPrice] = useState('');
  const [sellCurrency, setSellCurrency] = useState('USD');
  const [sellStock, setSellStock] = useState('1');
  const [sellCondition, setSellCondition] = useState<ProductCondition>('Used - Like New');
  const [sellLocation, setSellLocation] = useState(profile.location || 'Eastern Region');
  const [sellImages, setSellImages] = useState<string[]>([]);
  const [sellUrlDraft, setSellUrlDraft] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Filters for Products Tab
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('All');

  // Filters for Orders Tab
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'paid' | 'shipped' | 'delivered'>('all');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Store Settings Form state
  const [storeNameInput, setStoreNameInput] = useState('');
  const [storeTaglineInput, setStoreTaglineInput] = useState('');
  const [storeCurrencyInput, setStoreCurrencyInput] = useState('USD');
  const [savingStore, setSavingStore] = useState(false);

  // Ensure personal seller store on mount
  useEffect(() => {
    let active = true;
    void ensurePersonalMarketplaceStore({
      profile: {
        ...profile,
        uid: crossAuth.uid,
        displayName: crossAuth.displayName,
        handle: crossAuth.handle,
      },
      existingStores: stores,
      persistToFirestore: isFirebaseBacked,
    }).then((personalStore) => {
      if (!active) return;
      setCurrentStore(personalStore);
      setStoreNameInput(personalStore.name);
      setStoreTaglineInput(personalStore.tagline);
      setStoreCurrencyInput(personalStore.currency || 'USD');
      setSellCurrency(personalStore.currency || 'USD');
    });
    return () => {
      active = false;
    };
  }, [crossAuth.uid, crossAuth.displayName, crossAuth.handle, isFirebaseBacked]);

  // Subscriptions to Stores & Products
  useEffect(() => {
    const unsubStores = subscribePublishedMarketplaceStores((items) => {
      setStores(items);
      const personal = items.find((s) => s.ownerUid === crossAuth.uid);
      if (personal) {
        setCurrentStore(personal);
      }
    });

    const unsubProducts = subscribePublishedMarketplaceProducts((items) => {
      setProducts(items);
    });

    return () => {
      unsubStores();
      unsubProducts();
    };
  }, [crossAuth.uid]);

  // Subscription to Seller's Orders
  useEffect(() => {
    if (!crossAuth.uid) return;
    const unsubOrders = subscribeSellerMarketplaceOrders(crossAuth.uid, (items) => {
      setOrders(items);
    });
    return () => {
      unsubOrders();
    };
  }, [crossAuth.uid]);

  // Seller's own products
  const myProducts = useMemo(() => {
    return products.filter((p) => p.ownerUid === crossAuth.uid);
  }, [products, crossAuth.uid]);

  // Filtered catalog products
  const filteredCatalog = useMemo(() => {
    return myProducts.filter((p) => {
      const matchSearch =
        !catalogSearch.trim() ||
        p.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        p.description.toLowerCase().includes(catalogSearch.toLowerCase());
      const matchCat = catalogCategory === 'All' || p.category === catalogCategory;
      return matchSearch && matchCat;
    });
  }, [myProducts, catalogSearch, catalogCategory]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      if (orderFilter === 'pending') return ord.status === 'PENDING' || ord.paymentStatus === 'pending';
      if (orderFilter === 'paid') return ord.paymentStatus === 'paid' && ord.status !== 'SHIPPED' && ord.status !== 'DELIVERED';
      if (orderFilter === 'shipped') return ord.status === 'SHIPPED';
      if (orderFilter === 'delivered') return ord.status === 'DELIVERED';
      return true;
    });
  }, [orders, orderFilter]);

  // Key Metrics
  const metrics = useMemo(() => {
    const grossRevenueCents = orders
      .filter((o) => o.paymentStatus === 'paid' || o.status === 'DELIVERED')
      .reduce((sum, o) => sum + o.totalCents, 0);

    const totalOrdersCount = orders.length;
    const pendingOrdersCount = orders.filter(
      (o) => o.status === 'PENDING' || o.paymentStatus === 'pending' || o.status === 'CONFIRMED'
    ).length;
    const lowStockCount = myProducts.filter((p) => p.stock > 0 && p.stock <= 2).length;

    return {
      revenue: grossRevenueCents,
      totalOrders: totalOrdersCount,
      activeProducts: myProducts.length,
      pendingOrders: pendingOrdersCount,
      lowStock: lowStockCount,
    };
  }, [orders, myProducts]);

  // Image upload handler
  const handleImageFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (sellImages.length >= 6) {
      showFeedback('Maximum 6 images per product listing.', 'error');
      return;
    }

    setUploadingImage(true);
    try {
      const uploaded = await uploadMediaToCloudflareR2(file, 'posts', {
        title: `product_${file.name.slice(0, 20)}`,
      });
      setSellImages((prev) => [...prev, uploaded.url]);
      showFeedback('Product image uploaded successfully.');
    } catch {
      // Fallback to local DataURL
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setSellImages((prev) => [...prev, reader.result as string]);
          showFeedback('Image loaded from device.');
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // Add Image URL
  const handleAddImageUrl = () => {
    const clean = sellUrlDraft.trim();
    if (!clean) return;
    if (sellImages.length >= 6) {
      showFeedback('Maximum 6 images per listing.', 'error');
      return;
    }
    setSellImages((prev) => [...prev, clean]);
    setSellUrlDraft('');
  };

  // Publish Product Submission
  const handlePublishProduct = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = sellTitle.trim();
    if (!cleanTitle) {
      showFeedback('Product title is required.', 'error');
      return;
    }
    const parsedPrice = parseFloat(sellPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      showFeedback('Please provide a valid price greater than 0.', 'error');
      return;
    }
    const parsedStock = parseInt(sellStock, 10);
    if (isNaN(parsedStock) || parsedStock < 0) {
      showFeedback('Stock count must be 0 or greater.', 'error');
      return;
    }

    setPublishing(true);
    try {
      // Ensure owner has a store
      const ownerStore =
        currentStore ||
        (await ensurePersonalMarketplaceStore({
          profile: {
            ...profile,
            uid: crossAuth.uid,
            displayName: crossAuth.displayName,
            handle: crossAuth.handle,
          },
          existingStores: stores,
          persistToFirestore: isFirebaseBacked,
        }));

      const primaryImage =
        sellImages[0] ||
        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80';
      const gallery = sellImages.slice(1);

      await saveMarketplaceProductRecord({
        storeId: ownerStore.id,
        storeName: ownerStore.name,
        storeSlug: ownerStore.slug,
        ownerUid: crossAuth.uid,
        title: cleanTitle,
        description: sellDescription.trim() || 'Genuine item listed through Looma Commerce.',
        category: sellCategory,
        priceCents: Math.round(parsedPrice * 100),
        currency: sellCurrency.toUpperCase(),
        imageUrl: primaryImage,
        galleryUrls: gallery,
        location: sellLocation.trim() || 'Eastern Region',
        condition: sellCondition,
        stock: parsedStock,
        status: 'ACTIVE' as ProductStatus,
        featured: false,
        isCreate: true,
      });

      showFeedback(`Product "${cleanTitle}" published successfully to your storefront and Looma Marketplace!`);

      // Reset form
      setSellTitle('');
      setSellDescription('');
      setSellPrice('');
      setSellStock('1');
      setSellImages([]);
      setActiveTab('products');
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to publish product.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  // Delete product action
  const handleDeleteProduct = async (prodId: string) => {
    if (!window.confirm('Are you sure you want to delete this listing from your store?')) return;
    try {
      await deleteMarketplaceProductRecord(prodId);
      showFeedback('Listing deleted from catalog.');
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to delete listing.', 'error');
    }
  };

  // Update order status action
  const handleUpdateOrderStatus = async (orderId: string, nextStatus: OrderStatus, nextPayment: PaymentStatus) => {
    setUpdatingOrderId(orderId);
    try {
      await updateSellerMarketplaceOrderStatus(orderId, {
        status: nextStatus,
        paymentStatus: nextPayment,
      });
      showFeedback(`Order updated to ${nextStatus.toLowerCase()} (${nextPayment}).`);
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to update order.', 'error');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Save Storefront Settings
  const handleSaveStoreSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentStore) return;
    setSavingStore(true);
    try {
      await saveMarketplaceStoreRecord({
        id: currentStore.id,
        name: storeNameInput.trim() || currentStore.name,
        tagline: storeTaglineInput.trim() || currentStore.tagline,
        currency: storeCurrencyInput.trim().toUpperCase() || 'USD',
        slug: currentStore.slug,
        ownerUid: crossAuth.uid,
        ownerHandle: crossAuth.handle,
        logoUrl: currentStore.logoUrl,
        bannerUrl: currentStore.bannerUrl,
        category: currentStore.category,
        publishStatus: currentStore.publishStatus,
        verified: currentStore.verified,
        featured: currentStore.featured,
        isCreate: false,
      });
      showFeedback('Storefront settings saved successfully.');
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to save store settings.', 'error');
    } finally {
      setSavingStore(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Top Bar: Cross-Auth & Platform Branding */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onReturnToMarketplace}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Marketplace</span>
            </button>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm">
                LC
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                    Looma Commerce
                  </h1>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                    Seller Hub
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                  Headless E-Commerce Dashboard &amp; Multi-Channel Inventory
                </p>
              </div>
            </div>
          </div>

          {/* Social Cross-Auth Verified Badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs">
              <div className="relative">
                {crossAuth.avatarUrl ? (
                  <img
                    src={crossAuth.avatarUrl}
                    alt={crossAuth.displayName}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center">
                    {crossAuth.displayName.charAt(0)}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white dark:border-slate-900" />
              </div>
              <div className="text-left">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs leading-none">
                  {crossAuth.displayName}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  @{crossAuth.handle} · Social Linked
                </span>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 ml-1" />
            </div>
          </div>
        </div>

        {/* Commerce Sub-Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-slate-100 dark:border-slate-800/60 py-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sell')}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'sell'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product (Sell Item)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'products'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Catalog ({myProducts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'orders'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Orders &amp; Fulfillment ({orders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('channels')}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'channels'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Channels &amp; Social Sync</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Storefront Settings</span>
          </button>
        </div>
      </header>

      {/* Floating Status Notification */}
      {feedback && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-rose-600 text-white border-rose-500'
          }`}
        >
          {feedback.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Main Dashboard Surface */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW / DASHBOARD                                               */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  Merchant Overview
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Live metrics for{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {currentStore?.name || 'Your Storefront'}
                  </span>{' '}
                  synchronized with Looma Marketplace.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('sell')}
                  className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Sell New Item</span>
                </button>
                <button
                  type="button"
                  onClick={onReturnToMarketplace}
                  className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <Store className="w-4 h-4" />
                  <span>Preview Storefront</span>
                </button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Gross Revenue</span>
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {formatMoney(metrics.revenue, currentStore?.currency || 'USD')}
                </div>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 block">
                  Completed &amp; paid orders
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Total Orders</span>
                  <ShoppingBag className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {metrics.totalOrders}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {metrics.pendingOrders} pending fulfillment
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Active Catalog SKUs</span>
                  <Package className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {metrics.activeProducts}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Published on Marketplace
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Inventory Status</span>
                  <Layers className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {metrics.lowStock > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">{metrics.lowStock} Low Stock</span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">Healthy</span>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {metrics.lowStock > 0 ? 'Restock recommended' : 'All SKUs in stock'}
                </span>
              </div>
            </div>

            {/* Recent Orders Overview */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent Buyer Orders</h3>
                  <p className="text-xs text-slate-500">Orders placed by customers through Looma Marketplace</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  View all ({orders.length})
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    No orders placed yet
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    When buyers purchase items from your storefront or message you on marketplace, orders will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="py-3.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white">
                            #{order.id.slice(-6).toUpperCase()}
                          </span>
                          <span className="text-xs text-slate-500">· {order.buyerName}</span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              order.paymentStatus === 'paid'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {order.paymentStatus}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {order.items.map((i) => `${i.quantity}x ${i.title}`).join(', ')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                          {formatMoney(order.totalCents, order.currency)}
                        </div>
                        <span className="text-[11px] text-slate-500 uppercase">{order.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: SELL ITEM / ADD PRODUCT                                            */}
        {/* ========================================================================= */}
        {activeTab === 'sell' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Sell an Item (Add to Catalog)
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                List products directly through your Looma Commerce dashboard. Your items will automatically synchronize to Looma Marketplace and your personal storefront.
              </p>
            </div>

            <form onSubmit={handlePublishProduct} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6 shadow-sm">
              {/* Product Photos */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Product Photos (Up to 6)
                </label>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {sellImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden group">
                      <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setSellImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/80 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {sellImages.length < 6 && (
                    <label className="aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 flex flex-col items-center justify-center p-2 text-center cursor-pointer transition-colors bg-slate-50 dark:bg-slate-950/50">
                      <Upload className={`w-5 h-5 text-slate-400 ${uploadingImage ? 'animate-bounce' : ''}`} />
                      <span className="text-[10px] text-slate-500 mt-1 font-semibold">
                        {uploadingImage ? 'Uploading...' : 'Upload File'}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageFileSelect}
                        className="hidden"
                        disabled={uploadingImage}
                      />
                    </label>
                  )}
                </div>

                {/* Direct Image URL input */}
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="Or enter image URL (https://...)"
                    value={sellUrlDraft}
                    onChange={(e) => setSellUrlDraft(e.target.value)}
                    className="flex-1 min-h-[38px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Add URL
                  </button>
                </div>
              </div>

              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Listing Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Manchester United 24/25 Home Jersey"
                    value={sellTitle}
                    onChange={(e) => setSellTitle(e.target.value)}
                    maxLength={100}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Category *
                  </label>
                  <select
                    value={sellCategory}
                    onChange={(e) => setSellCategory(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    {MARKETPLACE_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Price, Currency & Stock */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Price *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="150.00"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Currency
                  </label>
                  <select
                    value={sellCurrency}
                    onChange={(e) => setSellCurrency(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="GHS">GHS (GH₵)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="NGN">NGN (₦)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Available Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={sellStock}
                    onChange={(e) => setSellStock(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Condition & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Item Condition
                  </label>
                  <select
                    value={sellCondition}
                    onChange={(e) => setSellCondition(e.target.value as ProductCondition)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    <option value="New">New (Unopened / Boxed)</option>
                    <option value="Used - Like New">Used - Like New</option>
                    <option value="Used - Good">Used - Good Condition</option>
                    <option value="Used - Fair">Used - Fair Condition</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    City / Fulfillment Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. West Akim, Eastern Region"
                    value={sellLocation}
                    onChange={(e) => setSellLocation(e.target.value)}
                    maxLength={80}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Product Description
                </label>
                <textarea
                  rows={4}
                  placeholder="Provide specifications, authenticity details, warranty, delivery instructions..."
                  value={sellDescription}
                  onChange={(e) => setSellDescription(e.target.value)}
                  maxLength={1000}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className="min-h-[42px] px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={publishing}
                  className="min-h-[42px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-60 transition-colors shadow-sm"
                >
                  {publishing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Publishing to Catalog...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Publish Product to Storefront</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PRODUCT CATALOG                                                    */}
        {/* ========================================================================= */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  Product Catalog ({myProducts.length} items)
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  Manage your inventory, stock levels, and marketplace availability.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('sell')}
                className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
            </div>

            {/* Catalog Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search catalog by title or keyword..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full min-h-[40px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <select
                value={catalogCategory}
                onChange={(e) => setCatalogCategory(e.target.value)}
                className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
              >
                {MARKETPLACE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Catalog Table / Cards */}
            {filteredCatalog.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
                <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {catalogSearch || catalogCategory !== 'All' ? 'No matching products' : 'Your catalog is empty'}
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {catalogSearch || catalogCategory !== 'All'
                    ? 'Try clearing your filters to see all listed items.'
                    : 'Start selling by adding your first product to your Looma Commerce catalog.'}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('sell')}
                  className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 mt-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>List Item Now</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCatalog.map((product) => (
                  <div
                    key={product.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-sm flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="aspect-video rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-900/80 text-white">
                          {product.category}
                        </span>
                        {product.condition && (
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-semibold bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white">
                            {product.condition}
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                          {product.title}
                        </h4>
                        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                          {product.description}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {formatMoney(product.priceCents, product.currency)}
                        </div>
                        <span className="text-[11px] text-slate-500">Stock: {product.stock} units</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                          aria-label={`Delete ${product.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: ORDERS & FULFILLMENT                                               */}
        {/* ========================================================================= */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  Orders &amp; Fulfillment ({orders.length})
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  Track buyer transactions, verify payment statuses, and mark orders shipped.
                </p>
              </div>
            </div>

            {/* Order status filters */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: 'All Orders' },
                  { id: 'pending', label: 'Pending Payment' },
                  { id: 'paid', label: 'Paid (Awaiting Shipment)' },
                  { id: 'shipped', label: 'Shipped' },
                  { id: 'delivered', label: 'Delivered' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setOrderFilter(f.id)}
                  className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                    orderFilter === f.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Orders List */}
            {filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
                <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  No orders match this filter
                </p>
                <p className="text-xs text-slate-500">
                  When new buyers purchase items, they will appear here in your fulfillment queue.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            Order #{order.id.slice(-8).toUpperCase()}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              order.paymentStatus === 'paid'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            Payment: {order.paymentStatus}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              order.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : order.status === 'SHIPPED'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            Status: {order.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Buyer: <span className="font-semibold text-slate-700 dark:text-slate-300">{order.buyerName}</span> ·{' '}
                          {order.shippingPhone || 'No phone provided'} · {order.shippingCity || order.shippingAddress}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-xs text-slate-500 block">Total Amount</span>
                        <span className="font-bold text-base text-slate-900 dark:text-white">
                          {formatMoney(order.totalCents, order.currency)}
                        </span>
                      </div>
                    </div>

                    {/* Order line items */}
                    <div className="space-y-2">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                className="w-8 h-8 rounded-lg object-cover shrink-0"
                              />
                            )}
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                              {item.title}
                            </span>
                          </div>
                          <div className="text-slate-600 dark:text-slate-400 tabular-nums shrink-0 ml-2">
                            {item.quantity} × {formatMoney(item.priceCents, order.currency)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Fulfillment Action Buttons */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
                      {order.paymentStatus !== 'paid' && (
                        <button
                          type="button"
                          disabled={updatingOrderId === order.id}
                          onClick={() => handleUpdateOrderStatus(order.id, 'CONFIRMED', 'paid')}
                          className="min-h-[34px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Mark as Paid
                        </button>
                      )}

                      {order.status !== 'SHIPPED' && order.status !== 'DELIVERED' && (
                        <button
                          type="button"
                          disabled={updatingOrderId === order.id}
                          onClick={() => handleUpdateOrderStatus(order.id, 'SHIPPED', 'paid')}
                          className="min-h-[34px] px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Mark as Shipped</span>
                        </button>
                      )}

                      {order.status !== 'DELIVERED' && (
                        <button
                          type="button"
                          disabled={updatingOrderId === order.id}
                          onClick={() => handleUpdateOrderStatus(order.id, 'DELIVERED', 'paid')}
                          className="min-h-[34px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Mark as Delivered</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: CHANNELS & OMNICHANNEL COMMERCE                                     */}
        {/* ========================================================================= */}
        {activeTab === 'channels' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Omnichannel Commerce &amp; Social Feeds
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Sync your Looma Commerce catalog across Meta Commerce, Instagram, TikTok, WhatsApp, and X.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Meta Commerce &amp; Instagram Shop
                  </h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Automatically generates product catalog feeds for your Facebook Page Shop and Instagram Business shopping tags.
                </p>
                <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Synced SKUs: {myProducts.length}</span>
                  <span className="font-semibold text-blue-600">Feed URL live</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    WhatsApp Business Catalog
                  </h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    Connected
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enables instant click-to-chat ordering and direct payment confirmation via WhatsApp.
                </p>
                <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Fast checkout link</span>
                  <span className="font-semibold text-blue-600">Enabled</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    TikTok Shop Bridge
                  </h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Ready to Link
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Export catalog inventory and SKU tags directly for short-video live commerce broadcasts.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    X (Twitter) Concierge &amp; Broadcast
                  </h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Broadcast new catalog releases and flash sales to your social audience with automated cards.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: STORE SETTINGS                                                     */}
        {/* ========================================================================= */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Storefront Settings
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Configure your public marketplace store brand name, default currency, and business description.
              </p>
            </div>

            <form onSubmit={handleSaveStoreSettings} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-sm">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Storefront Brand Name
                </label>
                <input
                  type="text"
                  required
                  value={storeNameInput}
                  onChange={(e) => setStoreNameInput(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Store Tagline / Bio
                </label>
                <input
                  type="text"
                  value={storeTaglineInput}
                  onChange={(e) => setStoreTaglineInput(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Primary Store Currency
                </label>
                <select
                  value={storeCurrencyInput}
                  onChange={(e) => setStoreCurrencyInput(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                >
                  <option value="USD">USD - US Dollar ($)</option>
                  <option value="GHS">GHS - Ghanaian Cedi (GH₵)</option>
                  <option value="EUR">EUR - Euro (€)</option>
                  <option value="GBP">GBP - British Pound (£)</option>
                  <option value="NGN">NGN - Nigerian Naira (₦)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={savingStore}
                  className="min-h-[42px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 transition-colors shadow-sm"
                >
                  {savingStore ? 'Saving Changes...' : 'Save Storefront Settings'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
