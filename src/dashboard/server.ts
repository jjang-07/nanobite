import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { listPrs, getPr, listEvents } from '../db/db.ts';
import { renderInbox, renderPr, renderError, renderInboxBody, renderPrBody, inboxVersion, prVersion } from './render.ts';
import { loadConfig } from '../config.ts';
import type { Config } from '../config.ts';
import { listLocalInbox, submitLocalReply } from '../primitive/local.ts';
import { renderRules } from './rules.ts';
import type { RulesPageOptions } from './rules.ts';
import { listProtectionRules, saveProtectionRule, setProtectionRuleEnabled } from '../gates/protection-store.ts';
import { listApprovalRules, createManualApprovalRule, revokeScopedRule } from '../approval/rules-store.ts';
import { applyRules, loadRules } from '../gates/rules.ts';
async function readForm(req: IncomingMessage) { let body = ''; for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 32000)
        throw new Error('Request body exceeds 32 KB');
} return new URLSearchParams(body); }
export async function startDashboard(db: DatabaseSync, port: number, options: {
    config?: Config;
} = {}): Promise<Server> {
    const config = options.config ?? loadConfig(), csrfToken = randomBytes(32).toString('hex');
    const rulesPage = (extra: Partial<RulesPageOptions> = {}) => renderRules(listProtectionRules(db, config.RESPONDER_IDENTITY), listApprovalRules(db, config.RESPONDER_IDENTITY), { config, csrfToken, ...extra });
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
                // Live updates: JSON with fresh HTML only when the version changed, polled once a second by the page.
                const live = (version: string, html: () => string) => {
                    res.statusCode = 200;
                    res.setHeader('content-type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify(url.searchParams.get('v') === version ? { version } : { version, html: html() }));
                };
                if (url.pathname === '/rules') {
                    send(200, rulesPage({ notice: url.searchParams.get('notice') ?? undefined }));
                    return;
                }
                if (url.pathname === '/') {
                    send(200, renderInbox(listPrs(db, { limit: 500 }), { csrfToken, config }));
                    return;
                }
                if (url.pathname === '/live') {
                    const prs = listPrs(db, { limit: 500 });
                    live(inboxVersion(prs), () => renderInboxBody(prs, { csrfToken, config }));
                    return;
                }
                const match = url.pathname.match(/^\/pr\/(cpr_[a-z0-9]+)(\/live)?$/);
                const p = match ? getPr(db, match[1]) : null;
                if (!p) {
                    send(404, 'Nanobite request not found. Return to / for the Inbox.');
                    return;
                }
                const ids = new Set(db.prepare('SELECT sent_email_id FROM sent_emails WHERE pr_id=?').all(p.id).map(r => r.sent_email_id));
                const messages = config.MAIL_PROVIDER === 'local' ? listLocalInbox(db, config.APPROVER_EMAIL).filter(m => ids.has(m.sentEmailId)) : [];
                const events = listEvents(db, p.id);
                if (match?.[2]) {
                    live(prVersion(p, events, messages), () => renderPrBody(p, events, { csrfToken, config, messages }));
                    return;
                }
                send(200, renderPr(p, events, { csrfToken, config, messages }));
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
            if (url.pathname.startsWith('/rules/')) {
                const edit = url.pathname.match(/^\/rules\/([1-9]\d{0,9})\/update$/);
                const toggle = url.pathname.match(/^\/rules\/([1-9]\d{0,9})\/toggle$/);
                const revoke = url.pathname.match(/^\/rules\/approval\/(rule_[a-f0-9-]+)\/revoke$/);
                try {
                    const input = { kind: form.get('kind') ?? '', pattern: form.get('pattern') ?? '', placeholder: form.get('placeholder') ?? '', note: form.get('note') ?? '' };
                    let notice = '', anchor = 'custom-rules';
                    if (url.pathname === '/rules/create') {
                        saveProtectionRule(db, config.RESPONDER_IDENTITY, input);
                        notice = 'created';
                    }
                    else if (edit) {
                        saveProtectionRule(db, config.RESPONDER_IDENTITY, input, Number(edit[1]));
                        notice = 'saved';
                    }
                    else if (toggle) {
                        const enabled = form.get('enabled');
                        if (enabled !== '0' && enabled !== '1') throw new Error('Choose Enable or Disable.');
                        setProtectionRuleEnabled(db, config.RESPONDER_IDENTITY, Number(toggle[1]), enabled === '1');
                        notice = 'toggled';
                    }
                    else if (url.pathname === '/rules/preview') {
                        const sample = form.get('sample') ?? '';
                        if (!sample.trim() || sample.length > 8000) throw new Error('Enter sample text, up to 8,000 characters.');
                        const result = applyRules(sample, loadRules(db, config.RESPONDER_IDENTITY));
                        send(200, rulesPage({ preview: { input: sample, text: result.text, count: result.removals.reduce((n, r) => n + r.count, 0) } }));
                        return;
                    }
                    else if (url.pathname === '/rules/approval/create') {
                        createManualApprovalRule(db, config.RESPONDER_IDENTITY, form.get('requester') ?? '', form.get('topic') ?? '', config.APPROVER_EMAIL, form.get('confirmed') === 'yes');
                        notice = 'granted'; anchor = 'approval-rules';
                    }
                    else if (revoke) {
                        revokeScopedRule(db, config.RESPONDER_IDENTITY, revoke[1]);
                        notice = 'revoked'; anchor = 'approval-rules';
                    }
                    else { send(404, 'Rule action not found'); return; }
                    res.writeHead(303, { location: `/rules?notice=${notice}#${anchor}` });
                    res.end();
                }
                catch (error) {
                    res.statusCode = 400;
                    res.end(rulesPage({ error: error instanceof Error ? error.message : 'Could not save the rule.', form: Object.fromEntries(form), editingId: edit ? Number(edit[1]) : undefined }));
                }
                return;
            }
            // Requests come only from agents through MCP; the dashboard never files them.
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
