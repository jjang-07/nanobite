import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPr, listEvents } from '../src/db/db.ts';
import { parseEnvelope } from '../src/envelope.ts';
import { shareableDenialReason } from '../src/gates/approval.ts';
import { loadRules } from '../src/gates/rules.ts';
import { pollInbound, processReceived, pollApprovals, retryableDraftError, DRAFT_RETRY_DELAYS_MS } from '../src/pipeline/responder.ts';
import { sendQueuedRequests } from '../src/pipeline/requester.ts';
import { FakeDrafter } from '../src/gates/draft.ts';
import { setup, queued, incoming, config } from './helpers.ts';
async function received() { const s = setup(); const id = queued(s.db); await sendQueuedRequests(s.db, s.deps); s.mail.deliverInbound(incoming(id)); await pollInbound(s.db, s.deps); return { ...s, id }; }
const draft = 'Pass preserveIdempotencyKey: true to withRetry so every retry reuses one key.';
test('denial reasons that repeat the draft or run long are withheld; protected names are masked', async () => {
    const { db } = await received();
    const rules = loadRules(db, config.RESPONDER_IDENTITY);
    assert.deepEqual(shareableDenialReason(`not yet\n\n${draft}`, draft, rules), { reason: undefined, withheld: true });
    assert.deepEqual(shareableDenialReason(`not yet ${draft.toUpperCase().replace(/ /g, '  ')}`, draft, rules), { reason: undefined, withheld: true });
    assert.deepEqual(shareableDenialReason('x'.repeat(501), draft, rules), { reason: undefined, withheld: true });
    assert.deepEqual(shareableDenialReason('Northwind asked us not to share this yet.', draft, rules), { reason: '[another customer] asked us not to share this yet.', withheld: false });
    assert.deepEqual(shareableDenialReason('Too broad; ask about one version.', draft, rules), { reason: 'Too broad; ask about one version.', withheld: false });
    assert.deepEqual(shareableDenialReason('  ', draft, rules), { reason: undefined, withheld: false });
});
test('a deny reply carrying an unstripped quoted draft never sends the draft to the requester', async () => {
    const { db, mail, deps, id } = await received();
    await processReceived(db, deps);
    const p = getPr(db, id)!;
    mail.deliverReply(p.approval_sent_email_id!, { bodyText: `deny not ready\n\nOriginal message:\n${p.draft_answer}` });
    await pollApprovals(db, deps);
    const denied = getPr(db, id)!;
    assert.equal(denied.state, 'denied');
    assert.equal(denied.decision_reason, null);
    const envelope = parseEnvelope(mail.sent.at(-1)!.bodyText)!;
    assert.equal(envelope.kind, 'denial');
    assert.equal(envelope.payload.reason, 'Declined by approver');
    assert.ok(!mail.sent.at(-1)!.bodyText.includes(p.draft_answer!));
    assert.ok(listEvents(db, id).some(e => e.kind === 'decision' && /reason_withheld/.test(e.detail)));
});
test('only transient model errors are retried', () => {
    for (const status of [408, 429, 500, 529])
        assert.equal(retryableDraftError(Object.assign(new Error('x'), { status })), true);
    for (const status of [400, 401, 403, 404])
        assert.equal(retryableDraftError(Object.assign(new Error('x'), { status })), false);
    assert.equal(retryableDraftError(new Error('draft_failed: response does not match the Draft schema')), true);
    assert.equal(retryableDraftError(new Error('Local Ollama is unavailable. Start the local Ollama server and retry this request.')), true);
    assert.equal(retryableDraftError(new Error('No model provider configured.')), false);
    assert.equal(retryableDraftError(new Error('No installed local model matches qwen3. Choose an installed model.')), false);
    assert.equal(retryableDraftError(new Error('Local Ollama returned HTTP 404. Check that the selected model is installed.')), false);
});
const elapse = (db: Awaited<ReturnType<typeof received>>['db'], id: string) => db.prepare("UPDATE events SET detail=json_set(detail,'$.retry_at',?) WHERE pr_id=? AND kind='draft_retry'").run(new Date(Date.now() - 1000).toISOString(), id);
test('a transient drafting failure waits, retries, then reaches approval without failing the request', async () => {
    const { db, deps, id } = await received();
    let calls = 0;
    const fake = new FakeDrafter();
    const drafter = { async draft(input: Parameters<FakeDrafter['draft']>[0]) { calls++; if (calls === 1) throw Object.assign(new Error('Overloaded'), { status: 529 }); return fake.draft(input); } };
    await processReceived(db, { ...deps, drafter });
    assert.equal(getPr(db, id)!.state, 'drafting');
    assert.equal(listEvents(db, id).filter(e => e.kind === 'draft_retry').length, 1);
    await processReceived(db, { ...deps, drafter });
    assert.equal(calls, 1, 'the retry waits for its backoff');
    elapse(db, id);
    await processReceived(db, { ...deps, drafter });
    assert.equal(calls, 2);
    assert.equal(getPr(db, id)!.state, 'awaiting_approval');
});
test('a permanent drafting error fails at once; repeated transient errors fail after the last retry', async () => {
    const permanent = await received();
    await processReceived(permanent.db, { ...permanent.deps, drafter: { async draft() { throw Object.assign(new Error('invalid x-api-key'), { status: 401 }); } } });
    assert.equal(getPr(permanent.db, permanent.id)!.state, 'failed');
    const flaky = await received();
    const always = { ...flaky.deps, drafter: { async draft() { throw Object.assign(new Error('Overloaded'), { status: 529 }); } } };
    for (let i = 0; i < DRAFT_RETRY_DELAYS_MS.length; i++) {
        await processReceived(flaky.db, always);
        assert.equal(getPr(flaky.db, flaky.id)!.state, 'drafting');
        elapse(flaky.db, flaky.id);
    }
    await processReceived(flaky.db, always);
    assert.equal(getPr(flaky.db, flaky.id)!.state, 'failed');
    assert.equal(getPr(flaky.db, flaky.id)!.decision_reason, 'Overloaded');
});
