import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecision } from '../src/gates/approval.ts';

const gmail = (first: string) => `${first}\n\nOn Sat, Oct 17, 2026 at 3:02 PM sdk-help@acme.primitive.email wrote:\n> A coding agent asked your agent:\n> "Why…"\n>\n> approve\n\n-- \nSent from my iPhone`;
test('approve through gmail quoting and signature', () => { assert.equal(parseDecision(gmail('approve')).decision, 'approve'); });
test('variants', () => {
  assert.equal(parseDecision('Approve always').decision, 'approve_always');
  assert.equal(parseDecision('LGTM!').decision, 'approve');
  assert.equal(parseDecision('ok').decision, 'approve');
  assert.equal(parseDecision('revoke').decision, 'revoke');
});
test('deny captures the reason', () => { const r = parseDecision('deny this mentions an unreleased version\nalso the customer'); assert.equal(r.decision, 'deny'); assert.match(r.reason!, /unreleased/); });
test('edit captures the replacement text and nothing quoted', () => {
  const r = parseDecision(gmail('edit\nUpgrade to 2.4.0 and call withRetry(fn, { preserveIdempotencyKey: true }).'));
  assert.equal(r.decision, 'edit'); assert.equal(r.text, 'Upgrade to 2.4.0 and call withRetry(fn, { preserveIdempotencyKey: true }).');
});
test('empty edit and gibberish are unrecognized', () => { assert.equal(parseDecision('edit').decision, 'unrecognized'); assert.equal(parseDecision('what is this').decision, 'unrecognized'); assert.equal(parseDecision(null).decision, 'unrecognized'); });
test('outlook style quoting', () => { assert.equal(parseDecision('approve\n\n-----Original Message-----\nFrom: x\nSent: y').decision, 'approve'); });
