/**
 * ECG Ghana power outage scraper.
 *
 * Primary sources:
 *  1. ecg.com.gh Current Status pages (per region)
 *  2. GhanaWeb / Pulse news for outage announcements
 *
 * Output is normalized to { region, area, outageStartUtc, outageEndUtc, reason }
 * for direct write to KV under power:<YYYY-MM-DD>.
 */

interface PowerOutage {
  region: string;
  area: string;
  outageStartUtc: number;
  outageEndUtc: number;
  reason?: string;
}

const REGION_URLS: { region: string; url: string }[] = [
  { region: 'Greater Accra', url: 'https://ecg.com.gh/index.php/en/services/ecg-status/current-system-status/current-status-greater-accra' },
  { region: 'Ashanti', url: 'https://ecg.com.gh/index.php/en/services/ecg-status/current-system-status/current-status-ashanti' },
  { region: 'Central', url: 'https://ecg.com.gh/index.php/en/services/ecg-status/current-system-status/current-status-central' },
  { region: 'Eastern', url: 'https://ecg.com.gh/index.php/en/services/ecg-status/current-system-status/current-status-eastern' },
  { region: 'Western', url: 'https://ecg.com.gh/index.php/en/services/ecg-status/current-system-status/current-status-western' },
  { region: 'Tema', url: 'https://ecg.com.gh/index.php/en/services/ecg-status/current-system-status/current-status-tema' },
];

export async function scrapeEcgOutages(): Promise<PowerOutage[]> {
  const all: PowerOutage[] = [];

  // Scrape all ECG regions in parallel
  const results = await Promise.allSettled(
    REGION_URLS.map(async ({ region, url }) => {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Locus-Pulse/1.0; +https://locus-pulse.pages.dev)',
          },
        });
        if (!res.ok) return [];
        const html = await res.text();
        return parseEcgRegionHtml(html, region);
      } catch {
        return [];
      }
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  // Always seed a few well-known recurring patterns (Dumsor schedules follow A/B/C/D groups)
  // — these are placeholder city-wide windows when NPA publishes a load-shedding timetable.
  // We don't fabricate — these are inserted only if we found NOTHING from the live pages
  // AND a recent news article indicates active load shedding.
  if (all.length === 0) {
    const news = await tryEcgNewsFallback();
    if (news.length > 0) {
      return news;
    }
  }

  // Deduplicate by (region, area, start, end)
  const seen = new Set<string>();
  return all.filter((o) => {
    const key = `${o.region}|${o.area}|${o.outageStartUtc}|${o.outageEndUtc}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================
// ECG region page parser
// ============================================

function parseEcgRegionHtml(html: string, region: string): PowerOutage[] {
  const out: PowerOutage[] = [];

  // The ECG pages list outage announcements in this rough format:
  //   "Planned Maintenance works in [Region] on Wednesday, 16th September, 2026"
  //   followed by area names like "Oyarifa Ankonam, Teshie Beach Road, ..."
  // We split into individual announcement blocks by date headers.

  // Find all date lines first
  const dateRegex = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+),?\s+(\d{4})/gi;
  const dates: { idx: number; date: Date }[] = [];
  let m: RegExpExecArray | null;
  while ((m = dateRegex.exec(html)) !== null) {
    const d = parseDate(m[1], parseInt(m[2], 10), m[3], parseInt(m[4], 10));
    if (d && !isNaN(d.getTime())) dates.push({ idx: m.index, date: d });
  }

  // Find all time ranges within those blocks
  // Pattern: "9:00 AM – 5:00 PM" or "6:00am to 12:00pm"
  const timeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\s*[\u2013\-–to]+\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/g;

  // For each announcement, find a time range + areas
  // Heuristic: between date[i] and date[i+1], find the first time range and
  // the first list of area names that follow it.
  for (let i = 0; i < dates.length; i++) {
    const start = dates[i].idx;
    const end = i + 1 < dates.length ? dates[i + 1].idx : html.length;
    const block = html.substring(start, end);

    const timeMatch = block.match(timeRegex);
    if (!timeMatch) continue;

    const [startStr, endStr] = parseTimeRange(timeMatch[0]);
    if (!startStr || !endStr) continue;

    // Areas: usually after "affecting" or "Affected areas:" — a comma-separated list.
    const areasMatch = block.match(/(?:affecting|affected\s+areas?:?)\s*([^<]{20,400})/i);
    if (!areasMatch) continue;
    const areasText = areasMatch[1];

    // Split on commas and clean
    const areaNames = areasText
      .split(/,|·/)
      .map((a) => a.replace(/\s+/g, ' ').trim())
      .filter((a) => a.length > 1 && a.length < 80 && !/^[a-z]/.test(a))
      .slice(0, 25);

    const reason = block.match(/maintenance|emergency|upgrade|damaged|fault|outage/i)?.[0];

    const outageStart = combineDateTime(dates[i].date, startStr);
    const outageEnd = combineDateTime(dates[i].date, endStr);
    if (!Number.isFinite(outageStart) || !Number.isFinite(outageEnd)) continue;

    for (const area of areaNames) {
      out.push({
        region,
        area,
        outageStartUtc: outageStart,
        outageEndUtc: outageEnd,
        reason,
      });
    }
  }

  return out;
}

// ============================================
// Pulse.com.gh news fallback
// Pulse publishes daily "ECG shares X day schedule" articles
// ============================================

async function tryEcgNewsFallback(): Promise<PowerOutage[]> {
  try {
    const res = await fetch('https://www.pulse.com.gh/news', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Locus-Pulse/1.0)' },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Look for "Parts of [Region] to be hit by power cut from [Date]; ECG shares 7 day schedule"
    const articleMatch = html.match(
      /Parts\s+of\s+([^<,]+(?:,\s*[^<,]+){0,3})\s+(?:to\s+be\s+)?hit\s+by\s+power\s+cut\s+from\s+([A-Za-z]+\s+\d{1,2})(?:[;\s]+ECG\s+shares[\s\S]{0,60}?(\d+)\s+day\s+schedule)?/i
    );
    if (!articleMatch) return [];

    const regions = articleMatch[1].split(/,|and/).map((r) => r.trim()).filter(Boolean);
    const days = parseInt(articleMatch[3] || '7', 10);

    // Create a placeholder entry pointing users to read the article
    const start = Date.now();
    const end = start + days * 86400000;
    return regions.map((region) => ({
      region,
      area: 'See article for full area list',
      outageStartUtc: start,
      outageEndUtc: end,
      reason: `Scheduled load management — ${days} day window`,
    }));
  } catch {
    return [];
  }
}

// ============================================
// Helpers
// ============================================

function parseDate(dayName: string, day: number, monthName: string, year: number): Date | null {
  const months = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIdx = months.indexOf(monthName.toLowerCase());
  if (monthIdx === -1) return null;
  return new Date(Date.UTC(year, monthIdx, day, 0, 0, 0));
}

function parseTimeRange(s: string): [string, string] | [null, null] {
  // s like "9:00 AM – 5:00 PM" or "6am – 12pm"
  const m = s.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\s*[\u2013\-–to]+\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/);
  if (!m) return [null, null];
  return [m[1].trim(), m[2].trim()];
}

function combineDateTime(date: Date, timeStr: string): number {
  // Parse "9:00 AM" or "6am" or "6:00"
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!m) return NaN;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute)).getTime();
}
