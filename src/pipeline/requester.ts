import type { DatabaseSync } from 'node:sqlite';
import { listPrs, updatePr, addEvent } from '../db/db.ts';
import { requestContext } from '../mcp/tools.ts';
import { encodeEnvelope, parseEnvelope } from '../envelope.ts';
import { nowIso } from '../ids.ts';
import type { Deps } from './worker.ts';
import type { SendResult } from '../primitive/client.ts';
export function assertSendAccepted(r: SendResult) {
    const failed = new Set(['bounced', 'gate_denied', 'agent_failed', 'canceled', 'cancelled', 'failed', 'rejected', 'denied']);
    if (!r.sentEmailId || failed.has(r.status) || failed.has(r.deliveryStatus ?? ''))
        throw new Error(`Transport did not accept this message (${r.status}/${r.deliveryStatus ?? 'unknown'}). Check the provider before retrying.`);
}
export const createRequest = requestContext;
export function recordSent(db: DatabaseSync, id: string, prId: string, purpose: string, identity: string, handled = 0) { db.prepare('INSERT OR IGNORE INTO sent_emails(sent_email_id,pr_id,purpose,identity,handled,created_at) VALUES(?,?,?,?,?,?)').run(id, prId, purpose, identity, handled, nowIso()); }
export function recordError(db: DatabaseSync, id: string, e: unknown) { const message = e instanceof Error ? e.message : 'Unknown worker error'; addEvent(db, id, 'error', { message }); console.error(`ContextPR ${id}: ${message}`); }
export async function sendQueuedRequests(db: DatabaseSync, deps: Deps) {
    for (const p of listPrs(db, { state: 'queued' })) {
        try {
            const r = await deps.clientFor(p.requester_identity).sendMail({ from: p.requester_identity, to: p.responder_identity, subject: `[ContextPR ${p.id}] ${p.topic}`, bodyText: `From ${p.requester_identity}, for ${p.on_behalf_of ?? 'an engineer'}\nTopic: ${p.topic}\n${p.question}\n${p.context_hint ?? ''}\n\n` + encodeEnvelope('request', { v: 1, id: p.id, topic: p.topic, question: p.question, context: p.context_hint, requester_identity: p.requester_identity, on_behalf_of: p.on_behalf_of }), idempotencyKey: `${p.id}:request:1` });
            assertSendAccepted(r);
            recordSent(db, r.sentEmailId, p.id, 'request', p.requester_identity);
            updatePr(db, p.id, { state: 'requested', request_sent_email_id: r.sentEmailId });
            addEvent(db, p.id, 'request_sent', { sent_email_id: r.sentEmailId });
        }
        catch (e) {
            recordError(db, p.id, e);
        }
    }
}
import { trustedReply } from './responder.ts';
export async function pollDeliveries(db: DatabaseSync, deps: Deps) {
    await Promise.all(listPrs(db, { limit: 1000 }).filter(p => p.request_sent_email_id && ['requested', 'received', 'drafting', 'awaiting_approval', 'approved'].includes(p.state)).map(async (p) => {
        try {
            const id = p.request_sent_email_id!;
            const r = await deps.clientFor(p.requester_identity).awaitReply(id, 2000);
            if (!r || !trustedReply(r, id, p.responder_identity, p.requester_identity))
                return;
            const env = parseEnvelope(r.bodyText);
            if (!env || env.payload.id !== p.id)
                return;
            const e = env.payload;
            if (env.kind === 'capsule' && typeof e.text === 'string' && typeof e.approved_at === 'string' && ['approved', 'edited', 'auto_merged'].includes(e.decision) && e.gates?.minimized === true) {
                updatePr(db, p.id, { state: 'delivered', approved_text: e.text, decision: e.decision === 'auto_merged' ? 'auto' : e.decision === 'edited' ? 'edit' : p.decision === 'approve_always' ? 'approve_always' : 'approve', decided_at: e.approved_at, capsule_inbound_email_id: r.id });
                addEvent(db, p.id, 'delivered');
            }
            else if (env.kind === 'denial' && typeof e.reason === 'string') {
                updatePr(db, p.id, { state: 'denied', decision_reason: e.reason, capsule_inbound_email_id: r.id });
                addEvent(db, p.id, 'denied');
            }
            else
                return;
            db.prepare('UPDATE sent_emails SET handled=1 WHERE sent_email_id=?').run(id);
        }
        catch (e) {
            recordError(db, p.id, e);
        }
    }));
}
