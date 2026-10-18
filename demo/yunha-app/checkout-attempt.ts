import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AcmeTimeoutError, createClient } from '../acme-sdk/index.ts';
import type { Charge } from '../acme-sdk/index.ts';
import { chargeCustomer } from './charge.ts';

/** A fresh synthetic payment incident, shared by the browser and regression test. */
export async function runCheckoutAttempt(baseUrl = 'http://127.0.0.1:8791') {
    // Validate loopback before any reset. Only the synthetic Acme ledger is cleared.
    const client = createClient({ baseUrl, timeoutMs: 500, simulateTimeout: true });
    const origin = new URL(baseUrl).origin;
    const reset = await fetch(`${origin}/__reset`, { method: 'POST', signal: AbortSignal.timeout(3000) });
    if (!reset.ok) throw new Error(`Mock reset failed: HTTP ${reset.status}`);
    const attempts: { number: number; result: 'timed_out' | 'returned'; chargeId?: string }[] = [];
    const charge = await chargeCustomer({ async charge(params, options) {
        const number = attempts.length + 1;
        try {
            const result = await client.charge(params, options);
            attempts.push({ number, result: 'returned', chargeId: result.id });
            return result;
        } catch (error) {
            if (error instanceof AcmeTimeoutError) attempts.push({ number, result: 'timed_out' });
            throw error;
        }
    } });
    const response = await fetch(`${origin}/v1/charges`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Mock ledger read failed: HTTP ${response.status}`);
    const charges = await response.json() as Charge[];
    const success = charges.length === 1 && charges[0]?.id === charge.id
        && attempts.length === 2 && attempts[0]?.result === 'timed_out' && attempts[1]?.result === 'returned';
    return { attemptId: `PC-${randomUUID().slice(0, 8).toUpperCase()}`, success, chargeCount: charges.length,
        totalCharged: charges.reduce((total, item) => total + item.amount, 0), attempts, charges,
        message: success ? 'Payment successful. Your order is confirmed.' : `Duplicate-charge check failed: expected 1 charge, got ${charges.length}.` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try { console.log(JSON.stringify(await runCheckoutAttempt(process.env.ACME_BASE_URL))); }
    catch (error) { console.error(error instanceof Error ? error.message : 'Checkout could not complete'); process.exitCode = 1; }
}
