import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { timingSafeEqual, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createNanobiteMcpServer } from './register.ts';
export interface McpHttpOptions {
    port: number;
    token: string;
    requesterIdentity: string;
    /** Loopback by default. Expose remotely only behind a tunnel or reverse proxy that keeps the bearer token. */
    host?: string;
    /** Extra Host header values to accept, e.g. a tunnel hostname. */
    allowedHosts?: string[];
}
const digest = (s: string) => createHash('sha256').update(s).digest();
function plain(res: ServerResponse, status: number, message: string, extra: Record<string, string> = {}) {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...extra });
    res.end(message);
}
/**
 * Streamable HTTP endpoint at /mcp serving the same tools as the stdio server. Stateless: the SDK
 * builds a fresh McpServer per request, so any number of agents can connect. Every request needs
 * `Authorization: Bearer <token>`; Host and Origin are checked to block DNS rebinding.
 */
export async function startMcpHttp(db: DatabaseSync, options: McpHttpOptions): Promise<Server> {
    if (options.token.length < 16)
        throw new Error('MCP_HTTP_TOKEN must be at least 16 characters');
    const expected = digest(options.token);
    const handler = createMcpHandler(() => createNanobiteMcpServer(db, options.requesterIdentity));
    const host = options.host ?? '127.0.0.1';
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
            const address = server.address(), port = address && typeof address !== 'string' ? address.port : options.port;
            const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, ...(options.allowedHosts ?? [])]);
            const hostHeader = req.headers.host ?? '';
            if (!allowed.has(hostHeader))
                return plain(res, 403, 'Host not allowed');
            const origin = req.headers.origin;
            if (origin && !allowed.has(origin.replace(/^https?:\/\//, '')))
                return plain(res, 403, 'Origin not allowed');
            const url = new URL(req.url ?? '/', `http://${hostHeader}`);
            // ChatGPT connectors cannot send headers, so /mcp/<token> is accepted as well as a bearer header.
            const pathToken = url.pathname.startsWith('/mcp/') ? decodeURIComponent(url.pathname.slice('/mcp/'.length)) : null;
            if (url.pathname !== '/mcp' && pathToken === null)
                return plain(res, 404, 'Not found. The MCP endpoint is /mcp.');
            const supplied = pathToken ?? /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? '';
            if (!timingSafeEqual(digest(supplied), expected))
                return plain(res, 401, 'Missing or invalid token', { 'www-authenticate': 'Bearer' });
            url.pathname = '/mcp'; // the token never travels past this check
            const chunks: Buffer[] = [];
            for await (const chunk of req)
                chunks.push(chunk as Buffer);
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers))
                if (value !== undefined)
                    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
            const body = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks);
            const response = await handler.fetch(new Request(url, { method: req.method, headers, body }));
            res.writeHead(response.status, Object.fromEntries(response.headers));
            if (!response.body)
                return res.end();
            Readable.fromWeb(response.body as any).pipe(res);
        }
        catch (e) {
            if (!res.headersSent)
                plain(res, 500, e instanceof Error ? e.message : 'MCP request failed');
            else
                res.end();
        }
    });
    server.listen(options.port, host);
    await once(server, 'listening');
    return server;
}
