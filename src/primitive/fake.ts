import type { PrimitiveClient, SendInput, SendResult, InboundDetail, ReplyEmail } from './client.ts';
export class FakePrimitive implements PrimitiveClient {
    sent: SendInput[] = [];
    awaitCalls: {
        id: string;
        waitMs: number;
    }[] = [];
    replies = new Map<string, ReplyEmail>();
    inbox = new Map<string, InboundDetail>();
    pending: string[] = [];
    keys = new Map<string, SendResult>();
    async sendMail(input: SendInput): Promise<SendResult> { const existing = this.keys.get(input.idempotencyKey); if (existing)
        return existing; this.sent.push(input); const r = { sentEmailId: `sent_${this.sent.length}`, status: 'delivered', deliveryStatus: 'delivered' }; this.keys.set(input.idempotencyKey, r); return r; }
    async replyToEmail(id: string, i: {
        bodyText: string;
        idempotencyKey: string;
        wait?: boolean;
    }) { const inbound = await this.getEmail(id); return this.sendMail({ from: inbound.toEmail, to: inbound.fromEmail, subject: `Re: ${inbound.subject ?? ''}`, inReplyTo: id, ...i }); }
    deliverReply(id: string, r: Partial<ReplyEmail>) { const sent = this.sent[Number(id.split('_')[1]) - 1]; this.replies.set(id, { id: `reply_${id}`, threadId: `thread_${id}`, replyToSentEmailId: id, fromEmail: sent?.to ?? 'bob@example.com', toEmail: sent?.from ?? 'sdk-help@acme.primitive.email', subject: null, bodyText: null, receivedAt: new Date().toISOString(), fyi: false, senderVerified: true, ...r }); }
    async awaitReply(id: string, waitMs: number) { this.awaitCalls.push({ id, waitMs }); return this.replies.get(id) ?? null; }
    deliverInbound(d: Partial<InboundDetail> & {
        id: string;
        fromEmail: string;
        toEmail: string;
    }) { this.inbox.set(d.id, { threadId: `thread_${d.id}`, sender: d.fromEmail, recipient: d.toEmail, subject: null, receivedAt: new Date().toISOString(), snippet: null, fyi: false, automated: false, bodyText: null, bodyHtml: null, replyToSentEmailId: null, inReplyTo: [], references: [], attachments: [], ...d }); this.pending.push(d.id); }
    async listInbound(recipient: string, since: string | null, _waitSeconds: number) { const ids = this.pending.filter(id => this.inbox.get(id)?.recipient === recipient); this.pending = this.pending.filter(id => !ids.includes(id)); const items = ids.map(id => this.inbox.get(id)!); const last = items.at(-1); return { items, nextSince: last ? `${last.receivedAt}|${last.id}` : since }; }
    async getEmail(id: string) { const d = this.inbox.get(id); if (!d)
        throw new Error(`Unknown fake email ${id}`); return d; }
}
