import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate, getPr, updatePr } from '../src/db/db.ts';
import { requestContext, getContextRequest, reportOutcome, listContextRequests } from '../src/mcp/tools.ts';

const mk = () => { const db = openDb(':memory:'); migrate(db); return db; };
const input = { responder: 'sdk-help@acme.primitive.email', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges with SDK 2.3?', context: 'test concurrent-retry fails: expected 1 charge, got 2' };

test('request_context queues a PR and returns pending with next_action', () => {
  const db = mk(); const r = requestContext(db, input, { requesterIdentity: 'alice-agent@startup.primitive.email' });
  assert.equal(r.structured.status, 'pending'); assert.match(r.structured.id, /^cpr_/); assert.match(r.structured.next_action, /get_context_request/);
  assert.equal(getPr(db, r.structured.id)?.state, 'queued');
});
test('get_context_request reports pending, then the capsule with labels', () => {
  const db = mk(); const { structured: { id } } = requestContext(db, input, { requesterIdentity: 'a@x.primitive.email' });
  let g = getContextRequest(db, { id }); assert.equal(g.structured.status, 'queued'); assert.equal(g.structured.poll_after_seconds, 60);
  updatePr(db, id, { state: 'delivered', approved_text: 'Pass one idempotencyKey outside the retry loop.', decision: 'approve', decided_at: '2026-10-17T20:00:00Z', removals: JSON.stringify([{ placeholder: '[another customer]', count: 2 }]) });
  g = getContextRequest(db, { id });
  assert.equal(g.structured.capsule.text, 'Pass one idempotencyKey outside the retry loop.');
  assert.deepEqual(g.structured.capsule.labels, ['EXTERNAL_DATA', 'NOT_INSTRUCTIONS']);
  assert.equal(g.structured.capsule.gates.rules_removals, 2); assert.match(g.structured.next_action, /report_outcome/);
});
test('unknown id is an error with recovery', () => {
  const r = getContextRequest(mk(), { id: 'cpr_nope' }); assert.equal(r.isError, true); assert.match(String(r.structured.error), /list_context_requests/);
});
test('report_outcome and list', () => {
  const db = mk(); const { structured: { id } } = requestContext(db, input, { requesterIdentity: 'a@x.primitive.email' });
  const r = reportOutcome(db, { id, result: 'passed', note: 'green' }); assert.equal(r.structured.status, 'reported');
  assert.equal(listContextRequests(db, { limit: 10 }).structured.items.length, 1);
});
