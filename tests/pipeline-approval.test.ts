import { decisionReplyBody } from '../src/gates/decision-reply.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, queued, incoming, config } from './helpers.ts';
import { getPr } from '../src/db/db.ts';
import { parseEnvelope } from '../src/envelope.ts';
import { sendQueuedRequests, pollDeliveries } from '../src/pipeline/requester.ts';
import { pollInbound, processReceived, pollApprovals } from '../src/pipeline/responder.ts';
export async function received() { const s = setup(); const id = queued(s.db); await sendQueuedRequests(s.db, s.deps); s.mail.deliverInbound(incoming(id)); await pollInbound(s.db, s.deps); return { ...s, id }; }
test('approval round trip transports exact approved words through mail', async () => { const { db, mail, deps, id } = await received(); await processReceived(db, deps); const p = getPr(db, id)!; assert.equal(p.state, 'awaiting_approval'); assert.match(mail.sent[1].bodyText, /DRAFT ANSWER/); assert.ok(mail.sent[1].bodyText.includes(p.draft_answer!)); for (const command of ['approve', 'approve always', 'deny', 'edit'])
    assert.ok(mail.sent[1].bodyText.includes(command)); mail.deliverReply(p.approval_sent_email_id!, { bodyText: 'approve', fromEmail: config.APPROVER_EMAIL }); await pollApprovals(db, deps); assert.equal(getPr(db, id)?.state, 'approved'); const capsule = mail.sent.at(-1)!; assert.equal(capsule.inReplyTo, `in_${id}`); assert.equal(parseEnvelope(capsule.bodyText)?.payload.text, p.draft_answer); assert.equal(db.prepare("SELECT count(*) n FROM sent_emails WHERE purpose='capsule'").get()?.n, 1); mail.deliverReply(p.request_sent_email_id!, { bodyText: capsule.bodyText }); await pollDeliveries(db, deps); assert.equal(getPr(db, id)?.state, 'delivered'); assert.ok(getPr(db, id)?.capsule_inbound_email_id); });
for (const [body, state, text] of [['deny because reasons', 'denied', null], ['edit\nNEW TEXT', 'approved', 'NEW TEXT']] as const)
    test(body, async () => { const { db, mail, deps, id } = await received(); await processReceived(db, deps); mail.deliverReply(getPr(db, id)!.approval_sent_email_id!, { bodyText: body }); await pollApprovals(db, deps); assert.equal(getPr(db, id)?.state, state); if (text)
        assert.equal(getPr(db, id)?.approved_text, text);
    else {
        assert.equal(getPr(db, id)?.decision_reason, 'because reasons');
        assert.equal(parseEnvelope(mail.sent.at(-1)!.bodyText)?.kind, 'denial');
    } });
test('unrecognized reply changes the awaited email to clarification', async () => { const { db, mail, deps, id } = await received(); await processReceived(db, deps); const sent = getPr(db, id)!.approval_sent_email_id!; mail.deliverReply(sent, { bodyText: 'what is this' }); await pollApprovals(db, deps); assert.equal(getPr(db, id)?.state, 'awaiting_approval'); assert.notEqual(getPr(db, id)?.approval_sent_email_id, sent); assert.match(mail.sent.at(-1)!.bodyText, /could not read/); });
test('two approvals both polled once; unverified replies cannot release', async () => { const { db, mail, deps, id } = await received(); queued(db, 'cpr_test2'); await sendQueuedRequests(db, deps); mail.deliverInbound(incoming('cpr_test2')); await pollInbound(db, deps); await processReceived(db, deps); const a = getPr(db, id)!.approval_sent_email_id!, b = getPr(db, 'cpr_test2')!.approval_sent_email_id!; mail.deliverReply(a, { bodyText: 'approve', senderVerified: false }); await pollApprovals(db, deps); assert.deepEqual(mail.awaitCalls.map(c => c.id).sort(), [a, b].sort()); assert.equal(getPr(db, id)?.state, 'awaiting_approval'); });
import { trustedReply as trusted } from '../src/pipeline/responder.ts';
test('trustedReply compares bare addresses case-insensitively, even with display names', () => {
    const r = { id: 'in_1', threadId: null, replyToSentEmailId: 'sent_1', fromEmail: 'TK Example <TK@Example.com>', toEmail: 'sdk-help@acme.primitive.email', subject: null, bodyText: 'approve', receivedAt: null, fyi: false, senderVerified: true };
    assert.equal(trusted(r, 'sent_1', 'tk@example.com', 'sdk-help@acme.primitive.email'), true);
    assert.equal(trusted({ ...r, fromEmail: 'Mallory <mallory@evil.example>' }, 'sent_1', 'tk@example.com', 'sdk-help@acme.primitive.email'), false);
    assert.equal(trusted({ ...r, fromEmail: '"tk@example.com" <mallory@evil.example>' }, 'sent_1', 'tk@example.com', 'sdk-help@acme.primitive.email'), false);
    assert.equal(trusted({ ...r, senderVerified: false }, 'sent_1', 'tk@example.com', 'sdk-help@acme.primitive.email'), false);
});

for (const path of ['threaded', 'button'] as const)
    for (const command of ['approve', 'edit', 'deny'] as const)
        test(`${path} ${command} records the reason separately from any shared answer`, async () => {
            const s = await received();
            try {
                const deps = { ...s.deps, config: { ...s.deps.config, MAIL_PROVIDER: 'primitive' as const } };
                await processReceived(s.db, deps);
                const p = getPr(s.db, s.id)!;
                const reason = 'Checked the fix and removed an internal detail.';
                const answer = 'Reuse one payment key across retries.';
                const body = decisionReplyBody(command, answer).replace('Decision reason (optional):', `Decision reason (optional):\n${reason}`);
                if (path === 'threaded') {
                    s.mail.deliverReply(p.approval_sent_email_id!, { bodyText: body, fromEmail: config.APPROVER_EMAIL });
                    await pollApprovals(s.db, deps);
                }
                else {
                    s.mail.deliverInbound({ id: 'fresh_reason', fromEmail: config.APPROVER_EMAIL, toEmail: config.RESPONDER_IDENTITY, subject: `Re: [Nanobite ${s.id}] Approve answer`, bodyText: body, dmarcPass: true });
                    await pollInbound(s.db, deps);
                }
                const saved = getPr(s.db, s.id)!;
                assert.equal(saved.decision, command);
                assert.equal(saved.decision_reason, reason);
                const envelope = parseEnvelope(s.mail.sent.at(-1)!.bodyText)!;
                if (command === 'deny') {
                    assert.equal(saved.state, 'denied');
                    assert.equal(saved.approved_text, null);
                    assert.equal(envelope.kind, 'denial');
                    assert.equal(envelope.payload.reason, reason);
                }
                else {
                    const exact = command === 'edit' ? answer : p.draft_answer;
                    assert.equal(saved.state, 'approved');
                    assert.equal(saved.approved_text, exact);
                    assert.equal(envelope.payload.text, exact);
                    assert.ok(!JSON.stringify(envelope.payload).includes(reason), 'review note is not in the capsule');
                }
            }
            finally { s.db.close(); }
        });
