import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Armchair,
  ArrowLeft,
  Baby,
  Bell,
  Bookmark,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  ExternalLink,
  Gamepad2,
  Gem,
  Home,
  Inbox,
  Landmark,
  Laptop,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Minus,
  MoreHorizontal,
  Music,
  Package,
  Palette,
  PawPrint,
  Plus,
  Refrigerator,
  Search,
  Share2,
  Shirt,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Trees,
  Trophy,
  User,
  UserCheck,
  UserPlus,
  Users,
  Watch,
  Wrench,
  X,
} from 'lucide-react';
import type { ChatThread, UserProfile } from '../types/social';
import type { BusinessProfile } from '../types/business';
import type {
  CartItem,
  CommerceProxyStatus,
  MarketplaceInboxFilter,
  MarketplaceInboxRole,
  MarketplaceOrder,
  MarketplaceProduct,
  MarketplaceStore,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../types/marketplace';
import {
  cancelMarketplaceOrderBuyer,
  createMarketplaceOrderRecord,
  deleteMarketplaceProductRecord,
  fetchCommerceProxyStatus,
  fetchUpstreamMarketplaceCatalog,
  submitUpstreamProxyCheckout,
  subscribeActiveMarketplaceProducts,
  subscribeBuyerMarketplaceOrders,
  subscribePublishedMarketplaceStores,
  subscribeSellerMarketplaceOrders,
  updateSellerMarketplaceOrderStatus,
} from '../services/commerce';
import { launchCommerceDashboardSso, provisionCommerceStoreForBusiness } from '../services/businessProfiles';
import { formatCurrencyCents } from '../services/marketplaceCatalogAssets';
import {
  ALL_MARKETPLACE_CATEGORIES,
  MARKETPLACE_INBOX_FILTERS,
  RADIUS_OPTIONS_KM,
  TOP_MARKETPLACE_CATEGORIES,
  filterMarketplaceProducts,
  formatListingTimestamp,
  getSuggestedStorefronts,
  removeRecentSearch,
  resolveListingImages,
  resolveMarketplaceInboxEntries,
  resolveSellerSummary,
  toggleStringListItem,
  upsertRecentSearch,
  type CategoryIconKey,
  type ResolvedMarketplaceSeller,
  type TrackedMarketplaceThreadHint,
} from '../utils/marketplaceLogic';
import { VerifiedBadge } from './VerifiedBadge';

interface MarketplaceViewProps {
  profile: UserProfile;
  knownUsers: UserProfile[];
  followedUserIds: string[];
  threads?: ChatThread[];
  accountEmail: string | null;
  isAuthorized?: boolean;
  isFirebaseBacked: boolean;
  initialStoreSlug?: string | null;
  marketplaceEnabled?: boolean;
  businesses?: BusinessProfile[];
  onMessageSeller: (
    sellerUid: string,
    initialMessage?: string,
    listingContext?: { id: string; title: string; priceFormatted: string }
  ) => Promise<void> | void;
  onToggleFollowSeller: (sellerUid: string) => Promise<void> | void;
  onOpenInbox?: () => void;
  onOpenChatThread?: (threadId?: string) => void;
  onOpenSellerProfile: (sellerUid: string) => void;
  onOpenBusinessProfile?: (slug: string) => void;
  onOpenProductDetail?: (productId: string) => void;
  onCreateBusinessProfile?: () => void;
  onLaunchBusinessSeller?: (businessProfileId: string) => Promise<void>;
  onRequireAuth?: () => void;
}

type MarketplaceSubView =
  | 'home'
  | 'inbox'
  | 'categories'
  | 'search'
  | 'detail'
  | 'seller'
  | 'account'
  | 'orders';

function CategoryIcon({
  iconKey,
  className = 'w-5 h-5',
}: {
  iconKey: CategoryIconKey;
  className?: string;
}) {
  switch (iconKey) {
    case 'car':
      return <Car className={className} aria-hidden="true" />;
    case 'home':
      return <Home className={className} aria-hidden="true" />;
    case 'women':
      return <ShoppingBag className={className} aria-hidden="true" />;
    case 'men':
      return <Shirt className={className} aria-hidden="true" />;
    case 'furniture':
      return <Armchair className={className} aria-hidden="true" />;
    case 'electronics':
      return <Laptop className={className} aria-hidden="true" />;
    case 'watch':
      return <Watch className={className} aria-hidden="true" />;
    case 'bag':
      return <Briefcase className={className} aria-hidden="true" />;
    case 'ceramics':
      return <Coffee className={className} aria-hidden="true" />;
    case 'antiques':
      return <Landmark className={className} aria-hidden="true" />;
    case 'appliances':
      return <Refrigerator className={className} aria-hidden="true" />;
    case 'arts':
      return <Palette className={className} aria-hidden="true" />;
    case 'autoparts':
      return <Wrench className={className} aria-hidden="true" />;
    case 'baby':
      return <Baby className={className} aria-hidden="true" />;
    case 'books':
      return <BookOpen className={className} aria-hidden="true" />;
    case 'digital':
      return <Sparkles className={className} aria-hidden="true" />;
    case 'beauty':
      return <Sparkles className={className} aria-hidden="true" />;
    case 'garden':
      return <Trees className={className} aria-hidden="true" />;
    case 'jewelry':
      return <Gem className={className} aria-hidden="true" />;
    case 'music':
      return <Music className={className} aria-hidden="true" />;
    case 'pet':
      return <PawPrint className={className} aria-hidden="true" />;
    case 'sports':
      return <Trophy className={className} aria-hidden="true" />;
    case 'toys':
      return <Gamepad2 className={className} aria-hidden="true" />;
    default:
      return <Tag className={className} aria-hidden="true" />;
  }
}

function AvatarFallback({
  src,
  name,
  sizeClass = 'w-11 h-11',
  textClass = 'text-sm',
  ringClass = '',
}: {
  src?: string;
  name: string;
  sizeClass?: string;
  textClass?: string;
  ringClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initials = (name || 'M')
    .trim()
    .split(/\s+/)
    .map((p) => p[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeClass} rounded-full object-cover bg-slate-200 dark:bg-slate-800 shrink-0 ${ringClass}`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center shrink-0 ${textClass} ${ringClass}`}
    >
      {initials || 'M'}
    </div>
  );
}

function ProductSquareTile({
  product,
  onSelect,
}: {
  product: MarketplaceProduct;
  onSelect: (prod: MarketplaceProduct) => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [product.imageUrl]);

  const formattedPrice = formatCurrencyCents(product.priceCents, product.currency);

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="group text-left focus:outline-none cursor-pointer w-full"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900">
        {product.imageUrl && !failed ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-3 text-center">
            <ShoppingBag className="w-7 h-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <span className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
              {product.title}
            </span>
          </div>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-slate-950/55 flex items-center justify-center">
            <span className="text-xs font-semibold text-white tracking-wide uppercase">
              Sold Out
            </span>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[13px] sm:text-sm leading-snug text-slate-900 dark:text-white truncate">
        <span className="font-semibold tabular-nums">{formattedPrice}</span>
        <span className="mx-1 text-slate-400">·</span>
        <span className="font-medium">{product.title}</span>
      </p>
    </button>
  );
}

function GalleryGrid({
  images,
  title,
  onOpenLightbox,
}: {
  images: string[];
  title: string;
  onOpenLightbox: (index: number) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="aspect-[4/3] w-full rounded-xl bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center gap-2">
        <ShoppingBag className="w-10 h-10 text-slate-400" aria-hidden="true" />
        <span className="text-xs text-slate-500">{title}</span>
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <button
        type="button"
        onClick={() => onOpenLightbox(0)}
        className="w-full aspect-square sm:aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900 cursor-pointer block"
      >
        <img
          src={images[0]}
          alt={title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover hover:scale-[1.01] transition-transform duration-300"
        />
      </button>
    );
  }

  if (images.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900">
        {images.map((src, idx) => (
          <button
            key={`${src}_${idx}`}
            type="button"
            onClick={() => onOpenLightbox(idx)}
            className="aspect-square overflow-hidden cursor-pointer block"
          >
            <img
              src={src}
              alt={`${title} view ${idx + 1}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    );
  }

  const topTwo = images.slice(0, 2);
  const bottomRow = images.slice(2, 5);
  const overflowCount = images.length > 5 ? images.length - 5 : 0;

  return (
    <div className="space-y-1 rounded-xl overflow-hidden">
      <div className="grid grid-cols-2 gap-1">
        {topTwo.map((src, idx) => (
          <button
            key={`${src}_${idx}`}
            type="button"
            onClick={() => onOpenLightbox(idx)}
            className="aspect-square overflow-hidden bg-slate-100 dark:bg-slate-900 cursor-pointer block"
          >
            <img
              src={src}
              alt={`${title} view ${idx + 1}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
      <div
        className={`grid gap-1 ${
          bottomRow.length === 1
            ? 'grid-cols-1'
            : bottomRow.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-3'
        }`}
      >
        {bottomRow.map((src, idx) => {
          const isLastWithOverflow =
            idx === bottomRow.length - 1 && overflowCount > 0;
          return (
            <button
              key={`${src}_${idx + 2}`}
              type="button"
              onClick={() => onOpenLightbox(idx + 2)}
              className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-900 cursor-pointer block"
            >
              <img
                src={src}
                alt={`${title} view ${idx + 3}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              {isLastWithOverflow && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-lg font-bold text-white tabular-nums">
                    +{overflowCount}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LocationRadiusMapCard({
  locationLabel,
  radiusKm,
}: {
  locationLabel: string;
  radiusKm: number;
}) {
  return (
    <div className="relative h-28 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#e6efe2] dark:bg-slate-900">
      <svg
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-75 dark:opacity-25"
        aria-hidden="true"
      >
        <path
          d="M-10 90 Q 95 65, 195 72 T 410 35"
          fill="none"
          stroke="#ffffff"
          strokeWidth="6"
        />
        <path
          d="M110 -10 Q 155 55, 225 130"
          fill="none"
          stroke="#ffffff"
          strokeWidth="4"
        />
        <path
          d="M270 -10 Q 305 60, 340 130"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
        />
        <path
          d="M0 30 Q 140 18, 280 55 T 405 95"
          fill="none"
          stroke="#cbd5c0"
          strokeWidth="2"
        />
      </svg>
      <div className="relative z-10 h-full w-full flex items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-slate-500/20 dark:bg-blue-400/20 border-2 border-slate-600/40 dark:border-blue-400/50 flex flex-col items-center justify-center px-2 text-center">
          <span className="text-xs font-semibold text-slate-900 dark:text-white leading-tight line-clamp-2">
            {locationLabel || 'Local area'}
          </span>
        </div>
      </div>
      <span className="absolute bottom-2 right-2.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 tabular-nums">
        ~{radiusKm} km radius
      </span>
    </div>
  );
}

function QuickMessageCard({
  sellerName,
  isSelf,
  onSend,
  onOpenInbox,
}: {
  sellerName: string;
  isSelf: boolean;
  onSend: (message: string) => Promise<void>;
  onOpenInbox: () => void;
}) {
  const [draft, setDraft] = useState('Is this still available? 😊');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isSelf) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-4">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          Your marketplace listing
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Buyers can message you directly from this card. Manage stock or mark as sold below.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(draft.trim());
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Unable to send message to ${sellerName}.`
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3"
    >
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
        <span className="text-sm font-bold text-slate-900 dark:text-white">
          Send seller a message
        </span>
      </div>

      <input
        type="text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (sent) setSent(false);
        }}
        placeholder="Is this still available?"
        className="w-full min-h-[42px] px-4 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />

      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {sent ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2">
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Sent to {sellerName}
          </span>
          <button
            type="button"
            onClick={onOpenInbox}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
          >
            View in Inbox
          </button>
        </div>
      ) : (
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="w-full min-h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      )}
    </form>
  );
}

export function MarketplaceView({
  profile,
  knownUsers,
  followedUserIds,
  threads = [],
  accountEmail,
  isAuthorized = true,
  isFirebaseBacked,
  initialStoreSlug = null,
  marketplaceEnabled = true,
  businesses = [],
  onMessageSeller,
  onToggleFollowSeller,
  onOpenInbox,
  onOpenChatThread,
  onOpenSellerProfile,
  onOpenBusinessProfile,
  onOpenProductDetail,
  onCreateBusinessProfile,
  onLaunchBusinessSeller,
  onRequireAuth,
}: MarketplaceViewProps) {
  const uidKey = profile.uid || 'guest';
  const bagStorageKey = `looma_marketplace_bag_v2_${uidKey}`;
  const prefsStorageKey = `looma_marketplace_prefs_v2_${uidKey}`;
  const inboxHintsStorageKey = `looma_marketplace_inbox_hints_v1_${uidKey}`;

  const [subView, setSubView] = useState<MarketplaceSubView>('home');
  const [viewHistory, setViewHistory] = useState<MarketplaceSubView[]>([]);

  const [proxyStatus, setProxyStatus] = useState<CommerceProxyStatus | null>(null);
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [sellerOrders, setSellerOrders] = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Marketplace Inbox state
  const [inboxRole, setInboxRole] = useState<MarketplaceInboxRole>('selling');
  const [inboxFilter, setInboxFilter] = useState<MarketplaceInboxFilter>('all');
  const [updatingInboxOrderId, setUpdatingInboxOrderId] = useState<string | null>(null);

  // Business Profile Merchant Portal Launcher state
  const [sellBusinessPickerOpen, setSellBusinessPickerOpen] = useState(false);
  const [launchingBpId, setLaunchingBpId] = useState<string | null>(null);
  const [sellLauncherError, setSellLauncherError] = useState<string | null>(null);

  const handleOpenMerchantSell = () => {
    if (!isAuthorized) {
      onRequireAuth?.();
      return;
    }
    setSellLauncherError(null);
    setSellBusinessPickerOpen(true);
  };

  const handleSelectBusinessForSelling = async (bp: BusinessProfile) => {
    setLaunchingBpId(bp.id);
    setSellLauncherError(null);
    try {
      if (onLaunchBusinessSeller) {
        await onLaunchBusinessSeller(bp.id);
      } else {
        await provisionCommerceStoreForBusiness(bp.id).catch(() => {});
        await launchCommerceDashboardSso(bp.id);
      }
    } catch (err) {
      setSellLauncherError(
        err instanceof Error ? err.message : 'Unable to launch Merchant Portal for this Business Profile.'
      );
    } finally {
      setLaunchingBpId(null);
    }
  };
  const [inboxThreadHints, setInboxThreadHints] = useState<TrackedMarketplaceThreadHint[]>(() => {
    try {
      const raw = window.localStorage.getItem(inboxHintsStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as TrackedMarketplaceThreadHint[]) : [];
    } catch {
      return [];
    }
  });

  // Filters
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [localOnly, setLocalOnly] = useState(false);

  // Location & persisted marketplace preferences
  const [marketLocation, setMarketLocation] = useState<string>(() => {
    try {
      const raw = window.localStorage.getItem(prefsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { location?: string };
        if (parsed.location) return parsed.location;
      }
    } catch {
      // ignore
    }
    return profile.location || 'Kade';
  });
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(prefsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { radiusKm?: number };
        if (typeof parsed.radiusKm === 'number') return parsed.radiusKm;
      }
    } catch {
      // ignore
    }
    return 65;
  });
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(prefsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { recentSearches?: string[] };
        if (Array.isArray(parsed.recentSearches)) return parsed.recentSearches;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [savedSearches, setSavedSearches] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(prefsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { savedSearches?: string[] };
        if (Array.isArray(parsed.savedSearches)) return parsed.savedSearches;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [savedListingIds, setSavedListingIds] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(prefsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { savedListingIds?: string[] };
        if (Array.isArray(parsed.savedListingIds)) return parsed.savedListingIds;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [alertListingIds, setAlertListingIds] = useState<string[]>([]);

  // Location modal
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationInput, setLocationInput] = useState(marketLocation);
  const [radiusInput, setRadiusInput] = useState(radiusKm);

  // Selected listing & seller
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedSellerUid, setSelectedSellerUid] = useState<string | null>(null);
  const [pdpQty, setPdpQty] = useState(1);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [detailMoreMenuOpen, setDetailMoreMenuOpen] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Shopping Bag & Checkout
  const [bagOpen, setBagOpen] = useState(false);
  const [bagItems, setBagItems] = useState<CartItem[]>(() => {
    try {
      const raw = window.localStorage.getItem(bagStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [shippingName, setShippingName] = useState(profile.displayName || '');
  const [shippingPhone, setShippingPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingCity, setShippingCity] = useState(profile.location || '');
  const [orderNote, setOrderNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<{
    id: string;
    totalCents: number;
    currency: string;
    storeName: string;
  } | null>(null);



  // Persist prefs & bag
  useEffect(() => {
    try {
      window.localStorage.setItem(
        prefsStorageKey,
        JSON.stringify({
          location: marketLocation,
          radiusKm,
          recentSearches,
          savedSearches,
          savedListingIds,
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [
    prefsStorageKey,
    marketLocation,
    radiusKm,
    recentSearches,
    savedSearches,
    savedListingIds,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(bagStorageKey, JSON.stringify(bagItems));
    } catch {
      // ignore
    }
  }, [bagItems, bagStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        inboxHintsStorageKey,
        JSON.stringify(inboxThreadHints.slice(0, 40))
      );
    } catch {
      // ignore
    }
  }, [inboxThreadHints, inboxHintsStorageKey]);

  const recordMarketplaceThreadHint = (hint: TrackedMarketplaceThreadHint) => {
    setInboxThreadHints((prev) => [
      hint,
      ...prev.filter(
        (item) => !(item.partnerUid === hint.partnerUid && item.role === hint.role)
      ),
    ]);
  };

  useEffect(() => {
    if (!toastNotice) return;
    const t = window.setTimeout(() => setToastNotice(null), 3200);
    return () => window.clearTimeout(t);
  }, [toastNotice]);

  useEffect(() => {
    let active = true;
    void fetchCommerceProxyStatus().then((status) => {
      if (!active) return;
      setProxyStatus(status);
      if (status.upstreamConfigured) {
        setPaymentMethod('card');
        void fetchUpstreamMarketplaceCatalog(status.defaultStoreId || undefined).then(
          (res) => {
            if (!active || !res.ok) return;
            if (res.stores && res.stores.length > 0) {
              setStores((prev) => (prev.length > 0 ? prev : res.stores!));
            }
            if (res.products && res.products.length > 0) {
              setProducts((prev) => (prev.length > 0 ? prev : res.products!));
            }
          }
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseBacked || !profile.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const unsubStores = subscribePublishedMarketplaceStores(
      (nextStores) => {
        setStores(nextStores);
        setLoading(false);
      },
      (err) => {
        setLoadError(
          err instanceof Error ? err.message : 'Unable to load marketplace storefronts.'
        );
        setLoading(false);
      }
    );

    const unsubProducts = subscribeActiveMarketplaceProducts(
      (nextProducts) => {
        setProducts(nextProducts);
        setLoading(false);
      },
      (err) => {
        setLoadError(
          err instanceof Error ? err.message : 'Unable to load product catalog.'
        );
        setLoading(false);
      }
    );

    const unsubOrders = subscribeBuyerMarketplaceOrders(
      profile.uid,
      (nextOrders) => {
        setOrders(nextOrders);
      },
      () => {
        // Non-fatal
      }
    );

    const unsubSellerOrders = subscribeSellerMarketplaceOrders(
      profile.uid,
      (nextOrders) => {
        setSellerOrders(nextOrders);
      },
      () => {
        // Non-fatal
      }
    );

    return () => {
      unsubStores();
      unsubProducts();
      unsubOrders();
      unsubSellerOrders();
    };
  }, [isFirebaseBacked, profile.uid]);

  useEffect(() => {
    if (!initialStoreSlug || stores.length === 0) return;
    const match = stores.find(
      (s) => s.slug === initialStoreSlug || s.id === initialStoreSlug
    );
    if (match) {
      setSelectedStoreId(match.id);
    }
  }, [initialStoreSlug, stores]);

  const navigateTo = (nextView: MarketplaceSubView) => {
    setViewHistory((prev) => [...prev.slice(-8), subView]);
    setSubView(nextView);
    setDetailMoreMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const navigateBack = () => {
    setDetailMoreMenuOpen(false);
    setViewHistory((prev) => {
      if (prev.length === 0) {
        setSubView('home');
        return [];
      }
      const last = prev[prev.length - 1];
      setSubView(last);
      return prev.slice(0, -1);
    });
  };

  const openListingDetail = (product: MarketplaceProduct) => {
    if (onOpenProductDetail) {
      onOpenProductDetail(product.id);
      return;
    }
    setSelectedProductId(product.id);
    setPdpQty(1);
    setLightboxIndex(null);
    navigateTo('detail');
  };

  const openSellerView = (sellerUid: string) => {
    setSelectedSellerUid(sellerUid);
    navigateTo('seller');
  };

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const selectedProductStore = useMemo(() => {
    if (!selectedProduct) return null;
    return stores.find((s) => s.id === selectedProduct.storeId) || null;
  }, [selectedProduct, stores]);

  const selectedProductSeller: ResolvedMarketplaceSeller | null = useMemo(() => {
    if (!selectedProduct) return null;
    return resolveSellerSummary({
      sellerUid: selectedProduct.ownerUid,
      store: selectedProductStore,
      knownUsers,
      currentUser: profile,
    });
  }, [selectedProduct, selectedProductStore, knownUsers, profile]);

  const activeSellerProfile: ResolvedMarketplaceSeller | null = useMemo(() => {
    if (!selectedSellerUid) return null;
    const sellerStore = stores.find((s) => s.ownerUid === selectedSellerUid) || null;
    return resolveSellerSummary({
      sellerUid: selectedSellerUid,
      store: sellerStore,
      knownUsers,
      currentUser: profile,
    });
  }, [selectedSellerUid, stores, knownUsers, profile]);

  const sellerListings = useMemo(() => {
    if (!selectedSellerUid) return [];
    return products.filter((p) => p.ownerUid === selectedSellerUid && p.status === 'ACTIVE');
  }, [products, selectedSellerUid]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) || null,
    [selectedStoreId, stores]
  );

  const filteredProducts = useMemo(
    () =>
      filterMarketplaceProducts(products, {
        storeId: selectedStoreId,
        category: selectedCategory,
        query: searchQuery,
        locationQuery: marketLocation,
        localOnly,
      }),
    [products, selectedStoreId, selectedCategory, searchQuery, marketLocation, localOnly]
  );

  const searchLiveResults = useMemo(
    () =>
      filterMarketplaceProducts(products, {
        query: searchDraft,
      }),
    [products, searchDraft]
  );

  const suggestedStorefronts = useMemo(
    () => getSuggestedStorefronts(stores, products, selectedProduct?.storeId, 4),
    [stores, products, selectedProduct?.storeId]
  );

  const myListings = useMemo(
    () => products.filter((p) => p.ownerUid === profile.uid),
    [products, profile.uid]
  );

  const savedProducts = useMemo(
    () => products.filter((p) => savedListingIds.includes(p.id)),
    [products, savedListingIds]
  );

  const inboxEntries = useMemo(
    () =>
      resolveMarketplaceInboxEntries({
        currentUid: profile.uid,
        role: inboxRole,
        filter: inboxFilter,
        buyerOrders: orders,
        sellerOrders,
        threads,
        products,
        stores,
        knownUsers,
        threadHints: inboxThreadHints,
      }),
    [
      profile.uid,
      inboxRole,
      inboxFilter,
      orders,
      sellerOrders,
      threads,
      products,
      stores,
      knownUsers,
      inboxThreadHints,
    ]
  );

  const handleOpenInboxChat = async (
    partnerUid: string,
    existingThreadId?: string | null
  ) => {
    if (existingThreadId && onOpenChatThread) {
      onOpenChatThread(existingThreadId);
      return;
    }
    if (partnerUid && partnerUid !== profile.uid) {
      await onMessageSeller(partnerUid);
      return;
    }
    if (onOpenChatThread) {
      onOpenChatThread();
    } else {
      onOpenInbox?.();
    }
  };

  const handleSellerOrderUpdate = async (
    orderId: string,
    updates: { status?: OrderStatus; paymentStatus?: PaymentStatus },
    noticeText: string
  ) => {
    if (!isFirebaseBacked || updatingInboxOrderId) return;
    setUpdatingInboxOrderId(orderId);
    try {
      await updateSellerMarketplaceOrderStatus(orderId, updates);
      setToastNotice(noticeText);
    } catch (err) {
      setToastNotice(
        err instanceof Error ? err.message : 'Unable to update order right now.'
      );
    } finally {
      setUpdatingInboxOrderId(null);
    }
  };

  const bagCount = useMemo(
    () => bagItems.reduce((sum, item) => sum + item.quantity, 0),
    [bagItems]
  );

  const bagSubtotalCents = useMemo(
    () => bagItems.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    [bagItems]
  );

  const bagCurrency = bagItems[0]?.currency || activeStore?.currency || 'USD';
  const shippingCents = bagItems.length > 0 && bagSubtotalCents < 25000 ? 1500 : 0;
  const bagTotalCents = bagSubtotalCents + shippingCents;

  const handleAddToBag = (product: MarketplaceProduct, quantity: number = 1) => {
    if (product.stock <= 0) return;
    setConfirmedOrder(null);
    setCheckoutError(null);
    setBagItems((prev) => {
      if (prev.length > 0 && prev[0].storeId !== product.storeId) {
        setToastNotice(
          `Bag switched to ${product.storeName} (orders are placed per storefront).`
        );
        return [
          {
            productId: product.id,
            storeId: product.storeId,
            storeName: product.storeName,
            title: product.title,
            priceCents: product.priceCents,
            currency: product.currency,
            imageUrl: product.imageUrl,
            quantity: Math.min(quantity, Math.max(1, product.stock)),
            maxStock: product.stock,
          },
        ];
      }

      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? {
                ...i,
                quantity: Math.min(i.quantity + quantity, Math.max(1, product.stock)),
              }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          storeId: product.storeId,
          storeName: product.storeName,
          title: product.title,
          priceCents: product.priceCents,
          currency: product.currency,
          imageUrl: product.imageUrl,
          quantity: Math.min(quantity, Math.max(1, product.stock)),
          maxStock: product.stock,
        },
      ];
    });
    setToastNotice(`Added ${product.title} to your bag.`);
  };

  const updateBagQuantity = (productId: string, delta: number) => {
    setBagItems((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: Math.min(item.maxStock, item.quantity + delta),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handlePlaceOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAuthorized) {
      onRequireAuth?.();
      return;
    }
    if (bagItems.length === 0) return;

    if (!shippingName.trim() || !shippingPhone.trim() || !shippingAddress.trim() || !shippingCity.trim()) {
      setCheckoutError('Please complete all recipient and delivery address fields.');
      return;
    }

    const firstItem = bagItems[0];
    const orderStore = stores.find((s) => s.id === firstItem.storeId);
    if (!orderStore) {
      setCheckoutError('Storefront is no longer active for checkout.');
      return;
    }

    setSubmittingOrder(true);
    setCheckoutError(null);
    try {
      if (paymentMethod === 'card' && proxyStatus?.upstreamConfigured) {
        const proxyResult = await submitUpstreamProxyCheckout({
          storeId: orderStore.externalStoreId || orderStore.id,
          items: bagItems,
          shippingName,
          shippingPhone,
          shippingAddress,
          shippingCity,
          note: orderNote,
          paymentMethod,
          customerEmail: accountEmail || undefined,
          currency: bagCurrency,
        });
        if (!proxyResult.ok) {
          throw new Error(proxyResult.error || 'Upstream checkout proxy failed.');
        }
        if (proxyResult.checkoutUrl && typeof window !== 'undefined') {
          window.location.assign(proxyResult.checkoutUrl);
          return;
        }
      }

      if (isFirebaseBacked) {
        const orderId = await createMarketplaceOrderRecord({
          buyerUid: profile.uid,
          buyerName: profile.displayName || shippingName,
          buyerEmail: accountEmail || '',
          storeId: orderStore.id,
          storeName: orderStore.name,
          storeOwnerUid: orderStore.ownerUid,
          items: bagItems,
          shippingCents,
          currency: bagCurrency,
          paymentMethod,
          shippingName,
          shippingPhone,
          shippingAddress,
          shippingCity,
          note: orderNote,
        });

        setConfirmedOrder({
          id: orderId,
          totalCents: bagTotalCents,
          currency: bagCurrency,
          storeName: orderStore.name,
        });
        setBagItems([]);
      } else {
        const localOrder: MarketplaceOrder = {
          id: `ord_local_${Date.now().toString(36)}`,
          buyerUid: profile.uid,
          buyerName: profile.displayName || shippingName,
          buyerEmail: accountEmail || '',
          storeId: orderStore.id,
          storeName: orderStore.name,
          items: bagItems.map((i) => ({
            productId: i.productId,
            title: i.title,
            priceCents: i.priceCents,
            quantity: i.quantity,
            imageUrl: i.imageUrl,
          })),
          subtotalCents: bagSubtotalCents,
          shippingCents,
          totalCents: bagTotalCents,
          currency: bagCurrency,
          paymentMethod,
          paymentStatus: 'pending',
          status: 'PENDING',
          shippingName,
          shippingPhone,
          shippingAddress,
          shippingCity,
          note: orderNote,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        };
        setOrders((prev) => [localOrder, ...prev]);
        setConfirmedOrder({
          id: localOrder.id,
          totalCents: bagTotalCents,
          currency: bagCurrency,
          storeName: orderStore.name,
        });
        setBagItems([]);
      }
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Unable to place order right now.'
      );
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleShareListing = async (product: MarketplaceProduct) => {
    const shareText = `${product.title} · ${formatCurrencyCents(product.priceCents, product.currency)} on Looma Marketplace`;
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?tab=marketplace&store=${encodeURIComponent(product.storeSlug)}`
        : '';
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: product.title, text: shareText, url: shareUrl });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard && shareUrl) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setToastNotice('Listing link copied to clipboard.');
      }
    } catch {
      // ignore cancelled share sheet
    }
  };



  const handleMarkSoldOrDelete = async (product: MarketplaceProduct) => {
    try {
      if (isFirebaseBacked) {
        await deleteMarketplaceProductRecord(product.id);
      } else {
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
      }
      setToastNotice(`Removed "${product.title}" from Marketplace.`);
      if (selectedProductId === product.id) {
        setSelectedProductId(null);
        setSubView('home');
      }
    } catch (err) {
      setToastNotice(
        err instanceof Error ? err.message : 'Unable to remove listing.'
      );
    }
  };

  if (!marketplaceEnabled) {
    return (
      <div className="max-w-3xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
        <Store className="w-8 h-8 mx-auto text-slate-400 mb-3" aria-hidden="true" />
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
          Marketplace is currently paused
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Administrators have temporarily paused storefront browsing. Check back shortly.
        </p>
      </div>
    );
  }

  const hasActiveFilter =
    selectedCategory !== 'All' ||
    selectedStoreId !== 'all' ||
    Boolean(searchQuery.trim()) ||
    localOnly;

  return (
    <div className="max-w-6xl mx-auto pb-12 space-y-4">
      {/* Subtle floating action notice */}
      {toastNotice && (
        <div
          role="status"
          className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/60 px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-semibold text-blue-800 dark:text-blue-200"
        >
          <span>{toastNotice}</span>
          <button
            type="button"
            onClick={() => setBagOpen(true)}
            className="text-blue-600 dark:text-blue-300 underline cursor-pointer whitespace-nowrap"
          >
            Open Bag ({bagCount})
          </button>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 px-4 py-3 text-xs text-rose-700 dark:text-rose-300"
        >
          {loadError}
        </div>
      )}

      {/* =================================================================== */}
      {/* SUBVIEW: CHANGE CATEGORY (Screenshot 1)                             */}
      {/* =================================================================== */}
      {subView === 'categories' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <button
              type="button"
              onClick={navigateBack}
              aria-label="Back to Marketplace"
              className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" aria-hidden="true" />
            </button>
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Change Category
            </h1>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <div>
              <button
                type="button"
                onClick={() => {
                  setLocalOnly((prev) => !prev);
                  setSelectedCategory('All');
                  setSubView('home');
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <span className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                    <MapPin className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    Local listings {marketLocation ? `(${marketLocation})` : ''}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-semibold whitespace-nowrap shrink-0">
                  {localOnly ? 'Active' : 'New'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('All');
                  setSelectedStoreId('all');
                  setLocalOnly(false);
                  setSearchQuery('');
                  setSubView('home');
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <span className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                    <Store className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    All listings &amp; storefronts ({stores.length})
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
              </button>
            </div>

            {stores.length > 0 && (
              <div className="py-2">
                <h2 className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Verified Storefronts
                </h2>
                <div className="flex gap-2 px-4 py-1.5 overflow-x-auto no-scrollbar">
                  {stores.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setSelectedStoreId(st.id);
                        setSelectedCategory('All');
                        setSubView('home');
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <AvatarFallback src={st.logoUrl} name={st.name} sizeClass="w-5 h-5" textClass="text-[10px]" />
                      <span>{st.name}</span>
                      {st.verified && <VerifiedBadge size={14} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="py-2">
              <h2 className="px-4 py-2 text-base font-bold text-slate-900 dark:text-white">
                Top categories
              </h2>
              {TOP_MARKETPLACE_CATEGORIES.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.name);
                    setSelectedStoreId('all');
                    setSubView('home');
                  }}
                  className={`w-full px-4 py-3 flex items-center gap-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left ${
                    selectedCategory === cat.name ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <span className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-800 dark:text-slate-200 shrink-0">
                    <CategoryIcon iconKey={cat.iconKey} className="w-5 h-5" />
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>

            <div className="py-2">
              <h2 className="px-4 py-2 text-base font-bold text-slate-900 dark:text-white">
                All categories
              </h2>
              {ALL_MARKETPLACE_CATEGORIES.map((cat) => (
                <button
                  key={`all_${cat.name}`}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.name);
                    setSelectedStoreId('all');
                    setSubView('home');
                  }}
                  className={`w-full px-4 py-3 flex items-center gap-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left ${
                    selectedCategory === cat.name ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <span className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-800 dark:text-slate-200 shrink-0">
                    <CategoryIcon iconKey={cat.iconKey} className="w-5 h-5" />
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUBVIEW: SEARCH MARKETPLACE (Screenshot 2)                          */}
      {/* =================================================================== */}
      {subView === 'search' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[540px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = searchDraft.trim();
              if (clean) {
                setRecentSearches((prev) => upsertRecentSearch(prev, clean));
              }
              setSearchQuery(clean);
              setSubView('home');
            }}
            className="px-3 sm:px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2"
          >
            <button
              type="button"
              onClick={navigateBack}
              aria-label="Back to Marketplace"
              className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-6 h-6" aria-hidden="true" />
            </button>
            <div className="relative flex-1">
              <input
                type="search"
                autoFocus
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="What do you want to buy?"
                className="w-full min-h-[42px] pl-4 pr-9 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              {searchDraft && (
                <button
                  type="button"
                  onClick={() => setSearchDraft('')}
                  aria-label="Clear search text"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="submit"
              aria-label="Search Marketplace"
              className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <Search className="w-5 h-5" aria-hidden="true" />
            </button>
          </form>

          {!searchDraft.trim() ? (
            <div className="p-4 sm:p-6 space-y-8">
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Recent Searches
                  </h2>
                  {recentSearches.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRecentSearches([])}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {recentSearches.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
                    Your recent marketplace searches will appear here.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recentSearches.map((term) => (
                      <div
                        key={term}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSearchDraft(term);
                            setSearchQuery(term);
                            setRecentSearches((prev) => upsertRecentSearch(prev, term));
                            setSubView('home');
                          }}
                          className="flex-1 flex items-center gap-3 text-left text-sm text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                        >
                          <Clock className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                          <span className="truncate">{term}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRecentSearches((prev) => removeRecentSearch(prev, term))
                          }
                          aria-label={`Remove recent search ${term}`}
                          className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Saved Searches
                </h2>
                {savedSearches.length === 0 ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center max-w-xs mx-auto space-y-3">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <svg viewBox="0 0 64 64" className="w-16 h-16" aria-hidden="true">
                        <path
                          d="M16 10 H40 L48 18 V52 H16 Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="text-slate-700 dark:text-slate-300"
                        />
                        <circle
                          cx="37"
                          cy="37"
                          r="12"
                          className="fill-blue-400/35 stroke-blue-600"
                          strokeWidth="2.5"
                        />
                        <line
                          x1="46"
                          y1="46"
                          x2="56"
                          y2="56"
                          className="stroke-blue-600"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      You don&apos;t have any saved searches. Try searching for something new.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {savedSearches.map((term) => (
                      <div
                        key={term}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 pl-3 pr-1.5 py-1"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSearchDraft(term);
                            setSearchQuery(term);
                            setSubView('home');
                          }}
                          className="text-xs font-semibold text-blue-700 dark:text-blue-300 cursor-pointer"
                        >
                          {term}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSavedSearches((prev) => toggleStringListItem(prev, term))
                          }
                          aria-label={`Remove saved search ${term}`}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
                        >
                          <X className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                  {searchLiveResults.length} results for &ldquo;{searchDraft.trim()}&rdquo;
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const clean = searchDraft.trim();
                      setSavedSearches((prev) => toggleStringListItem(prev, clean));
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1.5"
                  >
                    <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                    {savedSearches.includes(searchDraft.trim())
                      ? 'Saved search'
                      : 'Save search'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const clean = searchDraft.trim();
                      if (clean) {
                        setRecentSearches((prev) => upsertRecentSearch(prev, clean));
                      }
                      setSearchQuery(clean);
                      setSubView('home');
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Apply to feed
                  </button>
                </div>
              </div>

              {searchLiveResults.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  No listings match &ldquo;{searchDraft.trim()}&rdquo;. Try another keyword.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {searchLiveResults.map((prod) => (
                    <ProductSquareTile
                      key={prod.id}
                      product={prod}
                      onSelect={(p) => {
                        setRecentSearches((prev) =>
                          upsertRecentSearch(prev, searchDraft.trim())
                        );
                        openListingDetail(p);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* SUBVIEW: MARKETPLACE INBOX (Selling | Buying)                       */}
      {/* =================================================================== */}
      {subView === 'inbox' && (
        <div
          data-testid="marketplace-inbox-view"
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[580px] flex flex-col"
        >
          {/* Header: Back Chevron + Centered Title */}
          <div className="px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={navigateBack}
              aria-label="Back to Marketplace"
              className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-6 h-6" aria-hidden="true" />
            </button>
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Inbox
            </h1>
            <div className="w-10 shrink-0" aria-hidden="true" />
          </div>

          {/* Primary Role Tabs: Selling | Buying */}
          <div
            role="tablist"
            aria-label="Marketplace inbox role"
            className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800"
          >
            {(['selling', 'buying'] as MarketplaceInboxRole[]).map((role) => {
              const isActive = inboxRole === role;
              const label = role === 'selling' ? 'Selling' : 'Buying';
              return (
                <button
                  key={role}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setInboxRole(role)}
                  className={`relative min-h-[46px] px-4 py-2.5 text-[15px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span>{label}</span>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-[2.5px] bg-blue-600 dark:bg-blue-400"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Interactive Status Filter Row */}
          <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {MARKETPLACE_INBOX_FILTERS.map((f) => {
              const isActive = inboxFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setInboxFilter(f.id)}
                  className={`min-h-[38px] px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Chats & Orders List OR Empty State */}
          {inboxEntries.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
              <svg
                viewBox="0 0 112 84"
                className="w-24 h-[72px] select-none"
                aria-hidden="true"
              >
                {/* Open blue envelope flap & side rails matching reference */}
                <path
                  d="M14 26 L56 4 L98 26 L98 76 C98 78.2 96.2 80 94 80 L18 80 C15.8 80 14 78.2 14 76 Z"
                  fill="#7BB5FF"
                />
                {/* Inner darker pocket */}
                <path
                  d="M18 28 L94 28 L94 58 L18 58 Z"
                  fill="#2C7DF7"
                />
                {/* Top vertical inbox letter accents */}
                <rect x="23" y="6" width="3.5" height="24" rx="1.5" fill="#111827" />
                <rect x="85.5" y="6" width="3.5" height="24" rx="1.5" fill="#111827" />
                {/* Left & right side folds */}
                <path d="M14 26 L56 54 L14 78 Z" fill="#6AA8FA" />
                <path d="M98 26 L56 54 L98 78 Z" fill="#5B9CF7" />
                {/* Bottom fold triangle */}
                <path
                  d="M14 78 L56 49 L98 78 C96.8 79.3 95.3 80 93.5 80 L18.5 80 C16.7 80 15.2 79.3 14 78 Z"
                  fill="#4C93FA"
                />
              </svg>
              <p className="mt-4 text-xl font-bold text-slate-600 dark:text-slate-300 tracking-tight">
                No chats
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {inboxEntries.map((entry) => {
                const order = entry.order;
                const canSellerMarkPaid =
                  entry.role === 'selling' &&
                  order &&
                  order.paymentStatus === 'pending' &&
                  order.status !== 'CANCELLED' &&
                  order.status !== 'DELIVERED';
                const canSellerMarkShipped =
                  entry.role === 'selling' &&
                  order &&
                  (order.status === 'PENDING' || order.status === 'CONFIRMED');
                const canSellerMarkDelivered =
                  entry.role === 'selling' && order && order.status === 'SHIPPED';

                return (
                  <div
                    key={entry.key}
                    className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        void handleOpenInboxChat(entry.partnerUid, entry.thread?.id)
                      }
                      className="flex items-start gap-3 text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <AvatarFallback
                        src={entry.partnerAvatar}
                        name={entry.partnerName}
                        sizeClass="w-12 h-12"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {entry.partnerName}
                            </span>
                            {entry.partnerVerified && <VerifiedBadge size={14} />}
                          </div>
                          {entry.updatedAtMs > 0 && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                              {new Date(entry.updatedAtMs).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {entry.listingTitle}
                          {order ? (
                            <>
                              <span className="mx-1 text-slate-400" aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {formatCurrencyCents(order.totalCents, order.currency)}
                              </span>
                            </>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {entry.subtitle}
                        </p>
                        {order && (
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 pt-0.5">
                            <span>
                              {order.paymentStatus === 'paid'
                                ? 'Paid'
                                : order.paymentStatus === 'refunded'
                                  ? 'Refunded'
                                  : 'Pending payment'}
                            </span>
                            <span className="mx-1" aria-hidden="true">·</span>
                            <span>
                              {order.status === 'PENDING' || order.status === 'CONFIRMED'
                                ? 'To be shipped'
                                : order.status === 'SHIPPED'
                                  ? 'Shipped'
                                  : order.status === 'DELIVERED'
                                    ? 'Delivered'
                                    : 'Cancelled'}
                            </span>
                          </p>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0 pl-15 sm:pl-0">
                      {canSellerMarkPaid && order && (
                        <button
                          type="button"
                          disabled={updatingInboxOrderId === order.id}
                          onClick={() =>
                            void handleSellerOrderUpdate(
                              order.id,
                              {
                                paymentStatus: 'paid',
                                status: order.status === 'PENDING' ? 'CONFIRMED' : order.status,
                              },
                              'Order marked as paid.'
                            )
                          }
                          className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          Mark paid
                        </button>
                      )}
                      {canSellerMarkShipped && order && (
                        <button
                          type="button"
                          disabled={updatingInboxOrderId === order.id}
                          onClick={() =>
                            void handleSellerOrderUpdate(
                              order.id,
                              { status: 'SHIPPED' },
                              'Order marked as shipped.'
                            )
                          }
                          className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          Mark shipped
                        </button>
                      )}
                      {canSellerMarkDelivered && order && (
                        <button
                          type="button"
                          disabled={updatingInboxOrderId === order.id}
                          onClick={() =>
                            void handleSellerOrderUpdate(
                              order.id,
                              { status: 'DELIVERED' },
                              'Order marked as delivered.'
                            )
                          }
                          className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          Mark delivered
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void handleOpenInboxChat(entry.partnerUid, entry.thread?.id)
                        }
                        className="min-h-[36px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Chat
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* SUBVIEW: LISTING DETAIL / PDP (Screenshots 3 & 5)                   */}
      {/* =================================================================== */}
      {subView === 'detail' && selectedProduct && selectedProductSeller && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Header Bar */}
          <div className="px-3 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
            <button
              type="button"
              onClick={navigateBack}
              aria-label="Back"
              className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-6 h-6" aria-hidden="true" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
              {selectedProduct.title}
            </h1>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => navigateTo('search')}
                aria-label="Search Marketplace"
                className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Search className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setBagOpen(true)}
                aria-label="Open Shopping Bag"
                className="relative min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ShoppingBag className="w-5 h-5" aria-hidden="true" />
                {bagCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {bagCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {(() => {
            const images = resolveListingImages(selectedProduct);
            const isSaved = savedListingIds.includes(selectedProduct.id);
            const hasAlert = alertListingIds.includes(selectedProduct.id);
            const isSelf = selectedProduct.ownerUid === profile.uid;
            const isSellerFollowed = followedUserIds.includes(selectedProduct.ownerUid);
            const listingLocation =
              selectedProduct.location ||
              selectedProductSeller.location ||
              marketLocation;

            return (
              <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                {/* Left Column: Multi-Image Gallery */}
                <div className="lg:col-span-7 space-y-4">
                  <GalleryGrid
                    images={images}
                    title={selectedProduct.title}
                    onOpenLightbox={(idx) => setLightboxIndex(idx)}
                  />
                </div>

                {/* Right Column: Title, Price, Quick Message, Actions, Seller */}
                <div className="lg:col-span-5 space-y-5">
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-snug">
                      {selectedProduct.title}
                    </h2>
                    <div className="mt-1 flex items-baseline gap-2.5 tabular-nums">
                      <span className="text-xl font-bold text-slate-900 dark:text-white">
                        {formatCurrencyCents(selectedProduct.priceCents, selectedProduct.currency)}
                      </span>
                      {typeof selectedProduct.compareAtPriceCents === 'number' &&
                        selectedProduct.compareAtPriceCents > selectedProduct.priceCents && (
                          <span className="text-sm text-slate-400 line-through">
                            {formatCurrencyCents(
                              selectedProduct.compareAtPriceCents,
                              selectedProduct.currency
                            )}
                          </span>
                        )}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                      {formatListingTimestamp(selectedProduct.createdAtMs)} in{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {listingLocation}
                      </span>
                    </p>
                  </div>

                  {/* Send Seller a Message Card */}
                  <QuickMessageCard
                    sellerName={selectedProductSeller.displayName}
                    isSelf={isSelf}
                    onSend={async (msg) => {
                      const priceFormatted = formatCurrencyCents(
                        selectedProduct.priceCents,
                        selectedProduct.currency
                      );
                      await onMessageSeller(selectedProduct.ownerUid, msg, {
                        id: selectedProduct.id,
                        title: selectedProduct.title,
                        priceFormatted,
                      });
                      recordMarketplaceThreadHint({
                        partnerUid: selectedProduct.ownerUid,
                        role: 'buying',
                        listingId: selectedProduct.id,
                        listingTitle: `${selectedProduct.title} · ${priceFormatted}`,
                        priceFormatted,
                        updatedAtMs: Date.now(),
                      });
                    }}
                    onOpenInbox={() => {
                      setInboxRole('buying');
                      navigateTo('inbox');
                    }}
                  />

                  {/* Quick Commerce Quantity + Add to Bag Bar */}
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                      <button
                        type="button"
                        onClick={() => setPdpQty((q) => Math.max(1, q - 1))}
                        aria-label="Decrease quantity"
                        className="min-h-[40px] w-9 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <span className="w-8 text-center text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                        {pdpQty}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPdpQty((q) => Math.min(Math.max(1, selectedProduct.stock), q + 1))
                        }
                        aria-label="Increase quantity"
                        className="min-h-[40px] w-9 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={selectedProduct.stock === 0}
                      onClick={() => handleAddToBag(selectedProduct, pdpQty)}
                      className="flex-1 min-h-[42px] px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      {selectedProduct.stock === 0 ? 'Out of Stock' : 'Add to Bag'}
                    </button>
                    <button
                      type="button"
                      disabled={selectedProduct.stock === 0}
                      onClick={() => {
                        handleAddToBag(selectedProduct, pdpQty);
                        setBagOpen(true);
                      }}
                      className="min-h-[42px] px-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Checkout
                    </button>
                  </div>

                  {/* 5 Circular Quick Actions Row (Screenshot 3 & 5) */}
                  <div className="relative grid grid-cols-5 gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAlertListingIds((prev) =>
                          toggleStringListItem(prev, selectedProduct.id)
                        );
                        setToastNotice(
                          hasAlert
                            ? 'Price drop alerts paused for this item.'
                            : 'Price & restock alerts enabled.'
                        );
                      }}
                      className="flex flex-col items-center gap-1.5 cursor-pointer group"
                    >
                      <span
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                          hasAlert
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                        }`}
                      >
                        <Bell className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Alert
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={async () => {
                        if (isSelf) return;
                        recordMarketplaceThreadHint({
                          partnerUid: selectedProduct.ownerUid,
                          role: 'buying',
                          listingId: selectedProduct.id,
                          listingTitle: `${selectedProduct.title} · ${formatCurrencyCents(
                            selectedProduct.priceCents,
                            selectedProduct.currency
                          )}`,
                          updatedAtMs: Date.now(),
                        });
                        await onMessageSeller(selectedProduct.ownerUid);
                      }}
                      className="flex flex-col items-center gap-1.5 cursor-pointer group disabled:opacity-40"
                    >
                      <span className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 flex items-center justify-center transition-colors">
                        <MessageCircle className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Message
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSavedListingIds((prev) =>
                          toggleStringListItem(prev, selectedProduct.id)
                        );
                        setToastNotice(
                          isSaved ? 'Removed from Saved listings.' : 'Saved to your Marketplace account.'
                        );
                      }}
                      className="flex flex-col items-center gap-1.5 cursor-pointer group"
                    >
                      <span
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                          isSaved
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                        }`}
                      >
                        <Bookmark className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {isSaved ? 'Saved' : 'Save'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleShareListing(selectedProduct)}
                      className="flex flex-col items-center gap-1.5 cursor-pointer group"
                    >
                      <span className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 flex items-center justify-center transition-colors">
                        <Share2 className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Share
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDetailMoreMenuOpen((prev) => !prev)}
                      className="flex flex-col items-center gap-1.5 cursor-pointer group"
                    >
                      <span className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 flex items-center justify-center transition-colors">
                        <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        More
                      </span>
                    </button>

                    {detailMoreMenuOpen && (
                      <div className="absolute right-0 top-16 z-30 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailMoreMenuOpen(false);
                            openSellerView(selectedProduct.ownerUid);
                          }}
                          className="w-full px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          View Seller Storefront
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDetailMoreMenuOpen(false);
                            setBagOpen(true);
                          }}
                          className="w-full px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          Open Shopping Bag ({bagCount})
                        </button>
                        {isSelf && (
                          <button
                            type="button"
                            onClick={() => {
                              setDetailMoreMenuOpen(false);
                              void handleMarkSoldOrDelete(selectedProduct);
                            }}
                            className="w-full px-3.5 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/50 font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                          >
                            Remove Listing
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Description Block */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Description
                    </h3>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {selectedProduct.description || listingLocation}
                    </p>
                    <div className="pt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Category: {selectedProduct.category}</span>
                      {selectedProduct.condition && (
                        <span>Condition: {selectedProduct.condition}</span>
                      )}
                      <span className="tabular-nums">
                        {selectedProduct.stock > 0
                          ? `${selectedProduct.stock} in stock`
                          : 'Sold out'}
                      </span>
                    </div>
                  </div>

                  {/* Seller Information Section (Screenshot 5) */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Seller information
                      </h3>
                      <button
                        type="button"
                        onClick={() => openSellerView(selectedProduct.ownerUid)}
                        className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Seller details
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openSellerView(selectedProduct.ownerUid)}
                        className="flex items-center gap-3 text-left min-w-0 cursor-pointer"
                      >
                        <AvatarFallback
                          src={selectedProductSeller.avatarUrl}
                          name={selectedProductSeller.displayName}
                          sizeClass="w-12 h-12"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {selectedProductSeller.displayName}
                            </span>
                            {selectedProductSeller.isVerified && <VerifiedBadge size={14} />}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            Joined Looma in {selectedProductSeller.joinedYear}
                          </p>
                        </div>
                      </button>

                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => void onToggleFollowSeller(selectedProduct.ownerUid)}
                          className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                            isSellerFollowed
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                          }`}
                        >
                          {isSellerFollowed ? (
                            <>
                              <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                              Following
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                              Follow
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <LocationRadiusMapCard
                      locationLabel={listingLocation}
                      radiusKm={radiusKm}
                    />
                  </div>

                  {/* Suggested Storefronts Section (Screenshot 5 bottom) */}
                  {suggestedStorefronts.length > 0 && (
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Suggested storefronts
                      </h3>
                      <div className="space-y-3">
                        {suggestedStorefronts.map(({ store, activeCount }) => (
                          <div
                            key={store.id}
                            className="flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <AvatarFallback
                                src={store.logoUrl || store.bannerUrl}
                                name={store.name}
                                sizeClass="w-11 h-11"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                    {store.name}
                                  </p>
                                  {store.verified && <VerifiedBadge size={14} />}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                  {activeCount} {activeCount === 1 ? 'listing' : 'listings'} ·{' '}
                                  {store.category}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedStoreId(store.id);
                                setSelectedCategory('All');
                                setViewHistory([]);
                                setSubView('home');
                              }}
                              className="min-h-[34px] px-4 py-1 rounded-md border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              Visit
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => navigateTo('categories')}
                        className="w-full pt-1 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>See all</span>
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {subView === 'detail' && (!selectedProduct || !selectedProductSeller) && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <ShoppingBag className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            This listing is no longer available
          </p>
          <button
            type="button"
            onClick={() => setSubView('home')}
            className="min-h-[38px] px-4 rounded-full bg-blue-600 text-white text-xs font-semibold cursor-pointer"
          >
            Back to Marketplace
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUBVIEW: MARKETPLACE SELLER PROFILE (Screenshot 4)                  */}
      {/* =================================================================== */}
      {subView === 'seller' && activeSellerProfile && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-w-3xl mx-auto">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={navigateBack}
              aria-label="Back"
              className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" aria-hidden="true" />
            </button>
            <h1 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Marketplace
            </h1>
            <button
              type="button"
              onClick={() => onOpenSellerProfile(activeSellerProfile.uid)}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
            >
              Full Profile
            </button>
          </div>

          {/* Cover & Overlapping Avatar */}
          <div className="relative">
            <div className="h-36 sm:h-44 w-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              {activeSellerProfile.bannerUrl ? (
                <img
                  src={activeSellerProfile.bannerUrl}
                  alt={activeSellerProfile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-200 via-slate-300 to-slate-200 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800" />
              )}
            </div>
            <div className="-mt-16 flex justify-center">
              <AvatarFallback
                src={activeSellerProfile.avatarUrl}
                name={activeSellerProfile.displayName}
                sizeClass="w-28 h-28"
                textClass="text-2xl"
                ringClass="ring-4 ring-white dark:ring-slate-900 shadow-md"
              />
            </div>
          </div>

          <div className="px-4 sm:px-6 pb-6 pt-3 space-y-6">
            {/* Name & Verified */}
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5">
                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  {activeSellerProfile.displayName}
                </h2>
                {activeSellerProfile.isVerified && <VerifiedBadge size={18} />}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                @{activeSellerProfile.handle}
              </p>
            </div>

            {/* 4 Circular Actions */}
            {(() => {
              const isSelf = activeSellerProfile.uid === profile.uid;
              const isFollowingSeller = followedUserIds.includes(activeSellerProfile.uid);
              return (
                <div className="grid grid-cols-4 gap-2 max-w-md mx-auto">
                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => void onToggleFollowSeller(activeSellerProfile.uid)}
                    className="flex flex-col items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <span
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                        isFollowingSeller
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {isFollowingSeller ? (
                        <UserCheck className="w-5 h-5" aria-hidden="true" />
                      ) : (
                        <UserPlus className="w-5 h-5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {isFollowingSeller ? 'Following' : 'Follow'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (activeSellerProfile.store) {
                        setSelectedStoreId(activeSellerProfile.store.id);
                        setSelectedCategory('All');
                        setViewHistory([]);
                        setSubView('home');
                      } else {
                        onOpenSellerProfile(activeSellerProfile.uid);
                      }
                    }}
                    className="flex flex-col items-center gap-1.5 cursor-pointer"
                  >
                    <span className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors">
                      <Store className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Storefront
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={async () => {
                      if (isSelf) return;
                      recordMarketplaceThreadHint({
                        partnerUid: activeSellerProfile.uid,
                        role: 'buying',
                        listingTitle: `${activeSellerProfile.displayName} Marketplace`,
                        updatedAtMs: Date.now(),
                      });
                      await onMessageSeller(activeSellerProfile.uid);
                    }}
                    className="flex flex-col items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <span className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors">
                      <MessageCircle className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Message
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenSellerProfile(activeSellerProfile.uid)}
                    className="flex flex-col items-center gap-1.5 cursor-pointer"
                  >
                    <span className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors">
                      <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Profile
                    </span>
                  </button>
                </div>
              );
            })()}

            {/* About Section */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                About
              </h3>
              <div className="space-y-2.5 text-sm text-slate-800 dark:text-slate-200">
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums">
                    {activeSellerProfile.followersCount} followers on Looma
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums">
                    Looma member since {activeSellerProfile.joinedYear}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Store className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums">
                    {sellerListings.length}{' '}
                    {sellerListings.length === 1 ? 'active listing' : 'active listings'}
                  </span>
                </div>
                {activeSellerProfile.location && (
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                    <span>{activeSellerProfile.location}</span>
                  </div>
                )}
              </div>
              {activeSellerProfile.bio && (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                  {activeSellerProfile.bio}
                </p>
              )}
            </div>

            {/* Seller's Listings */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {activeSellerProfile.displayName}&apos;s listings
              </h3>
              {sellerListings.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-3">
                  No active listings from this seller right now.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sellerListings.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3.5 p-2 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => openListingDetail(item)}
                        className="flex items-center gap-3.5 flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ShoppingBag className="w-6 h-6 text-slate-400" aria-hidden="true" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {formatCurrencyCents(item.priceCents, item.currency)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {item.category}
                          </p>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Send Seller a Message Card */}
            <QuickMessageCard
              sellerName={activeSellerProfile.displayName}
              isSelf={activeSellerProfile.uid === profile.uid}
              onSend={async (msg) => {
                await onMessageSeller(activeSellerProfile.uid, msg);
                recordMarketplaceThreadHint({
                  partnerUid: activeSellerProfile.uid,
                  role: 'buying',
                  listingTitle: `${activeSellerProfile.displayName} Marketplace`,
                  updatedAtMs: Date.now(),
                });
              }}
              onOpenInbox={() => {
                setInboxRole('buying');
                navigateTo('inbox');
              }}
            />
          </div>
        </div>
      )}



      {/* =================================================================== */}
      {/* SUBVIEW: MY MARKETPLACE ACCOUNT (Saved & Own Listings)              */}
      {/* =================================================================== */}
      {subView === 'account' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden space-y-6 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={navigateBack}
                aria-label="Back to Marketplace"
                className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="w-6 h-6" aria-hidden="true" />
              </button>
              <div>
                <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Marketplace Account
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your saved listings, posted items, and recent orders
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('orders')}
              className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Package className="w-4 h-4" aria-hidden="true" />
              Orders ({orders.length})
            </button>
          </div>

          {/* Saved Listings */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Saved listings ({savedProducts.length})
            </h2>
            {savedProducts.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Tap &ldquo;Save&rdquo; on any item to keep track of it here.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {savedProducts.map((prod) => (
                  <ProductSquareTile
                    key={prod.id}
                    product={prod}
                    onSelect={openListingDetail}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Your Listings */}
          <section className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Your listings ({myListings.length})
              </h2>
              <button
                type="button"
                onClick={handleOpenMerchantSell}
                className="min-h-[36px] px-3.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Merchant Portal
              </button>
            </div>
            {myListings.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You haven&apos;t listed any items on Marketplace yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {myListings.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800"
                  >
                    <button
                      type="button"
                      onClick={() => openListingDetail(item)}
                      className="flex items-center gap-3 min-w-0 text-left flex-1 cursor-pointer"
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                          {formatCurrencyCents(item.priceCents, item.currency)}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {item.stock} available
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMarkSoldOrDelete(item)}
                      aria-label={`Delete ${item.title}`}
                      className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUBVIEW: ORDERS HISTORY                                             */}
      {/* =================================================================== */}
      {subView === 'orders' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={navigateBack}
                aria-label="Back to Marketplace"
                className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              </button>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                My Marketplace Orders
              </h1>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
              {orders.length} {orders.length === 1 ? 'order' : 'orders'}
            </span>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
              <Package className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
              <p className="font-semibold text-sm text-slate-900 dark:text-white">
                No orders yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Items you purchase from Looma storefronts will appear here with tracking status.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {order.storeName} · #{order.id.slice(-8).toUpperCase()}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {new Date(order.createdAtMs).toLocaleDateString()} ·{' '}
                        {order.paymentMethod.toUpperCase()} ({order.paymentStatus})
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatCurrencyCents(order.totalCents, order.currency)}
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                        {order.status}
                      </span>
                      {order.status === 'PENDING' && isFirebaseBacked && (
                        <button
                          type="button"
                          onClick={() => void cancelMarketplaceOrderBuyer(order.id)}
                          className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {order.items.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-slate-800 dark:text-slate-200 font-medium truncate">
                          {item.quantity} × {item.title}
                        </span>
                        <span className="text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
                          {formatCurrencyCents(item.priceCents * item.quantity, order.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* =================================================================== */}
      {/* SUBVIEW: MARKETPLACE HOME (Screenshot 6)                            */}
      {/* =================================================================== */}
      {subView === 'home' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Top Header */}
          <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSelectedStoreId('all');
                    setSearchQuery('');
                    setSearchDraft('');
                    setLocalOnly(false);
                  }}
                  aria-label="Reset Marketplace filters"
                  className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ChevronLeft className="w-6 h-6" aria-hidden="true" />
                </button>
              )}
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Marketplace
              </h1>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => navigateTo('search')}
                aria-label="Search Marketplace"
                className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Search className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setBagOpen(true)}
                aria-label="Open Shopping Bag"
                className="relative min-h-[40px] px-3 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                <span className="tabular-nums hidden sm:inline">Bag</span>
                {bagCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
                    {bagCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Horizontal Action Buttons Bar: Profile | Inbox | Sell | Categories | Search */}
          <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                if (!isAuthorized) {
                  onRequireAuth?.();
                  return;
                }
                navigateTo('account');
              }}
              aria-label="Your Marketplace account"
              className="min-h-[38px] px-3.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white flex items-center justify-center gap-1.5 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <User className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Account</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isAuthorized) {
                  onRequireAuth?.();
                  return;
                }
                navigateTo('inbox');
              }}
              className="min-h-[38px] px-4 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Inbox className="w-4 h-4 sm:hidden" aria-hidden="true" />
              <span>Inbox</span>
            </button>

            <button
              type="button"
              onClick={handleOpenMerchantSell}
              className="min-h-[38px] px-4 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Tag className="w-4 h-4 sm:hidden" aria-hidden="true" />
              <span>Sell</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('categories')}
              className={`min-h-[38px] px-4 rounded-full flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory !== 'All'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4 sm:hidden" aria-hidden="true" />
              <span>Categories</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('search')}
              className={`min-h-[38px] px-4 rounded-full flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                searchQuery
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
              }`}
            >
              <span>Search</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isAuthorized) {
                  onRequireAuth?.();
                  return;
                }
                navigateTo('orders');
              }}
              className="min-h-[38px] px-4 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Orders</span>
            </button>
          </div>

          {/* Active filter indicator strip when filtered */}
          {hasActiveFilter && (
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/60 border-y border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap text-slate-700 dark:text-slate-300 font-medium">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                {selectedCategory !== 'All' && <span>Category: {selectedCategory}</span>}
                {activeStore && <span>Storefront: {activeStore.name}</span>}
                {localOnly && <span>Local only ({marketLocation})</span>}
                {searchQuery && <span>Search: &ldquo;{searchQuery}&rdquo;</span>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('All');
                  setSelectedStoreId('all');
                  setSearchQuery('');
                  setSearchDraft('');
                  setLocalOnly(false);
                }}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
              >
                Clear
              </button>
            </div>
          )}

          {/* Today's picks + Clickable Location · Radius header */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {selectedCategory !== 'All'
                ? selectedCategory
                : activeStore
                  ? activeStore.name
                  : "Today's picks"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setLocationInput(marketLocation);
                setRadiusInput(radiusKm);
                setLocationModalOpen(true);
              }}
              className="flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
            >
              <MapPin className="w-4 h-4" aria-hidden="true" />
              <span>
                {marketLocation} · {radiusKm} km
              </span>
            </button>
          </div>

          {/* Product Grid */}
          <div className="px-4 pb-6">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="space-y-2 animate-pulse">
                    <div className="aspect-square rounded-lg bg-slate-100 dark:bg-slate-800" />
                    <div className="h-3.5 w-3/4 rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-14 text-center space-y-3">
                <ShoppingBag className="w-9 h-9 mx-auto text-slate-400" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {hasActiveFilter
                      ? 'No listings match your current filters'
                      : 'No listings available yet'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {hasActiveFilter
                      ? 'Try clearing filters or browsing another category.'
                      : 'Be the first to sell an item or browse published storefronts.'}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  {hasActiveFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('All');
                        setSelectedStoreId('all');
                        setSearchQuery('');
                        setSearchDraft('');
                        setLocalOnly(false);
                      }}
                      className="min-h-[38px] px-4 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      Clear filters
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleOpenMerchantSell}
                    className="min-h-[38px] px-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Open Business Merchant Portal
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
                {filteredProducts.map((product) => (
                  <ProductSquareTile
                    key={product.id}
                    product={product}
                    onSelect={openListingDetail}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* LOCATION & RADIUS PICKER MODAL                                      */}
      {/* =================================================================== */}
      {locationModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Marketplace Location"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Location &amp; Search Radius
              </h3>
              <button
                type="button"
                onClick={() => setLocationModalOpen(false)}
                aria-label="Close location picker"
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                City or Neighborhood
              </label>
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                placeholder="Enter city (e.g. Kade, Accra, San Francisco)"
                className="w-full min-h-[42px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Radius
              </label>
              <div className="flex flex-wrap gap-2">
                {RADIUS_OPTIONS_KM.map((km) => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => setRadiusInput(km)}
                    className={`min-h-[36px] px-3.5 rounded-full text-xs font-semibold cursor-pointer tabular-nums ${
                      radiusInput === km
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {km} km
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLocationModalOpen(false)}
                className="min-h-[40px] px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setMarketLocation(locationInput.trim() || 'Local');
                  setRadiusKm(radiusInput);
                  setLocationModalOpen(false);
                }}
                className="min-h-[40px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* FULLSCREEN GALLERY LIGHTBOX MODAL                                   */}
      {/* =================================================================== */}
      {lightboxIndex !== null && selectedProduct && (() => {
        const imgs = resolveListingImages(selectedProduct);
        if (imgs.length === 0) return null;
        const safeIdx = Math.max(0, Math.min(lightboxIndex, imgs.length - 1));
        return (
          <div
            className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Listing Photos"
          >
            <div className="flex items-center justify-between text-white">
              <span className="text-sm font-semibold tabular-nums">
                {safeIdx + 1} / {imgs.length}
              </span>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                aria-label="Close photo viewer"
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center relative my-4">
              {imgs.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex((safeIdx - 1 + imgs.length) % imgs.length)
                  }
                  aria-label="Previous photo"
                  className="absolute left-2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
                >
                  <ChevronLeft className="w-6 h-6" aria-hidden="true" />
                </button>
              )}
              <img
                src={imgs[safeIdx]}
                alt={selectedProduct.title}
                referrerPolicy="no-referrer"
                className="max-h-[80vh] max-w-full object-contain rounded-lg"
              />
              {imgs.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex((safeIdx + 1) % imgs.length)}
                  aria-label="Next photo"
                  className="absolute right-2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
                >
                  <ChevronRight className="w-6 h-6" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* =================================================================== */}
      {/* SHOPPING BAG & CHECKOUT SLIDE-OVER DRAWER                           */}
      {/* =================================================================== */}
      {bagOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Shopping Bag and Checkout"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full flex flex-col border-l border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Shopping Bag ({bagCount})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {bagItems[0]?.storeName || 'Direct storefront checkout'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBagOpen(false)}
                aria-label="Close shopping bag"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {confirmedOrder ? (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                    <h3 className="font-display text-sm font-bold">
                      Order #{confirmedOrder.id.slice(-8).toUpperCase()} Confirmed
                    </h3>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    Your order with <span className="font-semibold">{confirmedOrder.storeName}</span> for{' '}
                    <span className="font-semibold tabular-nums">
                      {formatCurrencyCents(confirmedOrder.totalCents, confirmedOrder.currency)}
                    </span>{' '}
                    has been recorded and sent to the storefront fulfillment queue.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBagOpen(false);
                        setConfirmedOrder(null);
                        navigateTo('orders');
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      View My Orders
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmedOrder(null);
                        setBagOpen(false);
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      Continue Shopping
                    </button>
                  </div>
                </div>
              ) : bagItems.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <ShoppingBag className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Your bag is empty
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Add products from any published storefront to start checkout.
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bagItems.map((item) => (
                      <div key={item.productId} className="py-3 flex items-center gap-3">
                        <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatCurrencyCents(item.priceCents, item.currency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateBagQuantity(item.productId, -1)}
                            aria-label={`Decrease ${item.title} quantity`}
                            className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <span className="w-6 text-center text-xs font-semibold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateBagQuantity(item.productId, 1)}
                            aria-label={`Increase ${item.title} quantity`}
                            className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setBagItems((prev) =>
                                prev.filter((i) => i.productId !== item.productId)
                              )
                            }
                            aria-label={`Remove ${item.title}`}
                            className="w-7 h-7 rounded-md text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-1.5 text-xs tabular-nums">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Subtotal</span>
                      <span>{formatCurrencyCents(bagSubtotalCents, bagCurrency)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Shipping</span>
                      <span>
                        {shippingCents === 0
                          ? 'Free'
                          : formatCurrencyCents(shippingCents, bagCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
                      <span>Total</span>
                      <span>{formatCurrencyCents(bagTotalCents, bagCurrency)}</span>
                    </div>
                  </div>

                  <form id="marketplace-checkout-form" onSubmit={handlePlaceOrder} className="space-y-3">
                    <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Delivery &amp; Payment
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        required
                        value={shippingName}
                        onChange={(e) => setShippingName(e.target.value)}
                        placeholder="Recipient full name"
                        className="min-h-[40px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                      <input
                        type="tel"
                        required
                        value={shippingPhone}
                        onChange={(e) => setShippingPhone(e.target.value)}
                        placeholder="Phone number"
                        className="min-h-[40px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                    </div>
                    <input
                      type="text"
                      required
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Street address & apartment"
                      className="w-full min-h-[40px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        required
                        value={shippingCity}
                        onChange={(e) => setShippingCity(e.target.value)}
                        placeholder="City & postal code"
                        className="min-h-[40px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        aria-label="Payment method"
                        className="min-h-[40px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        {proxyStatus?.upstreamConfigured && (
                          <option value="card">Card / Online Proxy Checkout</option>
                        )}
                        <option value="cod">Cash on Delivery (COD)</option>
                        <option value="wallet">Direct Invoice / Wallet</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      placeholder="Delivery instructions or sizing notes (optional)"
                      className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs resize-none"
                    />

                    {checkoutError && (
                      <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                        {checkoutError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submittingOrder}
                      className="w-full min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {submittingOrder
                        ? 'Processing Order...'
                        : `Place Order · ${formatCurrencyCents(bagTotalCents, bagCurrency)}`}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* BUSINESS PROFILE MERCHANT PORTAL LAUNCHER MODAL                     */}
      {/* =================================================================== */}
      {sellBusinessPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Select Business Profile for Selling"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Sell with a Business Profile
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Merchant tools, inventory, and payouts belong to verified Business Profiles—not personal accounts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSellBusinessPickerOpen(false)}
                aria-label="Close modal"
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {sellLauncherError && (
              <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {sellLauncherError}
              </p>
            )}

            {businesses.length === 0 ? (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 text-center space-y-3">
                <Building2 className="w-8 h-8 mx-auto text-blue-600" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    No Business Profile yet
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Create a Looma Business Profile to unlock your Commerce storefront, product catalog, and order fulfillment portal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSellBusinessPickerOpen(false);
                    onCreateBusinessProfile?.();
                  }}
                  className="w-full min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Create Business Profile
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto">
                {businesses.map((bp) => {
                  const busy = launchingBpId === bp.id;
                  return (
                    <div
                      key={bp.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                          {bp.logoUrl ? (
                            <img
                              src={bp.logoUrl}
                              alt={bp.displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Store className="w-5 h-5 text-slate-500" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {bp.displayName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            @{bp.slug} · {bp.category}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onOpenBusinessProfile && (
                          <button
                            type="button"
                            onClick={() => {
                              setSellBusinessPickerOpen(false);
                              onOpenBusinessProfile(bp.slug);
                            }}
                            className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            Page
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={Boolean(launchingBpId)}
                          onClick={() => void handleSelectBusinessForSelling(bp)}
                          className="min-h-[36px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                        >
                          {busy ? 'Opening...' : 'Merchant Portal'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {onCreateBusinessProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      setSellBusinessPickerOpen(false);
                      onCreateBusinessProfile();
                    }}
                    className="w-full min-h-[38px] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Create another Business Profile
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
