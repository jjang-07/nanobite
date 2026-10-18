import type { SendInput, SendResult, ReplyEmail, InboundSummary, InboundDetail } from './types.ts';
export type { SendInput, SendResult, ReplyEmail, InboundSummary, InboundDetail } from './types.ts';
export interface PrimitiveClient {
    sendMail(input: SendInput): Promise<SendResult>;
    replyToEmail(inboundEmailId: string, input: {
        bodyText: string;
        idempotencyKey: string;
        wait?: boolean;
    }): Promise<SendResult>;
    awaitReply(sentEmailId: string, waitMs: number): Promise<ReplyEmail | null>;
    listInbound(recipient: string, since: string | null, waitSeconds: number): Promise<{
        items: InboundSummary[];
        nextSince: string | null;
    }>;
    getEmail(id: string): Promise<InboundDetail>;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** "Name <addr@x>" → "addr@x". Reply senders arrive as the raw From header (Outlook, verified live). */
export function bareAddress(value: string | null | undefined): string {
    const s = String(value ?? '').trim(), angle = s.match(/<([^<>\s]+@[^<>\s]+)>\s*$/);
    return angle ? angle[1] : s;
}
export class PrimitiveError extends Error {
    status: number;
    code: string;
    actions: string[];
    retryAfter: string | null;
    constructor(status: number, code: string, actions: string[], retryAfter: string | null) {
        super(`Primitive ${status} ${code}${actions.length ? `; fixes: ${actions.join(', ')}` : ''}`);
        this.status = status;
        this.code = code;
        this.actions = actions;
        this.retryAfter = retryAfter;
    }
}
const result = (d: any): SendResult => ({ sentEmailId: d.id, status: d.status, ...(d.delivery_status ? { deliveryStatus: d.delivery_status } : {}) });
const summary = (d: any): InboundSummary => ({ id: d.id, threadId: d.thread_id ?? null, sender: bareAddress(d.sender ?? d.from_email), recipient: bareAddress(d.recipient ?? d.to_email), subject: d.subject ?? null, receivedAt: d.received_at ?? d.created_at, snippet: d.snippet ?? null, fyi: d.fyi === true, automated: d.automated === true });
/**
 * Each call is abandoned `slackMs` after the server-side wait it asked for, so one hung request
 * stalls the sequential worker cycle for seconds, not a fixed 35 s (observed once live, 2026-10-17).
 */
export function createPrimitiveClient(apiKey: string, fetchImpl: typeof fetch = fetch, options: { slackMs?: number } = {}): PrimitiveClient {
    const slackMs = options.slackMs ?? 10000;
    async function request(method: string, path: string, query?: Record<string, string>, body?: unknown, key?: string, serverWaitMs = 0) {
        const url = 'https://api.primitive.dev/v1' + path + (query ? '?' + new URLSearchParams(query) : '');
        const res = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(serverWaitMs + slackMs) });
        const retryAfter = res.headers.get('retry-after');
        let json: any;
        try {
            json = await res.json();
        }
        catch {
            // JSON parser errors may embed the response body, including credentials.
            throw new PrimitiveError(res.status, res.ok ? 'invalid_json_response' : 'request_failed', [], retryAfter);
        }
        if (!res.ok || json?.success === false) {
            const gates = json?.gates ?? json?.error?.gates;
            const actions = Array.isArray(gates) ? gates.map((gate: any) => gate?.fix?.action).filter((action: unknown): action is string => typeof action === 'string') : [];
            const code = typeof json?.error?.code === 'string' ? json.error.code : 'request_failed';
            throw new PrimitiveError(res.status, code, actions, retryAfter);
        }
        if (!json || typeof json !== 'object' || Array.isArray(json))
            throw new PrimitiveError(res.status, 'invalid_response', [], retryAfter);
        return json;
    }
    return {
        async sendMail(i) { const j = await request('POST', '/send-mail', undefined, { from: i.from, to: i.to, subject: i.subject, body_text: i.bodyText, body_html: i.bodyHtml, in_reply_to: i.inReplyTo, references: i.references, wait: i.wait, wait_timeout_ms: i.wait ? 30000 : undefined }, i.idempotencyKey, i.wait ? 30000 : 0); return result(j.data); },
        async replyToEmail(id, i) { return result((await request('POST', `/emails/${encodeURIComponent(id)}/reply`, undefined, { body_text: i.bodyText, wait: i.wait }, i.idempotencyKey, i.wait ? 30000 : 0)).data); },
        async awaitReply(id, waitMs) {
            const wait = clamp(waitMs, 1000, 30000);
            const d = (await request('GET', `/sent-emails/${encodeURIComponent(id)}/reply`, { wait: 'true', wait_timeout_ms: String(wait) }, undefined, undefined, wait)).data.reply;
            return d ? { id: d.id, threadId: d.thread_id ?? null, replyToSentEmailId: d.reply_to_sent_email_id ?? null, fromEmail: bareAddress(d.from_email), toEmail: bareAddress(d.to_email), subject: d.subject ?? null, bodyText: d.body_text ?? null, receivedAt: d.received_at ?? null, fyi: d.fyi === true, senderVerified: d.sender_verified === true } : null;
        },
        async listInbound(recipient, since, waitSeconds) {
            const wait = since ? clamp(waitSeconds, 0, 30) : 0;
            const j = await request('GET', '/emails', { recipient, limit: since ? '50' : '1', ...(since ? { since, wait: String(wait) } : {}) }, undefined, undefined, wait * 1000);
            const items: InboundSummary[] = j.data.map(summary);
            const last = items.at(-1);
            return { items, nextSince: j.meta?.cursor ?? (last ? `${last.receivedAt}|${last.id}` : since) };
        },
        async getEmail(id) {
            const d = (await request('GET', `/emails/${encodeURIComponent(id)}`)).data;
            return { ...summary(d), bodyText: d.body_text ?? d.parsed?.body_text ?? null, bodyHtml: d.body_html ?? d.parsed?.body_html ?? null, fromEmail: bareAddress(d.from_email), toEmail: bareAddress(d.to_email), replyToSentEmailId: d.reply_to_sent_email_id ?? null, inReplyTo: d.parsed?.in_reply_to ?? [], references: d.parsed?.references ?? [], attachments: (d.parsed?.attachments ?? []).map((a: any) => ({ filename: a.filename ?? null, contentType: a.content_type ?? null, sizeBytes: a.size_bytes, partIndex: a.part_index })) };
        }
    };
}
