const OPEN = '--- contextpr-json ---'; const CLOSE = '--- end ---';
export function encodeEnvelope(kind: string, payload: Record<string, unknown>): string {
  return `${OPEN}\n${JSON.stringify({ ...payload, kind })}\n${CLOSE}`;
}
export function parseEnvelope(body: string | null): { kind: string; payload: any } | null {
  if (!body) return null;
  const start = body.indexOf(OPEN); if (start < 0) return null;
  const end = body.indexOf(CLOSE, start); if (end < 0) return null;
  const raw = body.slice(start + OPEN.length, end).replace(/^>\s?/gm, '').trim();  // tolerate quoted replies
  try { const payload = JSON.parse(raw); if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.v !== 1 || !['request','capsule','denial'].includes(payload.kind)) return null; return { kind: payload.kind, payload }; } catch { return null; }
}
export function prIdFromSubject(subject: string | null): string | null {
  const m = subject?.match(/\[ContextPR (cpr_[a-z0-9]+)\]/); return m ? m[1] : null;
}
