export interface CountryOption {
  code: string;
  name: string;
  region: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'GH', name: 'Ghana', region: 'West Africa' },
  { code: 'NG', name: 'Nigeria', region: 'West Africa' },
  { code: 'US', name: 'United States', region: 'North America' },
  { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  { code: 'CA', name: 'Canada', region: 'North America' },
  { code: 'KE', name: 'Kenya', region: 'East Africa' },
  { code: 'ZA', name: 'South Africa', region: 'Southern Africa' },
  { code: 'FR', name: 'France', region: 'Europe' },
  { code: 'DE', name: 'Germany', region: 'Europe' },
  { code: 'IT', name: 'Italy', region: 'Europe' },
  { code: 'ES', name: 'Spain', region: 'Europe' },
  { code: 'NL', name: 'Netherlands', region: 'Europe' },
  { code: 'CH', name: 'Switzerland', region: 'Europe' },
  { code: 'SE', name: 'Sweden', region: 'Europe' },
  { code: 'AE', name: 'United Arab Emirates', region: 'Middle East' },
  { code: 'SA', name: 'Saudi Arabia', region: 'Middle East' },
  { code: 'EG', name: 'Egypt', region: 'North Africa' },
  { code: 'MA', name: 'Morocco', region: 'North Africa' },
  { code: 'CI', name: "Côte d'Ivoire", region: 'West Africa' },
  { code: 'SN', name: 'Senegal', region: 'West Africa' },
  { code: 'RW', name: 'Rwanda', region: 'East Africa' },
  { code: 'AU', name: 'Australia', region: 'Oceania' },
  { code: 'NZ', name: 'New Zealand', region: 'Oceania' },
  { code: 'JP', name: 'Japan', region: 'East Asia' },
  { code: 'KR', name: 'South Korea', region: 'East Asia' },
  { code: 'SG', name: 'Singapore', region: 'Southeast Asia' },
  { code: 'IN', name: 'India', region: 'South Asia' },
  { code: 'BR', name: 'Brazil', region: 'South America' },
  { code: 'MX', name: 'Mexico', region: 'North America' },
  { code: 'JM', name: 'Jamaica', region: 'Caribbean' },
];

export function resolveCountryOption(value?: string): CountryOption | null {
  const clean = (value || '').trim().toLowerCase();
  if (!clean) return null;
  return (
    COUNTRY_OPTIONS.find(
      (c) => c.code.toLowerCase() === clean || c.name.toLowerCase() === clean
    ) || null
  );
}
