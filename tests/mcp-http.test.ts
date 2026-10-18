import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDb, migrate, getPr } from '../src/db/db.ts';
import { startMcpHttp } from '../src/mcp/http.ts';
const TOKEN = 'test-token-0123456789abcdef';
async function rpc(base: string, body: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) });
    const text = await res.text();
    // Streamable HTTP may answer with plain JSON or a one-event SSE stream.
    const json = text.trim().startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').find(l => l.startsWith('data:'))?.slice(5) ?? 'null');
    return { status: res.status, json };
}
test('MCP over HTTP serves the same four tools behind a bearer token', async () => {
    const db = openDb(':memory:'); migrate(db);
    const server = await startMcpHttp(db, { port: 0, token: TOKEN, requesterIdentity: 'yunha-agent@startup.primitive.email' });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
        const auth = { authorization: `Bearer ${TOKEN}` };
        assert.equal((await rpc(base, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401, 'no token');
        assert.equal((await rpc(base, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: 'Bearer wrong-token-0123456789ab' })).status, 401, 'wrong token');
        assert.equal((await rpc(base, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { ...auth, origin: 'https://evil.example' })).status, 403, 'foreign origin');
        const init = await rpc(base, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } }, auth);
        assert.equal(init.status, 200);
        assert.equal(init.json.result.serverInfo.name, 'nanobite');
        const proto = { ...auth, 'mcp-protocol-version': '2025-06-18' };
        const list = await rpc(base, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, proto);
        assert.deepEqual(list.json.result.tools.map((t: any) => t.name).sort(), ['get_context_request', 'list_context_requests', 'report_outcome', 'request_context']);
        const call = await rpc(base, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'request_context', arguments: { responder: 'sdk-help@acme.primitive.email', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges with SDK 2.3?' } } }, proto);
        const out = call.json.result.structuredContent;
        assert.equal(out.status, 'pending');
        assert.match(out.next_action, /get_context_request/);
        assert.equal(getPr(db, out.id)?.requester_identity, 'yunha-agent@startup.primitive.email');
        assert.equal((await fetch(`${base}/other`, { headers: auth })).status, 404);
    }
    finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
        db.close();
    }
});
test('MCP over HTTP refuses to start without a strong token', async () => {
    const db = openDb(':memory:'); migrate(db);
    await assert.rejects(() => startMcpHttp(db, { port: 0, token: 'short', requesterIdentity: 'a@b.co' }), /token/i);
    db.close();
});
import { loadConfig } from '../src/config.ts';
test('HTTP MCP configuration: empty token disables it, weak tokens and port clashes are refused', () => {
    assert.equal(loadConfig({}).MCP_HTTP_TOKEN, '');
    assert.equal(loadConfig({}).MCP_HTTP_PORT, 8788);
    assert.throws(() => loadConfig({ MCP_HTTP_TOKEN: 'short' }), /at least 16/);
    assert.throws(() => loadConfig({ MCP_HTTP_PORT: '8787' }), /different from DASHBOARD_PORT/);
    assert.deepEqual(loadConfig({ MCP_HTTP_ALLOWED_HOSTS: 'a.example, b.example' }).MCP_HTTP_ALLOWED_HOSTS, ['a.example', 'b.example']);
});
test('clients that cannot send headers (ChatGPT) authenticate with the token in the path', async () => {
    const db = openDb(':memory:'); migrate(db);
    const server = await startMcpHttp(db, { port: 0, token: TOKEN, requesterIdentity: 'yunha-agent@startup.primitive.email' });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const at = (path: string) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt', version: '0' } } }) });
    try {
        assert.equal((await at(`/mcp/${TOKEN}`)).status, 200);
        assert.equal((await at('/mcp/wrong-token-0123456789abcdef')).status, 401);
        assert.equal((await at('/mcp/')).status, 401);
        assert.equal((await at(`/other/${TOKEN}`)).status, 404);
    }
    finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
