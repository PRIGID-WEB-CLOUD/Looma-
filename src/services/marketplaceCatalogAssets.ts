import heroShowcaseImg from '../assets/images/marketplace_hero_showcase_1795020275024.jpg';
import watchChronographImg from '../assets/images/product_chronograph_watch_1795020276302.jpg';
import leatherToteImg from '../assets/images/product_leather_tote_1795020275757.jpg';
import ceramicCarafeImg from '../assets/images/product_ceramic_carafe_1795020284259.jpg';

export const MARKETPLACE_STUDIO_ASSETS = {
  heroShowcase: heroShowcaseImg,
  watchChronograph: watchChronographImg,
  leatherTote: leatherToteImg,
  ceramicCarafe: ceramicCarafeImg,
} as const;

export const MARKETPLACE_CATEGORIES = [
  'All',
  'Vehicles',
  'Rentals',
  "Women's clothing & shoes",
  "Men's clothing & shoes",
  'Furniture',
  'Electronics & computers',
  'Timepieces',
  'Leather Goods',
  'Home & Ceramics',
  'Apparel',
  'Antiques & Collectibles',
  'Appliances',
  'Arts & Crafts',
  'Auto parts',
  'Baby & kids',
  'Books, Movies & Music',
  'Digital & Studio',
  'Health & Beauty',
  'Home & Garden',
  'Jewelry & Accessories',
  'Musical Instruments',
  'Pet Supplies',
  'Sports & Outdoors',
  'Toys & Games',
] as const;

export function formatCurrencyCents(
  cents: number,
  currency: string = 'USD'
): string {
  const safeCents = Number.isFinite(cents) ? cents : 0;
  const code = (currency || 'USD').trim().toUpperCase() || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: safeCents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(safeCents / 100);
  } catch {
    return `$${(safeCents / 100).toFixed(2)}`;
  }
}

export function slugifyStoreHandle(raw: string): string {
  const cleaned = (raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned.length >= 2 ? cleaned : `atelier-${Date.now().toString(36)}`;
}

export function makeCommerceId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
