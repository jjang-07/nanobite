import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../acme-sdk/index.ts';
import { chargeCustomer } from './charge.ts';
test('a timed-out charge followed by a retry creates exactly one charge', async () => {
    const baseUrl = process.env.ACME_BASE_URL ?? 'http://127.0.0.1:8791';
    const client = createClient({ baseUrl, timeoutMs: 500, simulateTimeout: true });
    const reset = await fetch(`${baseUrl}/__reset`, { method: 'POST' });
    assert.equal(reset.status, 200);
    await chargeCustomer(client);
    const response = await fetch(`${baseUrl}/v1/charges`);
    assert.equal(response.status, 200);
    const charges = await response.json() as unknown[];
    assert.equal(charges.length, 1, `expected 1 charge, got ${charges.length}`);
});
