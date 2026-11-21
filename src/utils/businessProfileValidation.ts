export const BUSINESS_CATEGORIES = [
  'Fashion & Apparel',
  'Home & Living',
  'Beauty & Wellness',
  'Electronics & Tech',
  'Art & Design',
  'Food & Pantry',
  'Studio & Services',
  'General Merchandise',
] as const;

export const BUSINESS_CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'CAD'] as const;

export function normalizeBusinessSlug(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Generates an automatic compact lowercase @handle from a Business Name.
 * Example: "Prigid Web Cloud" -> "prigidwebcloud"
 */
export function generateBusinessHandleFromName(displayName: string): string {
  const normalized = (displayName || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 64);
  return normalized;
}

/**
 * Produces clean, deterministic alternative handle suggestions when a desired
 * business @handle is already claimed.
 */
export function suggestAlternativeBusinessHandles(
  baseHandle: string,
  takenHandles?: Set<string> | string[]
): string[] {
  const cleanBase = normalizeBusinessSlug(baseHandle).replace(/-/g, '') ||
    normalizeBusinessSlug(baseHandle);
  if (!cleanBase || cleanBase.length < 2) return [];

  const taken = new Set<string>(
    takenHandles
      ? Array.from(takenHandles).map((h) => h.toLowerCase())
      : []
  );
  taken.add(cleanBase.toLowerCase());

  const suffixes = ['hq', 'studio', 'official', 'co', 'shop', '1', '2', '24'];
  const candidates: string[] = [];
  for (const suffix of suffixes) {
    const candidate = `${cleanBase.slice(0, 64 - suffix.length)}${suffix}`;
    if (
      candidate.length >= 2 &&
      candidate.length <= 64 &&
      !taken.has(candidate) &&
      !candidates.includes(candidate)
    ) {
      candidates.push(candidate);
    }
    if (candidates.length >= 4) break;
  }
  return candidates;
}

export function validateBusinessProfileInput(input: {
  displayName: string;
  slug: string;
  category: string;
  bio?: string;
  websiteUrl?: string;
  location?: string;
  currency?: string;
}): {
  valid: boolean;
  error?: string;
  clean: {
    displayName: string;
    slug: string;
    category: string;
    bio: string;
    websiteUrl?: string;
    location?: string;
    currency: string;
  };
} {
  const displayName = (input.displayName || '').trim().slice(0, 80);
  const slug = normalizeBusinessSlug(input.slug || generateBusinessHandleFromName(displayName));
  const category = (input.category || 'General Merchandise').trim().slice(0, 40);
  const bio = (input.bio || '').trim().slice(0, 280);
  const location = (input.location || '').trim().slice(0, 80);
  const websiteRaw = (input.websiteUrl || '').trim().slice(0, 500);
  const currency = ((input.currency || 'USD').trim().toUpperCase() || 'USD').slice(0, 8);

  if (displayName.length < 2) {
    return {
      valid: false,
      error: 'Business display name must be at least 2 characters.',
      clean: { displayName, slug, category, bio, currency },
    };
  }
  if (slug.length < 2 || !/^[a-z0-9-]+$/.test(slug)) {
    return {
      valid: false,
      error: 'Business handle must be 2–64 lowercase letters, numbers, or hyphens.',
      clean: { displayName, slug, category, bio, currency },
    };
  }
  if (!category) {
    return {
      valid: false,
      error: 'Choose a category for this Business Profile.',
      clean: { displayName, slug, category, bio, currency },
    };
  }
  if (websiteRaw && !/^https?:\/\//i.test(websiteRaw)) {
    return {
      valid: false,
      error: 'Website URL must start with http:// or https://.',
      clean: { displayName, slug, category, bio, currency },
    };
  }

  return {
    valid: true,
    clean: {
      displayName,
      slug,
      category,
      bio,
      ...(websiteRaw ? { websiteUrl: websiteRaw } : {}),
      ...(location ? { location } : {}),
      currency,
    },
  };
}
