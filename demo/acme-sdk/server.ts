import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Charge, ChargeParams } from './index.ts';
export function startAcmeServer(port = 8791) {
    const charges = new Map<string, Charge>();
    let timeoutSimulated = false;
    const send = (response: ServerResponse, status: number, body: unknown) => { if (response.destroyed)
        return; response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
    const server = createServer(async (request, response) => {
        try {
            if (request.method === 'GET' && request.url === '/v1/charges') {
                send(response, 200, [...charges.values()]);
                return;
            }
            if (request.method === 'POST' && request.url === '/__reset') {
                charges.clear();
                timeoutSimulated = false;
                send(response, 200, { reset: true });
                return;
            }
            if (request.method !== 'POST' || request.url !== '/v1/charges') {
                send(response, 404, { error: 'not_found' });
                return;
            }
            const key = request.headers['idempotency-key'];
            if (typeof key !== 'string' || !key || key.length > 255) {
                send(response, 400, { error: 'idempotency_key_required' });
                return;
            }
            let body = '';
            for await (const chunk of request) {
                body += chunk.toString();
                if (Buffer.byteLength(body) > 65536) {
                    send(response, 413, { error: 'body_too_large' });
                    return;
                }
            }
            let params: ChargeParams;
            try {
                params = JSON.parse(body);
            }
            catch {
                send(response, 400, { error: 'invalid_json' });
                return;
            }
            if (!params || !Number.isInteger(params.amount) || params.amount <= 0 || typeof params.currency !== 'string' || typeof params.customer !== 'string') {
                send(response, 400, { error: 'invalid_charge' });
                return;
            }
            const existing = charges.get(key);
            if (existing) {
                send(response, 200, existing);
                return;
            }
            const charge: Charge = { id: `ch_${randomUUID()}`, amount: params.amount, currency: params.currency, customer: params.customer, idempotencyKey: key };
            charges.set(key, charge);
            // One network incident per reset: later attempts can succeed even when the buggy SDK changes keys.
            if (request.headers['x-simulate-timeout'] === 'first' && !timeoutSimulated) {
                timeoutSimulated = true;
                setTimeout(() => send(response, 200, charge), 1500);
                return;
            }
            send(response, 200, charge);
        }
        catch {
            send(response, 500, { error: 'mock_server_error' });
        }
    });
    server.listen(port, '127.0.0.1');
    return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const server = startAcmeServer();
    server.on('listening', () => console.error('Mock Acme API: http://127.0.0.1:8791'));
    const stop = () => server.close(() => process.exit(0));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
}
