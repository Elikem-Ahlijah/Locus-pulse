/**
 * Minimal test endpoint to verify function routing.
 */
export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
