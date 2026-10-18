// Use Nanobite from ChatGPT.
//   npm run chatgpt
// ChatGPT only connects to remote MCP servers over HTTPS, from OpenAI's servers, and its connectors
// cannot send a token header. This opens a Cloudflare quick tunnel to the local MCP endpoint and prints
// a secret connector URL (the token is in the path). Keep it running, and keep `npm start` running.
// Anyone with the URL can file requests, so share it with no one; Ctrl-C closes the tunnel.
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export function parseTunnelUrl(line: string): string | null {
    return line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null;
}
export function connectorUrl(tunnel: string, token: string): string {
    return `${tunnel}/mcp/${encodeURIComponent(token)}`;
}
async function answers(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'nanobite-tunnel-check', version: '0' } } }), signal: AbortSignal.timeout(8000) });
        return res.status === 200 && (await res.text()).includes('nanobite');
    }
    catch {
        return false;
    }
}
async function main() {
    const port = Number(process.env.MCP_HTTP_PORT ?? 8788), token = process.env.MCP_HTTP_TOKEN?.trim() ?? '';
    if (token.length < 16) {
        console.error('MCP_HTTP_TOKEN is not set in .env. Generate one with `openssl rand -hex 24`, then run `npm start`.');
        process.exit(1);
    }
    if (!(await answers(`http://127.0.0.1:${port}/mcp/${encodeURIComponent(token)}`))) {
        console.error(`The Nanobite worker is not answering on port ${port}. Run \`npm start\` first.`);
        process.exit(1);
    }
    // Forward with the local Host header so the endpoint's Host check still applies.
    const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`, '--http-host-header', `127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    tunnel.on('error', e => { console.error(`Could not start cloudflared: ${e.message}. Install it with \`brew install cloudflared\`.`); process.exit(1); });
    const stop = () => { tunnel.kill('SIGTERM'); process.exit(0); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    let announced = false;
    const watch = async (chunk: Buffer) => {
        const found = parseTunnelUrl(chunk.toString());
        if (!found || announced)
            return;
        announced = true;
        const url = connectorUrl(found, token);
        // A brand-new tunnel hostname takes a few seconds to exist in public DNS. Checking too early makes
        // macOS cache "not found", so wait first, then retry for up to three minutes (seen live 2026-10-17).
        console.log('Tunnel opened. Waiting for its address to come online…');
        await new Promise(r => setTimeout(r, 15000));
        let ok = false;
        for (let i = 0; i < 55 && !(ok = await answers(url)); i++)
            await new Promise(r => setTimeout(r, 3000));
        console.log(`\nChatGPT connector URL (secret, do not share):\n\n  ${url}\n`);
        if (!ok)
            console.log('This computer could not reach it yet; it often starts answering a minute later. ChatGPT may already reach it.');
        console.log('In ChatGPT: Settings > Apps & Connectors > Advanced > turn on Developer mode, then Create a connector.');
        console.log('Name: Nanobite. MCP server URL: the URL above. Authentication: No authentication. Trust it and create.');
        console.log('In a chat, choose Developer mode, enable Nanobite, and ask it to use request_context.');
        console.log('\nThe URL changes each time this runs. Keep this running and keep `npm start` running. Ctrl-C closes the tunnel.');
    };
    tunnel.stdout.on('data', watch);
    tunnel.stderr.on('data', watch);
    tunnel.on('exit', code => { console.error(`cloudflared exited (${code}).`); process.exit(code ?? 1); });
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
    await main();
