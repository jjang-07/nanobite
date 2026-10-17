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
    assert.equal(r.decision, 'edit');
    assert.equal(r.text, 'Upgrade to 2.4.0 and call withRetry(fn, { preserveIdempotencyKey: true }).');
});
test('empty edit and gibberish are unrecognized', () => { assert.equal(parseDecision('edit').decision, 'unrecognized'); assert.equal(parseDecision('what is this').decision, 'unrecognized'); assert.equal(parseDecision(null).decision, 'unrecognized'); });
test('outlook style quoting', () => { assert.equal(parseDecision('approve\n\n-----Original Message-----\nFrom: x\nSent: y').decision, 'approve'); });
test('local edits preserve every replacement byte, including Markdown quotes and apparent email signatures', () => {
    const replacement = '  \r\n> Do not retry without one key.\r\n\twithRetry(fn);  \r\nOn Tuesday wrote:\r\n-- \r\nSent from my local editor\r\n  ';
    assert.deepEqual(parseDecision('\n EDIT\r\n' + replacement, { local: true }), { decision: 'edit', text: replacement });
});
test('local edits reject only empty or whitespace-only replacements', () => {
    for (const body of ['edit', 'edit\n', 'edit\r\n \t\r\n'])
        assert.equal(parseDecision(body, { local: true }).decision, 'unrecognized');
});
test('approvals and revocations require one complete command with no extra unquoted content', () => {
    const ambiguous = ['approve but do not send', 'approve always except this topic', 'approved with changes', 'yes if Bob agrees', 'revoke later', 'approve\nDo not include v2.5.', 'approve always\nOnly for today.', 'revoke\nNot yet.', 'approve\napprove', 'edit please\nreplacement'];
    for (const body of ambiguous)
        for (const options of [{}, { local: true }])
            assert.equal(parseDecision(body, options).decision, 'unrecognized', JSON.stringify({ body, options }));
    assert.equal(parseDecision('approve\n> do not send', { local: true }).decision, 'unrecognized');
    assert.equal(parseDecision('  APPROVE!  \r\n\t', { local: true }).decision, 'approve');
});
