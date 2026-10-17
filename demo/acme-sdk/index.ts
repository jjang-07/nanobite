import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
export interface ChargeParams {
    amount: number;
    currency: string;
    customer: string;
}
export interface Charge extends ChargeParams {
    id: string;
    idempotencyKey: string;
}
export interface ChargeClient {
    charge(params: ChargeParams, opts?: {
        idempotencyKey?: string;
    }): Promise<Charge>;
}
const retryContext = new AsyncLocalStorage<{
    idempotencyKey: string;
}>();
export class AcmeTimeoutError extends Error {
    constructor() { super('Acme charge timed out after the server may have recorded it'); this.name = 'AcmeTimeoutError'; }
}
export function createClient(options: {
    baseUrl: string;
    timeoutMs: number;
    simulateTimeout?: boolean;
}): ChargeClient {
    const url = new URL(options.baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password)
        throw new Error('The mock Acme SDK requires a loopback HTTP URL');
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
        throw new Error('timeoutMs must be positive');
    const baseUrl = url.origin;
    return { async charge(params, opts = {}) {
            // SDK 2.3 regenerates this key on every charge() call unless the caller preserves it.
            const idempotencyKey = retryContext.getStore()?.idempotencyKey ?? opts.idempotencyKey ?? randomUUID();
            const signal = AbortSignal.timeout(options.timeoutMs);
            let response: Response;
            try {
                response = await fetch(`${baseUrl}/v1/charges`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, ...(options.simulateTimeout ? { 'X-Simulate-Timeout': 'first' } : {}) }, body: JSON.stringify(params), signal, redirect: 'error' });
            }
            catch (error) {
                if (signal.aborted)
                    throw new AcmeTimeoutError();
                throw error;
            }
            if (!response.ok)
                throw new Error(`Acme charge failed: HTTP ${response.status}`);
            return await response.json() as Charge;
        } };
}
export async function withRetry<T>(fn: () => Promise<T>, options: {
    retries?: number;
    preserveIdempotencyKey?: boolean;
} = {}): Promise<T> {
    const retries = options.retries ?? 2;
    if (!Number.isInteger(retries) || retries < 0)
        throw new Error('retries must be a non-negative integer');
    const run = async () => { for (let attempt = 0;; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            if (!(error instanceof AcmeTimeoutError) || attempt >= retries)
                throw error;
        }
    } };
    return options.preserveIdempotencyKey ? retryContext.run({ idempotencyKey: randomUUID() }, run) : run();
}
