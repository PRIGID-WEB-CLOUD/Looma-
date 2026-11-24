export type StorePublishStatus = 'DRAFT' | 'PUBLISHED' | 'SUSPENDED';
export type ProductStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
export type ProductCondition = 'New' | 'Used - Like New' | 'Used - Good' | 'Used - Fair';
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';
export type PaymentMethod = 'card' | 'cod' | 'wallet';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';
export type PaymentProviderId = 'stripe' | 'paystack' | 'flutterwave';

export interface CheckoutPaymentProviderOption {
  provider: PaymentProviderId;
  name: string;
  publishableKey: string | null;
  livemode: boolean;
}

export interface CheckoutPaymentConfig {
  activeProvider: PaymentProviderId;
  publishableKey: string | null;
  livemode: boolean;
  activeProviders: CheckoutPaymentProviderOption[];
  currency: string;
}

export interface ProductVariant {
  id: string;
  size: string;
  color: string;
  stock: number;
  price: number | null;
  priceCents: number | null;
  sku: string;
}

export interface MarketplaceStore {
  id: string;
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
  businessProfileId?: string;
  country?: string;
  countryCode?: string;
  location?: string;
  verified: boolean;
  featured: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface MarketplaceProduct {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  ownerUid: string;
  businessProfileId?: string;
  title: string;
  description: string;
  category: string;
  priceCents: number;
  compareAtPriceCents?: number;
  currency: string;
  imageUrl: string;
  galleryUrls?: string[];
  location?: string;
  country?: string;
  countryCode?: string;
  condition?: ProductCondition;
  stock: number;
  trackQuantity?: boolean;
  status: ProductStatus;
  featured: boolean;
  tag?: string;
  variants?: ProductVariant[];
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CartItem {
  productId: string;
  variantId?: string;
  variantLabel?: string;
  storeId: string;
  storeName: string;
  title: string;
  priceCents: number;
  currency: string;
  imageUrl: string;
  quantity: number;
  maxStock: number;
}

export interface OrderLineItem {
  productId: string;
  title: string;
  priceCents: number;
  quantity: number;
  imageUrl: string;
}

export type MarketplaceInboxRole = 'selling' | 'buying';
export type MarketplaceInboxFilter =
  | 'all'
  | 'pending_payment'
  | 'paid'
  | 'to_be_shipped';

export interface MarketplaceOrder {
  id: string;
  buyerUid: string;
  buyerName: string;
  buyerEmail: string;
  storeId: string;
  storeName: string;
  storeOwnerUid?: string;
  storeBusinessProfileId?: string;
  items: OrderLineItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentProvider?: PaymentProviderId | string;
  paymentReference?: string;
  status: OrderStatus;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingCountry?: string;
  shippingCountryCode?: string;
  shippingState?: string;
  shippingPostalCode?: string;
  note: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CommerceProxyStatus {
  configured: boolean;
  upstreamConfigured: boolean;
  defaultStoreId: string | null;
  hasPublishableKey: boolean;
  adminDashboardUrl: string | null;
}

export interface UpstreamAdminStats {
  role?: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  pendingOrders: number;
  productCount: number;
  lowStockProducts?: Array<{ id: string; name: string; stock: number }>;
  recentOrders?: Array<Record<string, unknown>>;
}
