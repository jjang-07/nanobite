import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTunnelUrl, connectorUrl } from '../scripts/chatgpt-tunnel.ts';
test('the tunnel URL is read from cloudflared output and turned into the ChatGPT connector URL', () => {
    assert.equal(parseTunnelUrl('2026-10-18T01:00:00Z INF |  https://brave-otter-sample.trycloudflare.com  |'), 'https://brave-otter-sample.trycloudflare.com');
    assert.equal(parseTunnelUrl('INF Requesting new quick Tunnel on trycloudflare.com...'), null);
    assert.equal(connectorUrl('https://x.trycloudflare.com', 'tok/en'), 'https://x.trycloudflare.com/mcp/tok%2Fen');
});
