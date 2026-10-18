import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate, getPr, updatePr } from '../src/db/db.ts';
import { requestContext, getContextRequest, reportOutcome, listContextRequests } from '../src/mcp/tools.ts';
const mk = () => { const db = openDb(':memory:'); migrate(db); return db; };
const input = { responder: 'sdk-help@acme.primitive.email', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges with SDK 2.3?', context: 'test concurrent-retry fails: expected 1 charge, got 2' };
test('request_context queues a PR and returns pending with next_action', () => {
    const db = mk();
    const r = requestContext(db, input, { requesterIdentity: 'yunha-agent@startup.primitive.email' });
    assert.equal(r.structured.status, 'pending');
    assert.match(r.structured.id, /^cpr_/);
    assert.match(r.structured.next_action, /get_context_request/);
    assert.equal(getPr(db, r.structured.id)?.state, 'queued');
});
test('get_context_request reports pending, then the capsule with labels', () => {
    const db = mk();
    const { structured: { id } } = requestContext(db, input, { requesterIdentity: 'a@x.primitive.email' });
    let g = getContextRequest(db, { id });
    assert.equal(g.structured.status, 'queued');
    assert.equal(g.structured.poll_after_seconds, 60);
    updatePr(db, id, { state: 'delivered', approved_text: 'Pass one idempotencyKey outside the retry loop.', decision: 'approve', decided_at: '2026-10-17T20:00:00Z', removals: JSON.stringify([{ placeholder: '[another customer]', count: 2 }]) });
    g = getContextRequest(db, { id });
    assert.equal(g.structured.capsule.text, 'Pass one idempotencyKey outside the retry loop.');
    assert.deepEqual(g.structured.capsule.labels, ['EXTERNAL_DATA', 'NOT_INSTRUCTIONS']);
    assert.equal(g.structured.capsule.gates.rules_removals, 2);
    assert.match(g.structured.next_action, /report_outcome/);
});
test('unknown id is an error with recovery', () => {
    const r = getContextRequest(mk(), { id: 'cpr_nope' });
    assert.equal(r.isError, true);
    assert.match(String(r.structured.error), /list_context_requests/);
});
test('report_outcome and list', () => {
    const db = mk();
    const { structured: { id } } = requestContext(db, input, { requesterIdentity: 'a@x.primitive.email' });
    updatePr(db, id, { state: 'delivered', approved_text: 'fix' });
    const r = reportOutcome(db, { id, result: 'passed', note: 'green' });
    assert.equal(r.structured.status, 'reported');
    assert.equal(listContextRequests(db, { limit: 10 }).structured.items.length, 1);
});
test('every state gives an actionable next step; filters work', () => {
    const db = mk();
    const id = requestContext(db, input, { requesterIdentity: 'a@x.primitive.email' }).structured.id;
    for (const state of ['queued', 'requested', 'received', 'drafting', 'awaiting_approval']) {
        updatePr(db, id, { state });
        const r = getContextRequest(db, { id }).structured;
        assert.equal(r.poll_after_seconds, 60);
        assert.equal(r.next_action, 'Not ready. A human on the responder side has not approved yet. Continue other work and check again after poll_after_seconds.');
    }
    updatePr(db, id, { state: 'approved' });
    assert.match(getContextRequest(db, { id }).structured.next_action, /delivery/);
    updatePr(db, id, { state: 'denied', decision_reason: 'no_sources' });
    assert.match(getContextRequest(db, { id }).structured.next_action, /Reason: no_sources/);
    updatePr(db, id, { state: 'failed', decision_reason: 'model unavailable' });
    assert.match(getContextRequest(db, { id }).structured.next_action, /model unavailable.*new request_context/);
    updatePr(db, id, { state: 'reported' });
    assert.equal(getContextRequest(db, { id }).structured.next_action, 'Nothing further to do for this request.');
    assert.equal(listContextRequests(db, { status: 'queued', limit: 10 }).structured.items.length, 0);
});
test('bad inputs name fields and give recovery; outcome requires delivery and is idempotent', () => {
    const db = mk();
    for (const [field, value] of [['responder', 'bad'], ['topic', 'not valid'], ['question', 'short'], ['context', 'x'.repeat(4001)]]) {
        const r = requestContext(db, { ...input, [field]: value }, { requesterIdentity: 'a@x.primitive.email' });
        assert.equal(r.isError, true);
        assert.match(r.structured.next_action, new RegExp(field));
    }
    assert.equal(getContextRequest(db, { id: 'oops' }).isError, true);
    assert.equal(listContextRequests(db, { limit: 0 }).isError, true);
    const id = requestContext(db, input, { requesterIdentity: 'a@x.primitive.email' }).structured.id;
    assert.equal(reportOutcome(db, { id, result: 'passed' }).isError, true);
    updatePr(db, id, { state: 'delivered', approved_text: 'answer' });
    assert.equal(reportOutcome(db, { id, result: 'nonsense' }).isError, true);
    reportOutcome(db, { id, result: 'passed' });
    reportOutcome(db, { id, result: 'passed' });
    assert.equal(db.prepare("SELECT count(*) n FROM events WHERE kind='outcome'").get()?.n, 1);
});
