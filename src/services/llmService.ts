/**
 * llmService — calls our /api/llm Pages Function which proxies to MiniMax.
 *
 * For Phase 1 MVP, this is a thin client. The actual MiniMax tool-calling
 * happens server-side in functions/api/llm.ts.
 */

import type { LlmRequest, LlmResponse } from '../types';
import { STORAGE_KEY_USER_ID } from '../types';

function getUserId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem(STORAGE_KEY_USER_ID);
  if (!id) {
    id = `usr_${crypto.randomUUID()}`;
    localStorage.setItem(STORAGE_KEY_USER_ID, id);
  }
  return id;
}

export async function askLocus(query: string): Promise<LlmResponse> {
  const userId = getUserId();

  const payload: LlmRequest = {
    userId,
    query,
  };

  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Locus is having trouble (${res.status}): ${text}`);
  }

  const data = (await res.json()) as LlmResponse;
  return data;
}

export async function fetchQuota(): Promise<LlmResponse['quota'] | null> {
  const userId = getUserId();
  try {
    const res = await fetch(`/api/quota?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { quota: LlmResponse['quota'] };
    return data.quota ?? null;
  } catch {
    return null;
  }
}
