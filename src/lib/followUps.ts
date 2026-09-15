/**
 * Follow-up suggestions — generated per turn based on which tools Locus used.
 *
 * Goal: never show generic "ask anything" suggestions. Always show 2-3
 * concrete next questions that deepen the same topic.
 */

export interface FollowUp {
  icon: string;
  label: string;
  query: string;
}

// Map of intent (tool name) → ordered follow-up chips.
const FOLLOW_UPS_BY_TOOL: Record<string, FollowUp[]> = {
  get_daily_brief: [
    { icon: '🔍', label: 'Top story in detail', query: 'tell me the top story in detail' },
    { icon: '⚽', label: 'Sports only', query: 'just the sports update' },
    { icon: '💵', label: 'Just the numbers', query: 'cedi, fuel, and power — just the numbers' },
  ],
  get_news: [
    { icon: '📖', label: 'First one, in detail', query: 'tell me about the first story in detail' },
    { icon: '🏛️', label: 'Politics only', query: 'show me politics stories only' },
    { icon: '💼', label: 'Business only', query: 'show me business news only' },
  ],
  get_sports_result: [
    { icon: '📅', label: 'Next fixture', query: 'when is the next fixture' },
    { icon: '🏆', label: 'League standings', query: 'show me the league standings' },
    { icon: '⚽', label: 'Top scorers', query: 'who is the top scorer' },
  ],
  get_league_standings: [
    { icon: '📅', label: 'Next fixture for the leader', query: 'when does the league leader play next' },
    { icon: '⚽', label: 'Top scorers', query: 'who is the top scorer in this league' },
  ],
  get_movies: [
    { icon: '🎟', label: 'Top rated', query: 'show me the top rated movies playing' },
    { icon: '📅', label: 'Coming soon', query: 'what movies are coming soon' },
  ],
  convert_fx: [
    { icon: '🔁', label: 'Reverse it', query: 'reverse it — cedis to dollars' },
    { icon: '🟰', label: 'EUR instead', query: 'how about euros' },
    { icon: '📈', label: 'Compared to yesterday', query: 'how does that compare to yesterday' },
  ],
  get_fuel_prices: [
    { icon: '⛽', label: 'Diesel too', query: 'what about diesel' },
    { icon: '🏷', label: 'Compare stations', query: 'which station is cheapest right now' },
    { icon: '🔥', label: 'LPG too', query: 'what about LPG cooking gas' },
  ],
  get_power_outages: [
    { icon: '🕐', label: 'When is the next one', query: 'when is the next planned outage' },
    { icon: '📍', label: 'My area', query: 'check outages for my area' },
  ],
  get_weather: [
    { icon: '🌦', label: 'Tomorrow', query: 'tomorrow' },
    { icon: '📍', label: 'Other city', query: 'what about Kumasi' },
  ],
};

// Generic fallbacks when no tool match.
const GENERIC_FOLLOW_UPS: FollowUp[] = [
  { icon: '🔍', label: 'Tell me more', query: 'tell me more about that' },
  { icon: '🌅', label: 'Morning brief', query: 'give me the morning brief' },
  { icon: '💵', label: 'Cedi rate', query: 'what is the cedi rate today' },
];

export function suggestFollowUps(toolNames: string[]): FollowUp[] {
  // Try the last tool called first, fall back through earlier tools
  for (let i = toolNames.length - 1; i >= 0; i--) {
    const name = toolNames[i];
    if (FOLLOW_UPS_BY_TOOL[name]) {
      return FOLLOW_UPS_BY_TOOL[name];
    }
  }
  return GENERIC_FOLLOW_UPS;
}

// Detect intent from raw text — used as a fallback when no tool matched.
export function detectIntentFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (/(?:morning|hello|hi |hey|good morning)/.test(t)) return 'get_daily_brief';
  if (/(?:cedi|dollar|usd|\$|exchange|fx|rate)/.test(t)) return 'convert_fx';
  if (/(?:petrol|fuel|diesel|lpg|gas)/.test(t)) return 'get_fuel_prices';
  if (/(?:power|light|electricity|outage|dumsor)/.test(t)) return 'get_power_outages';
  if (/(?:sport|match|score|fixture|kotoko|hearts|black stars|gpl)/.test(t)) return 'get_sports_result';
  if (/(?:movie|cinema|film)/.test(t)) return 'get_movies';
  if (/(?:weather|rain|temperature)/.test(t)) return 'get_weather';
  if (/(?:news|headlines|story|article)/.test(t)) return 'get_news';
  return null;
}
