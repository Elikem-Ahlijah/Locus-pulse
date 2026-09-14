/**
 * NPA Ghana fuel price scraper.
 *
 * Primary source: Pumply.co which aggregates official NPA floor prices.
 * Falls back to GOIL Ghana's own published prices.
 *
 * Output is normalized to { fuelType, priceGhs, effectiveDate, source }
 * for direct write to KV under fuel:<YYYY-MM-DD>.
 */

interface FuelPrice {
  fuelType: 'petrol' | 'diesel' | 'lpg';
  priceGhs: number;
  effectiveDate: string;
  source: string;
}

interface ScrapedFuel {
  petrol?: number;
  diesel?: number;
  lpg?: number;
  source: string;
  effectiveLabel?: string;
}

export async function scrapeNpaFuelPrices(): Promise<FuelPrice[]> {
  // Try Pumply first (their HTML has clear "Petrol floor GHS X" markers)
  try {
    const scraped = await scrapePumply();
    if (scraped.petrol || scraped.diesel) {
      return normalize(scraped);
    }
  } catch {
    // fall through
  }

  // Try GOIL
  try {
    const scraped = await scrapeGoil();
    if (scraped.petrol || scraped.diesel) {
      return normalize(scraped);
    }
  } catch {
    // fall through
  }

  // Final fallback: pulse.com.gh news scrape for latest NPA announcement
  try {
    const scraped = await scrapePulseNpaNews();
    if (scraped.petrol || scraped.diesel) {
      return normalize(scraped);
    }
  } catch {
    // fall through
  }

  // No source returned data — return empty
  return [];
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalize(s: ScrapedFuel): FuelPrice[] {
  const date = todayUtc();
  const out: FuelPrice[] = [];
  if (s.petrol) out.push({ fuelType: 'petrol', priceGhs: s.petrol, effectiveDate: date, source: s.source });
  if (s.diesel) out.push({ fuelType: 'diesel', priceGhs: s.diesel, effectiveDate: date, source: s.source });
  if (s.lpg) out.push({ fuelType: 'lpg', priceGhs: s.lpg, effectiveDate: date, source: s.source });
  return out;
}

// ============================================
// Pumply.co scraper
// ============================================

async function scrapePumply(): Promise<ScrapedFuel> {
  const res = await fetch('https://pumply.co/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Locus-Pulse/1.0; +https://locus-pulse.pages.dev)',
    },
  });
  if (!res.ok) throw new Error(`Pumply ${res.status}`);
  const html = await res.text();
  return {
    petrol: extractPrice(html, /Petrol\s*floor[\s\S]{0,80}?GH\s*[₵c]\s*([\d.]+)/i)
      ?? extractPrice(html, /Average petrol[\s\S]{0,80}?GH\s*[₵c]\s*([\d.]+)/i)
      ?? extractPrice(html, /Petrol[\s\S]{0,80}?GH\s*[₵c]\s*([\d.]+)/i),
    diesel: extractPrice(html, /Diesel\s*floor[\s\S]{0,80}?GH\s*[₵c]\s*([\d.]+)/i)
      ?? extractPrice(html, /Average diesel[\s\S]{0,80}?GH\s*[₵c]\s*([\d.]+)/i)
      ?? extractPrice(html, /Diesel[\s\S]{0,80}?GH\s*[₵c]\s*([\d.]+)/i),
    lpg: extractPrice(html, /LPG[\s\S]{0,80}?GH\s*[₵c]\s*([\d.]+)/i)
      ?? extractPrice(html, /LPG[\s\S]{0,200}?GH\s*[₵c]\s*([\d.]+)/i),
    source: 'pumply.co (NPA)',
    effectiveLabel: extractText(html, /(Pricing window[\s\S]{0,80}?\d{1,2}\s*\w+\s*\d{4})/i),
  };
}

// ============================================
// GOIL Ghana scraper
// ============================================

async function scrapeGoil(): Promise<ScrapedFuel> {
  const res = await fetch('https://www.goil.com.gh/new-fuel-prices/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Locus-Pulse/1.0; +https://locus-pulse.pages.dev)',
    },
  });
  if (!res.ok) throw new Error(`GOIL ${res.status}`);
  const html = await res.text();

  // GOIL announces like "Super XP - Ghc 15.43" and "Diesel XP - Ghc 17.26"
  return {
    petrol: extractPrice(html, /Super\s*XP[^G]{0,80}?Ghc?\s*([\d.]+)/i)
      ?? extractPrice(html, /Petrol[^G]{0,80}?Ghc?\s*([\d.]+)/i),
    diesel: extractPrice(html, /Diesel[^G]{0,80}?Ghc?\s*([\d.]+)/i),
    lpg: extractPrice(html, /LPG[^G]{0,80}?Ghc?\s*([\d.]+)/i),
    source: 'goil.com.gh',
    effectiveLabel: extractText(html, /Effective[\s\S]{0,80}?\d{1,2}\w*\s*\w+\s*\d{4}/i),
  };
}

// ============================================
// Pulse.com.gh news scrape (fallback)
// Pulse frequently publishes "NPA raises fuel price floors" articles
// ============================================

async function scrapePulseNpaNews(): Promise<ScrapedFuel> {
  const res = await fetch('https://www.pulse.com.gh/news', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Locus-Pulse/1.0; +https://locus-pulse.pages.dev)',
    },
  });
  if (!res.ok) throw new Error(`Pulse ${res.status}`);
  const html = await res.text();

  // Look for "Petrol rises to GH¢X" pattern in headlines
  const petrolMatch = html.match(/Petrol[^|]{0,80}?GH\s*[₵¢c]\s*([\d.]+)/i);
  const dieselMatch = html.match(/[Dd]iesel[^|]{0,80}?GH\s*[₵¢c]\s*([\d.]+)/i);
  const lpgMatch = html.match(/LPG[^|]{0,80}?GH\s*[₵¢c]\s*([\d.]+)/i);

  return {
    petrol: petrolMatch ? parseFloat(petrolMatch[1]) : undefined,
    diesel: dieselMatch ? parseFloat(dieselMatch[1]) : undefined,
    lpg: lpgMatch ? parseFloat(lpgMatch[1]) : undefined,
    source: 'pulse.com.gh (NPA news)',
  };
}

// ============================================
// Helpers
// ============================================

function extractPrice(html: string, regex: RegExp): number | undefined {
  const m = html.match(regex);
  if (!m) return undefined;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : undefined;
}

function extractText(html: string, regex: RegExp): string | undefined {
  const m = html.match(regex);
  return m ? m[1].replace(/\s+/g, ' ').trim() : undefined;
}
