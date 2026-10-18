import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const port = Number(process.env.PINECART_PORT ?? 8792);
let busy = false;
const server = createServer(async (request, response) => {
    const json = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(body));
    };
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host ?? '')) return json(403, { error: 'Host not allowed' });
    if (request.method === 'GET' && request.url === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return response.end(readFileSync(new URL('./checkout.html', import.meta.url)));
    }
    if (request.method !== 'POST' || request.url !== '/api/checkout') return json(404, { error: 'Not found' });
    if (request.headers.origin !== `http://${request.headers.host}`) return json(403, { error: 'Same-origin checkout required' });
    if (busy) return json(409, { error: 'A sandbox payment is already running. Try again in a moment.' });
    busy = true;
    try {
        // A fresh process imports charge.ts on every payment, so an applied fix needs no restart.
        const { stdout } = await run(process.execPath, [fileURLToPath(new URL('./checkout-attempt.ts', import.meta.url))], { timeout: 15000, maxBuffer: 65536 });
        const result = JSON.parse(stdout);
        json(result.success ? 200 : 409, result);
    } catch {
        json(503, { error: 'The sandbox payment service is unavailable. Check that the mock Acme API is running.' });
    } finally { busy = false; }
});
server.listen(port, '127.0.0.1', () => console.log(`Pinecart checkout: http://127.0.0.1:${port}`));
