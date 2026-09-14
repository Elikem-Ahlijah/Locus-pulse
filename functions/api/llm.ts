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

  // Up to 3 tool-call rounds
  let finalText = '';
  for (let round = 0; round < 3; round++) {
    const minimaxRes = await callMiniMax(env.MINIMAX_API_KEY, messages, tools);
    if (!minimaxRes.ok) {
      return json(
        { error: 'LLM call failed', detail: minimaxRes.error, quota: formatQuota(userId, quota.used, dailyLimit) },
        502
      );
    }
    const choice = minimaxRes.data?.choices?.[0];
    if (!choice) {
      return json({ error: 'No LLM response', quota: formatQuota(userId, quota.used, dailyLimit) }, 502);
    }
    const assistantMsg = choice.message;

    // If no tool calls, we're done
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalText = assistantMsg.content ?? '';
      break;
    }

    // Execute tool calls (sequential; we don't have parallel tool call support yet)
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
        messages.push({
          role: 'tool',
          content: JSON.stringify(result.data),
          tool_call_id: tc.id,
        });
      } else {
        traceEntry.error = result.error;
        messages.push({
          role: 'tool',
          content: JSON.stringify({ error: result.error }),
          tool_call_id: tc.id,
        });
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

  return json({
    text: finalText || 'Sorry, I could not find an answer.',
    toolCalls: toolTrace,
    quota: formatQuota(userId, quota.used, dailyLimit),
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
      model: 'MiniMax-Text-01',
      messages,
      temperature: 0.3,
      max_tokens: 500,
    };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    const res = await fetch('https://api.MiniMax.chat/v1/chat/completions', {
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
