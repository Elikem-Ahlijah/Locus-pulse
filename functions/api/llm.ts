/**
 * POST /api/llm
 *
 * Body: { userId: string, query: string }
 * Response: { text: string, toolCalls: [{name, arguments, result}], quota: {...} }
 *
 * Flow:
 *   1. Quota check + increment (5/day free)
 *   2. Build messages (system prompt + user query)
 *   3. Call MiniMax with tool definitions
 *   4. If MiniMax wants tool calls, execute them against KV, loop back
 *   5. Cap at 3 tool-call rounds to bound latency
 *   6. Return final text + tool trace + quota
 *
 * Fact-check guardrail: every tool result is real KV data. The system prompt
 * forbids inventing numbers; combined with low temperature (~0.3) this keeps
 * hallucinated scores/prices out of the spoken answer.
 */

import { PULSE_SYSTEM_PROMPT, PULSE_TOOLS, executeToolCall, ToolCall } from '../_lib/pulseTools';
import { checkAndIncrementQuota, readQuota } from '../_lib/kv';

interface Env {
  LOCUS_DATA: KVNamespace;
  MINIMAX_API_KEY: string;
  QUOTA_DAILY_LIMIT?: string;
}

interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

interface MiniMaxTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const dailyLimit = parseInt(env.QUOTA_DAILY_LIMIT || '5', 10);

  // Parse body
  let body: { userId?: string; query?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { userId, query } = body;
  if (!userId || !query) {
    return json({ error: 'userId and query are required' }, 400);
  }
  if (typeof query !== 'string' || query.trim().length === 0) {
    return json({ error: 'query must be a non-empty string' }, 400);
  }

  // Quota
  const quota = await checkAndIncrementQuota(env.LOCUS_DATA, userId, dailyLimit);
  if (!quota) {
    // Get current quota for error response
    const current = await readQuota(env.LOCUS_DATA, userId, dailyLimit);
    return json(
      {
        error: 'Daily limit reached',
        message: `You've used all ${dailyLimit} free queries today. Resets at midnight UTC.`,
        quota: current,
      },
      429
    );
  }

  // Build MiniMax request
  const messages: MiniMaxMessage[] = [
    { role: 'system', content: PULSE_SYSTEM_PROMPT },
    { role: 'user', content: query.trim() },
  ];

  const tools: MiniMaxTool[] = PULSE_TOOLS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const toolTrace: { name: string; arguments: any; result?: any; error?: string }[] = [];

  // Try LLM call. If it fails (auth error, network, etc.), fall back to
  // keyword-based dispatch so the app stays usable without a working LLM key.
  let finalText = '';
  let llmWorked = false;

  for (let round = 0; round < 3; round++) {
    const minimaxRes = await callMiniMax(env.MINIMAX_API_KEY, messages, tools);
    if (!minimaxRes.ok) {
      // First-round LLM failure → fall back to keyword dispatch
      if (round === 0) {
        const dispatched = await keywordFallback(query, env.LOCUS_DATA, toolTrace);
        if (dispatched) {
          finalText = dispatched;
          llmWorked = false;
        } else {
          finalText = `Sorry, I could not reach my AI brain right now (${minimaxRes.error}). Try again in a minute.`;
        }
      }
      break;
    }
    llmWorked = true;
    const choice = minimaxRes.data?.choices?.[0];
    if (!choice) break;
    const assistantMsg = choice.message;

    // Strip MiniMax <think>...</think> reasoning block from final text
    const stripThink = (s: string | null | undefined): string => {
      if (!s) return '';
      return s.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    };

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalText = stripThink(assistantMsg.content);
      break;
    }

    messages.push(assistantMsg);
    for (const tc of assistantMsg.tool_calls) {
      const call: ToolCall = {
        name: tc.function.name,
        arguments: safeParseArgs(tc.function.arguments),
      };
      const result = await executeToolCall(call, { kv: env.LOCUS_DATA });
      const traceEntry: any = { name: call.name, arguments: call.arguments };
      if (result.ok) {
        traceEntry.result = result.data;
        messages.push({ role: 'tool', content: JSON.stringify(result.data), tool_call_id: tc.id });
      } else {
        traceEntry.error = result.error;
        messages.push({ role: 'tool', content: JSON.stringify({ error: result.error }), tool_call_id: tc.id });
      }
      toolTrace.push(traceEntry);
    }
  }

  // If we exited the loop with no final text, ask the LLM to summarize what it found
  if (!finalText) {
    const summaryRes = await callMiniMax(
      env.MINIMAX_API_KEY,
      [
        ...messages,
        {
          role: 'user',
          content:
            'You have all the data you need. Now give me a short spoken answer (under 60 words) based only on the tool results. Do not invent anything.',
        },
      ],
      [] // no tools — force plain text
    );
    if (summaryRes.ok) {
      finalText = summaryRes.data?.choices?.[0]?.message?.content ?? '';
    }
  }

  // Graceful fallback when LLM is unavailable or returns empty —
  // synthesize a simple spoken response from the tool results so the app
  // stays useful even without a working LLM key.
  if (!finalText && toolTrace.length > 0) {
    finalText = fallbackFromToolTrace(toolTrace);
  }

  if (!finalText) {
    finalText = 'Sorry, I could not find an answer. Try asking about news, sports, the cedi rate, or fuel prices.';
  }

  return json({
    text: finalText || 'Sorry, I could not find an answer.',
    toolCalls: toolTrace,
    quota: formatQuota(userId, quota.used, dailyLimit),
    llmWorked,
  });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
};

// ============================================
// Helpers
// ============================================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function formatQuota(userId: string, used: number, dailyLimit: number) {
  return {
    userId,
    date: new Date().toISOString().slice(0, 10),
    queriesUsed: used,
    queriesRemaining: Math.max(0, dailyLimit - used),
    dailyLimit,
    resetAtUtc: nextMidnightUtc(),
  };
}

function nextMidnightUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function safeParseArgs(raw: any): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && raw !== null) return raw;
  return {};
}

/**
 * Keyword-based fallback dispatch — used when the LLM is unreachable.
 * Picks the most likely tool from the user query and runs it.
 */
async function keywordFallback(
  query: string,
  kv: KVNamespace,
  trace: { name: string; arguments: any; result?: any; error?: string }[]
): Promise<string> {
  const q = query.toLowerCase();

  // Currency conversion: "convert 100 USD to GHS", "100 dollars in cedis"
  const convertMatch = q.match(/(\d+(?:\.\d+)?)\s*(usd|dollars?|euros?|gbp|pounds?|ngn|naira|cad)\s*(?:to|in|into)\s*(ghs|cedis?|ghana\s*cedi)?/i)
    || q.match(/(?:convert|how\s*much)\s*(\d+(?:\.\d+)?)?\s*(usd|dollars?|euros?|gbp|pounds?|ngn|naira)/i);
  if (convertMatch) {
    const amount = parseFloat(convertMatch[1] || '100');
    const fromMap: any = { dollar: 'USD', dollars: 'USD', usd: 'USD', euro: 'EUR', euros: 'EUR', gbp: 'GBP', pound: 'GBP', pounds: 'GBP', naira: 'NGN', ngn: 'NGN' };
    const from = (fromMap[convertMatch[2]?.toLowerCase()] ?? convertMatch[2]?.toUpperCase() ?? 'USD');
    const call: ToolCall = { name: 'convert_fx', arguments: { amount, from, to: 'GHS' } };
    const result = await executeToolCall(call, { kv });
    trace.push({ name: call.name, arguments: call.arguments, ...(result.ok ? { result: result.data } : { error: result.error }) });
    if (result.ok) {
      const r: any = result.data;
      return `${r.amount} ${r.from} is about ${r.converted} ${r.to}.`;
    }
  }

  // FX rate
  if (/cedi|ghs|exchange|forex|fx|dollar|usd/i.test(q)) {
    const call: ToolCall = { name: 'convert_fx', arguments: { amount: 1, from: 'USD' } };
    const result = await executeToolCall(call, { kv });
    trace.push({ name: call.name, arguments: call.arguments, ...(result.ok ? { result: result.data } : { error: result.error }) });
    if (result.ok) {
      const r: any = result.data;
      return `Today, 1 US dollar is ${r.rate.toFixed(2)} cedis, 1 euro is ${(r.rate * 0.862).toFixed(2)} cedis.`;
    }
  }

  // Fuel
  if (/fuel|petrol|diesel|lpg|gas/i.test(q)) {
    const call: ToolCall = { name: 'get_fuel_prices', arguments: {} };
    const result = await executeToolCall(call, { kv });
    trace.push({ name: call.name, arguments: {}, ...(result.ok ? { result: result.data } : { error: result.error }) });
    if (result.ok && (result.data as any[]).length) {
      const list = (result.data as any[]).map((f) => `${f.fuelType} ${f.priceGhs.toFixed(2)}`).join(', ');
      return `Current fuel prices: ${list} cedis.`;
    }
  }

  // Power
  if (/power|electric|outage|ecg|light/i.test(q)) {
    const call: ToolCall = { name: 'get_power_outages', arguments: {} };
    const result = await executeToolCall(call, { kv });
    trace.push({ name: call.name, arguments: {}, ...(result.ok ? { result: result.data } : { error: result.error }) });
    if (result.ok && (result.data as any[]).length) {
      return `There are ${(result.data as any[]).length} power outages scheduled today.`;
    }
  }

  // Sports
  if (/sport|match|football|soccer|game|score|fixture|league|kotoko|hearts|black stars|epl|gpl/i.test(q)) {
    const teamMatch = q.match(/(black\s*stars|kotoko|hearts|ashes|f|liberty|medeama|aduana|chelsea|united|city|liverpool|arsenal|tottenham|barcelona|real\s*madrid)/i);
    if (teamMatch) {
      const call: ToolCall = { name: 'get_sports_result', arguments: { team: teamMatch[1], type: 'recent' } };
      const result = await executeToolCall(call, { kv });
      trace.push({ name: call.name, arguments: call.arguments, ...(result.ok ? { result: result.data } : { error: result.error }) });
      if (result.ok && (result.data as any[]).length) {
        const f = (result.data as any[])[0];
        return `${f.homeTeam} ${f.homeScore ?? 0} - ${f.awayScore ?? 0} ${f.awayTeam} in ${f.league}.`;
      }
    }
    // Standings
    const lgMatch = q.match(/(gpl|english\s*premier|epl|la\s*liga|afcon)/i);
    if (lgMatch) {
      const league = lgMatch[1].toUpperCase().includes('GPL') ? 'GPL' : lgMatch[1].toUpperCase();
      const call: ToolCall = { name: 'get_league_standings', arguments: { league, limit: 5 } };
      const result = await executeToolCall(call, { kv });
      trace.push({ name: call.name, arguments: call.arguments, ...(result.ok ? { result: result.data } : { error: result.error }) });
      if (result.ok && (result.data as any[]).length) {
        const top = (result.data as any[]).slice(0, 3).map((s: any) => `${s.team} (${s.points}pts)`).join(', ');
        return `${league} top of the table: ${top}.`;
      }
    }
  }

  // Movies
  if (/movie|cinema|film|showing|playing/i.test(q)) {
    const call: ToolCall = { name: 'get_movies', arguments: { limit: 5 } };
    const result = await executeToolCall(call, { kv });
    trace.push({ name: call.name, arguments: {}, ...(result.ok ? { result: result.data } : { error: result.error }) });
    if (result.ok && (result.data as any[]).length) {
      const titles = (result.data as any[]).slice(0, 3).map((m: any) => m.title).join(', ');
      return `In cinemas: ${titles}.`;
    }
  }

  // News
  if (/news|headline|story|article/i.test(q) || q.length < 30) {
    const call: ToolCall = { name: 'get_news', arguments: { category: 'ghana_news', limit: 3 } };
    const result = await executeToolCall(call, { kv });
    trace.push({ name: call.name, arguments: call.arguments, ...(result.ok ? { result: result.data } : { error: result.error }) });
    if (result.ok && (result.data as any[]).length) {
      const titles = (result.data as any[]).slice(0, 2).map((a: any) => a.title.split(':')[0]).join('. ');
      return `Top stories: ${titles}.`;
    }
  }

  // Daily brief as final fallback
  const call: ToolCall = { name: 'get_daily_brief', arguments: {} };
  const result = await executeToolCall(call, { kv });
  trace.push({ name: call.name, arguments: {}, ...(result.ok ? { result: result.data } : { error: result.error }) });
  if (result.ok) return fallbackFromToolTrace([{ name: call.name, arguments: {}, result: result.data }]);

  return '';
}

/**
 * Synthesize a short spoken answer from tool results when LLM is unavailable.
 * Keeps the app useful even when MINIMAX_API_KEY is missing or invalid.
 */
function fallbackFromToolTrace(trace: { name: string; arguments: any; result?: any; error?: string }[]): string {
  if (trace.length === 0) return '';

  // Daily brief
  const brief = trace.find((t) => t.name === 'get_daily_brief' && t.result);
  if (brief && brief.result) {
    const r = brief.result;
    const parts: string[] = [];
    if (r.ghana_news?.length) {
      parts.push(`Top Ghana news: ${r.ghana_news.slice(0, 3).map((a: any) => a.title.split(':')[0]).join('; ')}.`);
    }
    if (r.fx?.GHS && r.fx?.USD) {
      parts.push(`Today, 1 US dollar is ${r.fx.USD.toFixed(2)} cedis.`);
    }
    if (r.fuel?.length) {
      const petrol = r.fuel.find((f: any) => f.fuelType === 'petrol');
      if (petrol) parts.push(`Petrol is ${petrol.priceGhs.toFixed(2)} cedis per litre.`);
    }
    if (r.movies?.length) {
      parts.push(`In cinemas: ${r.movies.slice(0, 2).map((m: any) => m.title).join(', ')}.`);
    }
    if (parts.length > 0) return parts.join(' ');
  }

  // FX conversion
  const fxCall = trace.find((t) => t.name === 'convert_fx' && t.result);
  if (fxCall && fxCall.result) {
    const r = fxCall.result;
    return `${r.amount} ${r.from} is about ${r.converted} ${r.to}.`;
  }

  // Fuel prices
  const fuelCall = trace.find((t) => t.name === 'get_fuel_prices' && t.result?.length);
  if (fuelCall) {
    const list = fuelCall.result.map((f: any) => `${f.fuelType} ${f.priceGhs.toFixed(2)}`).join(', ');
    return `Current fuel prices: ${list} cedis.`;
  }

  // Sports
  const sportsCall = trace.find((t) => t.name === 'get_sports_result' && t.result?.length);
  if (sportsCall) {
    const f = sportsCall.result[0];
    return `${f.homeTeam} ${f.homeScore ?? 0} - ${f.awayScore ?? 0} ${f.awayTeam} in ${f.league}.`;
  }

  // News
  const newsCall = trace.find((t) => t.name === 'get_news' && t.result?.length);
  if (newsCall) {
    return `Here's what I found: ${newsCall.result.slice(0, 2).map((a: any) => a.title).join('. ')}.`;
  }

  // Weather
  const weatherCall = trace.find((t) => t.name === 'get_weather' && t.result);
  if (weatherCall && weatherCall.result) {
    const w = weatherCall.result;
    return `${w.location}: ${w.temp_c}°C, ${w.description}.`;
  }

  return '';
}

interface MiniMaxCallResult {
  ok: boolean;
  data?: any;
  error?: string;
}

async function callMiniMax(
  apiKey: string,
  messages: MiniMaxMessage[],
  tools: MiniMaxTool[]
): Promise<MiniMaxCallResult> {
  if (!apiKey) {
    return { ok: false, error: 'MINIMAX_API_KEY not set' };
  }
  try {
    const body: any = {
      model: 'MiniMax-M3',
      messages,
      temperature: 0.3,
      max_completion_tokens: 500,
    };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    const res = await fetch('https://api.minimax.io/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { ok: false, error: `MiniMax ${res.status}: ${errText}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
