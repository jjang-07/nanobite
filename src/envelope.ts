const OPEN = '--- nanobite-json ---';
/** Messages sent before the rename to Nanobite still parse. */
const OPENERS = [OPEN, '--- contextpr-json ---'];
const CLOSE = '--- end ---';
export function encodeEnvelope(kind: string, payload: Record<string, unknown>): string {
    return `${OPEN}\n${JSON.stringify({ ...payload, kind })}\n${CLOSE}`;
}
export function parseEnvelope(body: string | null): {
    kind: string;
    payload: any;
} | null {
    if (!body)
        return null;
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex(line => OPENERS.some(open => line === open || line === `> ${open}` || line === `>${open}`));
    if (start < 0)
        return null;
    const quoted = lines[start].startsWith('>');
    const unquote = (line: string) => quoted ? line.replace(/^> ?/, '') : line;
    const end = lines.findIndex((line, index) => index > start && unquote(line) === CLOSE);
    if (end < 0)
        return null;
    const raw = lines.slice(start + 1, end).map(unquote).join('\n').trim();
    try {
        const payload = JSON.parse(raw);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.v !== 1 || !['request', 'capsule', 'denial'].includes(payload.kind))
            return null;
        return { kind: payload.kind, payload };
    }
    catch {
        return null;
    }
}
export function prIdFromSubject(subject: string | null): string | null {
    const m = subject?.match(/\[(?:Nanobite|ContextPR) (cpr_[a-z0-9]+)\]/);
    return m ? m[1] : null;
}
