import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { listPrs, getPr, listEvents } from '../db/db.ts';
import { renderInbox, renderPr, renderError } from './render.ts';
import { loadConfig } from '../config.ts';
import type { Config } from '../config.ts';
import { requestContext } from '../mcp/tools.ts';
import { listLocalInbox, submitLocalReply } from '../primitive/local.ts';
async function readForm(req: IncomingMessage) { let body = ''; for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 32000)
        throw new Error('Request body exceeds 32 KB');
} return new URLSearchParams(body); }
export async function startDashboard(db: DatabaseSync, port: number, options: {
    config?: Config;
} = {}): Promise<Server> {
    const config = options.config ?? loadConfig(), csrfToken = randomBytes(32).toString('hex');
    const server = createServer(async (req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('x-content-type-options', 'nosniff');
        res.setHeader('referrer-policy', 'same-origin');
        res.setHeader('content-security-policy', "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
        const send = (status: number, text: string) => { res.statusCode = status; res.setHeader('content-type', 'text/html; charset=utf-8'); const titles: Record<number, string> = { 400: 'Unable to complete this request', 403: 'Refresh before continuing', 404: 'Request not found', 405: 'This action is unavailable', 415: 'Use the inbox form' }; res.end(status >= 400 ? renderError(titles[status] ?? 'Something went wrong', text, '/', { config }) : text); };
        try {
            const address = server.address(), actualPort = address && typeof address !== 'string' ? address.port : port;
            const allowedHosts = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
            const host = req.headers.host ?? '';
            if (!allowedHosts.has(host)) {
                send(403, 'Host not allowed');
                return;
            }
            const url = new URL(req.url ?? '/', `http://${host}`);
            if (req.method === 'GET') {
                if (url.pathname === '/') {
                    send(200, renderInbox(listPrs(db, { limit: 500 }), { csrfToken, config }));
                    return;
                }
                const match = url.pathname.match(/^\/pr\/(cpr_[a-z0-9]+)$/);
                const p = match ? getPr(db, match[1]) : null;
                if (!p) {
                    send(404, 'Context PR not found. Return to / for the Inbox.');
                    return;
                }
                const ids = new Set(db.prepare('SELECT sent_email_id FROM sent_emails WHERE pr_id=?').all(p.id).map(r => r.sent_email_id));
                const messages = config.MAIL_PROVIDER === 'local' ? listLocalInbox(db, config.APPROVER_EMAIL).filter(m => ids.has(m.sentEmailId)) : [];
                send(200, renderPr(p, listEvents(db, p.id), { csrfToken, config, messages }));
                return;
            }
            if (req.method !== 'POST') {
                send(405, 'Method not allowed');
                return;
            }
            if (req.headers.origin !== `http://${host}`) {
                send(403, 'Origin not allowed');
                return;
            }
            if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
                send(415, 'Use the local dashboard form');
                return;
            }
            const form = await readForm(req), token = form.get('csrf') ?? '';
            if (token.length !== csrfToken.length || !timingSafeEqual(Buffer.from(token), Buffer.from(csrfToken))) {
                send(403, 'Invalid form token. Refresh the Inbox.');
                return;
            }
            if (url.pathname === '/requests') {
                const r = requestContext(db, { responder: form.get('responder') ?? config.RESPONDER_IDENTITY, topic: form.get('topic') ?? '', question: form.get('question') ?? '', context: form.get('context') ?? undefined, on_behalf_of: form.get('on_behalf_of') ?? undefined }, { requesterIdentity: config.REQUESTER_IDENTITY });
                if (r.isError) {
                    res.setHeader('content-type', 'text/plain; charset=utf-8');
                    send(400, String(r.structured.error));
                    return;
                }
                res.writeHead(303, { location: `/pr/${r.structured.id}` });
                res.end();
                return;
            }
            const match = url.pathname.match(/^\/pr\/(cpr_[a-z0-9]+)\/reply$/);
            if (!match || config.MAIL_PROVIDER !== 'local') {
                send(404, 'Local approval route unavailable');
                return;
            }
            const p = getPr(db, match[1]), sentId = form.get('sent_id') ?? '';
            const sent = db.prepare('SELECT * FROM sent_emails WHERE sent_email_id=? AND pr_id=?').get(sentId, match[1]);
            if (!p || !sent || sent.handled === 1 || !['approval', 'clarification', 'notification'].includes(String(sent.purpose))) {
                send(400, 'This message is not awaiting your reply. Refresh the request.');
                return;
            }
            const action = form.get('action');
            let bodyText: string;
            if (sent.purpose === 'notification') {
                if (action !== 'revoke') {
                    send(400, 'Notification accepts revoke only');
                    return;
                }
                bodyText = 'revoke';
            }
            else {
                if (p.state !== 'awaiting_approval' || p.approval_sent_email_id !== sentId) {
                    send(400, 'Approval is no longer pending');
                    return;
                }
                if (action === 'approve')
                    bodyText = 'approve';
                else if (action === 'approve_always')
                    bodyText = 'approve always';
                else if (action === 'deny')
                    bodyText = `deny ${form.get('reason')?.trim() || 'Declined in local inbox'}`;
                else if (action === 'edit') {
                    const text = form.get('replacement') ?? '';
                    if (!text.trim()) {
                        send(400, 'Enter a replacement answer before approving an edit');
                        return;
                    }
                    bodyText = `edit\n${text}`;
                }
                else {
                    send(400, 'Choose approve, approve always, deny or edit');
                    return;
                }
            }
            submitLocalReply(db, { sentEmailId: sentId, author: config.APPROVER_EMAIL, bodyText });
            res.writeHead(303, { location: `/pr/${p.id}` });
            res.end();
        }
        catch (e) {
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            send(400, e instanceof Error ? e.message : 'Request failed');
        }
    });
    server.listen(port, '127.0.0.1');
    await once(server, 'listening');
    return server;
}
