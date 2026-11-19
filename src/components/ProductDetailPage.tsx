import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  X,
} from 'lucide-react';
import type {
  CartItem,
  CommerceProxyStatus,
  PaymentMethod,
  ProductVariant,
} from '../types/marketplace';
import type { UserProfile } from '../types/social';
import {
  createMarketplaceOrderRecord,
  fetchCommerceProxyStatus,
  fetchPublicProductDetail,
  submitUpstreamProxyCheckout,
  type PublicProductDetailResult,
} from '../services/commerce';
import { formatCurrencyCents } from '../services/marketplaceCatalogAssets';
import { resolveListingImages } from '../utils/marketplaceLogic';
import { VerifiedBadge } from './VerifiedBadge';

interface ProductDetailPageProps {
  productId: string;
  currentProfile: UserProfile;
  accountEmail?: string | null;
  isAuthorized: boolean;
  isFirebaseBacked?: boolean;
  onBack: () => void;
  onRequireAuth: () => void;
  onOpenBusinessProfile: (slug: string) => void;
  onMessageSeller: (
    sellerUid: string,
    initialMessage?: string,
    listingContext?: { id: string; title: string; priceFormatted: string }
  ) => Promise<void> | void;
}

export function ProductDetailPage({
  productId,
  currentProfile,
  accountEmail = null,
  isAuthorized,
  isFirebaseBacked = true,
  onBack,
  onRequireAuth,
  onOpenBusinessProfile,
  onMessageSeller,
}: ProductDetailPageProps) {
  const [detail, setDetail] = useState<PublicProductDetailResult | null>(null);
  const [proxyStatus, setProxyStatus] = useState<CommerceProxyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [shareCopied, setShareCopied] = useState(false);

  // Checkout drawer state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [shippingName, setShippingName] = useState(currentProfile.displayName || '');
  const [shippingPhone, setShippingPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingCity, setShippingCity] = useState(currentProfile.location || '');
  const [orderNote, setOrderNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<{
    id: string;
    totalCents: number;
    currency: string;
    storeName: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDetail(null);
    setActiveImageIndex(0);
    setSelectedVariantId('');
    setQuantity(1);
    setCheckoutOpen(false);
    setConfirmedOrder(null);
    setCheckoutError(null);

    void Promise.all([
      fetchPublicProductDetail(productId),
      fetchCommerceProxyStatus(),
    ]).then(([loadedDetail, status]) => {
      if (!active) return;
      setDetail(loadedDetail);
      setProxyStatus(status);
      if (status.upstreamConfigured) {
        setPaymentMethod('card');
      }
      if (loadedDetail && loadedDetail.variants.length > 0) {
        const firstAvailable =
          loadedDetail.variants.find((v) => v.stock > 0) || loadedDetail.variants[0];
        setSelectedVariantId(firstAvailable.id);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [productId]);

  const selectedVariant: ProductVariant | null = useMemo(() => {
    if (!detail || detail.variants.length === 0) return null;
    return detail.variants.find((v) => v.id === selectedVariantId) || detail.variants[0];
  }, [detail, selectedVariantId]);

  const effectivePriceCents = useMemo(() => {
    if (!detail) return 0;
    if (selectedVariant && typeof selectedVariant.priceCents === 'number') {
      return selectedVariant.priceCents;
    }
    return detail.product.priceCents;
  }, [detail, selectedVariant]);

  const availableStock = useMemo(() => {
    if (!detail) return 0;
    if (selectedVariant) return Math.max(0, selectedVariant.stock);
    return Math.max(0, detail.product.stock);
  }, [detail, selectedVariant]);

  useEffect(() => {
    if (availableStock > 0 && quantity > availableStock) {
      setQuantity(availableStock);
    }
  }, [availableStock, quantity]);

  const gallery = useMemo(() => {
    if (!detail) return [];
    return resolveListingImages(detail.product);
  }, [detail]);

  const handleShare = async () => {
    if (!detail || typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/marketplace/product/${encodeURIComponent(detail.product.id)}`;
    const shareText = `${detail.product.title} · ${formatCurrencyCents(effectivePriceCents, detail.product.currency)} on Looma Marketplace`;
    try {
      if (navigator.share) {
        await navigator.share({ title: detail.product.title, text: shareText, url: shareUrl });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 2500);
      }
    } catch {
      // Ignore cancelled share
    }
  };

  const handleOpenCheckout = () => {
    if (!isAuthorized) {
      onRequireAuth();
      return;
    }
    setCheckoutError(null);
    setConfirmedOrder(null);
    setCheckoutOpen(true);
  };

  const handleMessageBusiness = () => {
    if (!detail) return;
    if (!isAuthorized) {
      onRequireAuth();
      return;
    }
    const targetUid =
      detail.businessProfile?.ownerUid || detail.store.ownerUid || detail.product.ownerUid;
    if (!targetUid) return;
    const priceFormatted = formatCurrencyCents(effectivePriceCents, detail.product.currency);
    void onMessageSeller(
      targetUid,
      `Hi, is "${detail.product.title}" still available?`,
      {
        id: detail.product.id,
        title: detail.product.title,
        priceFormatted,
      }
    );
  };

  const handleSubmitOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (!isAuthorized) {
      onRequireAuth();
      return;
    }
    if (availableStock < quantity || availableStock <= 0) {
      setCheckoutError('This item does not have enough stock available.');
      return;
    }
    if (
      !shippingName.trim() ||
      !shippingPhone.trim() ||
      !shippingAddress.trim() ||
      !shippingCity.trim()
    ) {
      setCheckoutError('Please fill in all recipient and delivery fields.');
      return;
    }

    const subtotalCents = effectivePriceCents * quantity;
    const shippingCents = subtotalCents < 25000 ? 1500 : 0;
    const totalCents = subtotalCents + shippingCents;
    const variantLabel = selectedVariant
      ? [selectedVariant.size, selectedVariant.color].filter(Boolean).join(' / ')
      : undefined;

    const item: CartItem = {
      productId: detail.product.id,
      variantId: selectedVariant?.id,
      variantLabel,
      storeId: detail.store.id,
      storeName: detail.businessProfile?.displayName || detail.store.name,
      title: variantLabel ? `${detail.product.title} (${variantLabel})` : detail.product.title,
      priceCents: effectivePriceCents,
      currency: detail.product.currency,
      imageUrl: gallery[0] || detail.product.imageUrl,
      quantity,
      maxStock: availableStock,
    };

    setSubmitting(true);
    setCheckoutError(null);
    try {
      if (paymentMethod === 'card' && proxyStatus?.upstreamConfigured) {
        const res = await submitUpstreamProxyCheckout({
          storeId: detail.store.externalStoreId || detail.store.id,
          items: [item],
          shippingName,
          shippingPhone,
          shippingAddress,
          shippingCity,
          note: orderNote,
          paymentMethod,
          customerEmail: accountEmail || undefined,
          currency: detail.product.currency,
        });
        if (!res.ok) {
          throw new Error(res.error || 'Unable to initialize online payment checkout.');
        }
        if (res.checkoutUrl && typeof window !== 'undefined') {
          window.location.assign(res.checkoutUrl);
          return;
        }
      }

      if (!isFirebaseBacked) {
        setConfirmedOrder({
          id: `ord_local_${Date.now().toString(36)}`,
          totalCents,
          currency: detail.product.currency,
          storeName: item.storeName,
        });
        return;
      }

      const orderId = await createMarketplaceOrderRecord({
        buyerUid: currentProfile.uid,
        buyerName: currentProfile.displayName || shippingName,
        buyerEmail: accountEmail || '',
        storeId: detail.store.id,
        storeName: item.storeName,
        storeOwnerUid:
          detail.businessProfile?.ownerUid || detail.store.ownerUid || detail.product.ownerUid,
        items: [item],
        shippingCents,
        currency: detail.product.currency,
        paymentMethod,
        shippingName,
        shippingPhone,
        shippingAddress,
        shippingCity,
        note: orderNote,
      });

      setConfirmedOrder({
        id: orderId,
        totalCents,
        currency: detail.product.currency,
        storeName: item.storeName,
      });
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to complete order right now.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6 animate-pulse">
        <div className="h-5 w-40 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="aspect-square rounded-2xl bg-slate-100 dark:bg-slate-800" />
          <div className="space-y-4">
            <div className="h-7 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-6 w-32 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-24 w-full rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-3xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
        <Package className="w-10 h-10 mx-auto text-slate-400" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Product unavailable
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This listing may have been unpublished, sold out, or removed by the business.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Marketplace
        </button>
      </div>
    );
  }

  const { product, variants, store, businessProfile } = detail;
  const businessDisplayName = businessProfile?.displayName || store.name || product.storeName;
  const businessSlug = businessProfile?.slug || store.slug || product.storeSlug;
  const businessLogo = businessProfile?.logoUrl || store.logoUrl || '';
  const isVerifiedSeller = Boolean(businessProfile?.verified || store.verified);
  const sellerOwnerUid =
    businessProfile?.ownerUid || store.ownerUid || product.ownerUid;
  const isOwnListing = Boolean(isAuthorized && sellerOwnerUid && sellerOwnerUid === currentProfile.uid);

  const subtotalCents = effectivePriceCents * quantity;
  const shippingCents = subtotalCents < 25000 ? 1500 : 0;
  const totalCents = subtotalCents + shippingCents;

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      {/* Top Breadcrumb Bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Marketplace
        </button>

        <button
          type="button"
          onClick={() => void handleShare()}
          className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Share2 className="w-4 h-4" aria-hidden="true" />
          {shareCopied ? 'Link copied' : 'Share'}
        </button>
      </div>

      {/* Main Product Panel */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Gallery */}
          <div className="bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 flex flex-col gap-3">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-800">
              {gallery[activeImageIndex] ? (
                <img
                  src={gallery[activeImageIndex]}
                  alt={product.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <ShoppingBag className="w-12 h-12" aria-hidden="true" />
                </div>
              )}
              {availableStock <= 0 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="px-4 py-1.5 rounded-full bg-white text-slate-900 text-xs font-bold uppercase tracking-wide">
                    Out of stock
                  </span>
                </div>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {gallery.map((imgUrl, idx) => (
                  <button
                    key={`${imgUrl}_${idx}`}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    aria-label={`View image ${idx + 1}`}
                    className={`aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      activeImageIndex === idx
                        ? 'border-blue-600 ring-2 ring-blue-500/20'
                        : 'border-transparent opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={imgUrl}
                      alt={`${product.title} view ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info & Actions */}
          <div className="p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              {/* Business Profile Header Link */}
              <button
                type="button"
                onClick={() => onOpenBusinessProfile(businessSlug)}
                className="inline-flex items-center gap-2.5 text-left group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                  {businessLogo ? (
                    <img
                      src={businessLogo}
                      alt={businessDisplayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Store className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 inline-flex items-center gap-1">
                    <span className="truncate">{businessDisplayName}</span>
                    {isVerifiedSeller && <VerifiedBadge size={13} />}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    @{businessSlug} · View Business Profile
                  </p>
                </div>
              </button>

              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                    {product.category}
                  </span>
                  {product.condition && (
                    <>
                      <span>·</span>
                      <span>{product.condition}</span>
                    </>
                  )}
                  {product.location && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                        {product.location}
                      </span>
                    </>
                  )}
                </div>

                <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                  {product.title}
                </h1>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatCurrencyCents(effectivePriceCents, product.currency)}
                </span>
                {typeof product.compareAtPriceCents === 'number' &&
                  product.compareAtPriceCents > effectivePriceCents && (
                    <span className="text-sm text-slate-400 line-through tabular-nums">
                      {formatCurrencyCents(product.compareAtPriceCents, product.currency)}
                    </span>
                  )}
                <span
                  className={`ml-auto text-xs font-semibold tabular-nums ${
                    availableStock > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {availableStock > 0 ? `${availableStock} in stock` : 'Sold out'}
                </span>
              </div>

              {/* Variants Selector */}
              {variants.length > 0 && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Select Option
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((variant) => {
                      const label =
                        [variant.size, variant.color].filter(Boolean).join(' · ') ||
                        variant.sku ||
                        'Standard';
                      const active = selectedVariant?.id === variant.id;
                      const soldOut = variant.stock <= 0;
                      return (
                        <button
                          key={variant.id}
                          type="button"
                          disabled={soldOut}
                          onClick={() => setSelectedVariantId(variant.id)}
                          className={`min-h-[38px] px-3.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                            active
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {label}
                          {soldOut ? ' (Out)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantity Stepper */}
              {availableStock > 0 && (
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Quantity
                  </span>
                  <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                      className="w-9 h-9 flex items-center justify-center text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <span className="w-9 text-center text-sm font-bold tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                      disabled={quantity >= availableStock}
                      aria-label="Increase quantity"
                      className="w-9 h-9 flex items-center justify-center text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Product Description
                </h2>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                  {product.description || 'Verified listing from an active Looma Business storefront.'}
                </p>
              </div>
            </div>

            {/* CTAs */}
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={availableStock <= 0}
                  onClick={handleOpenCheckout}
                  className="min-h-[46px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                  {isAuthorized ? 'Buy Now' : 'Sign in to Buy'}
                </button>
                {!isOwnListing && (
                  <button
                    type="button"
                    onClick={handleMessageBusiness}
                    className="min-h-[46px] px-5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" aria-hidden="true" />
                    Message Business
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                Orders are fulfilled by{' '}
                <button
                  type="button"
                  onClick={() => onOpenBusinessProfile(businessSlug)}
                  className="font-semibold text-slate-800 dark:text-slate-200 hover:underline cursor-pointer"
                >
                  {businessDisplayName}
                </button>
                . Inventory is verified prior to checkout.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Drawer Modal */}
      {checkoutOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Checkout"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Checkout · {businessDisplayName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {quantity} × {product.title}
                  {selectedVariant
                    ? ` (${[selectedVariant.size, selectedVariant.color].filter(Boolean).join(' / ')})`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                aria-label="Close checkout"
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {confirmedOrder ? (
                <div className="py-6 text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" aria-hidden="true" />
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Order Confirmed!
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Reference #{confirmedOrder.id.slice(-8).toUpperCase()} ·{' '}
                    {formatCurrencyCents(confirmedOrder.totalCents, confirmedOrder.currency)} with{' '}
                    {confirmedOrder.storeName}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(false)}
                    className="min-h-[40px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1 text-xs tabular-nums">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Subtotal ({quantity})</span>
                      <span>{formatCurrencyCents(subtotalCents, product.currency)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Shipping</span>
                      <span>
                        {shippingCents === 0
                          ? 'Free'
                          : formatCurrencyCents(shippingCents, product.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
                      <span>Total</span>
                      <span>{formatCurrencyCents(totalCents, product.currency)}</span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmitOrder} className="space-y-3">
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
                          <option value="card">Card / Online Checkout</option>
                        )}
                        <option value="cod">Cash on Delivery (COD)</option>
                        <option value="wallet">Direct Invoice / Wallet</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      placeholder="Delivery notes (optional)"
                      className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs resize-none"
                    />
                    {checkoutError && (
                      <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                        {checkoutError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      {submitting
                        ? 'Processing Order...'
                        : `Complete Order · ${formatCurrencyCents(totalCents, product.currency)}`}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
