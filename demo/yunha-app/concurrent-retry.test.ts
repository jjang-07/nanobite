import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheckoutAttempt } from './checkout-attempt.ts';
test('a timed-out charge followed by a retry creates exactly one charge', async () => {
    const baseUrl = process.env.ACME_BASE_URL ?? 'http://127.0.0.1:8791';
    const result = await runCheckoutAttempt(baseUrl);
    assert.deepEqual(result.attempts.map(attempt => attempt.result), ['timed_out', 'returned']);
    assert.equal(result.chargeCount, 1, `expected 1 charge, got ${result.chargeCount}`);
    assert.equal(result.totalCharged, 4200);
    assert.equal(result.charges[0]?.id, result.attempts[1]?.chargeId);
    assert.equal(result.success, true);
});
