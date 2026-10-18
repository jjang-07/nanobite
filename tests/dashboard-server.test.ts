import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb, migrate, insertPr, getPr, listPrs } from '../src/db/db.ts';
import { loadConfig } from '../src/config.ts';
import { createLocalClient, listLocalInbox } from '../src/primitive/local.ts';
import { recordSent } from '../src/pipeline/requester.ts';
import { startDashboard } from '../src/dashboard/server.ts';
import { requestContext } from '../src/mcp/tools.ts';
test('dashboard request and explicit human decision enforce origin, CSRF and message association', async () => {
    const db = openDb(':memory:');
    migrate(db);
    const config = loadConfig({});
    const server = await startDashboard(db, 0, { config });
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const origin = `http://127.0.0.1:${addr.port}`;
    try {
        const page = await fetch(origin);
        assert.equal(page.headers.get('referrer-policy'), 'same-origin');
        // Requests come from agents through the MCP tool, never from the dashboard.
        const id = String(requestContext(db, { responder: config.RESPONDER_IDENTITY, topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges?' }, { requesterIdentity: config.REQUESTER_IDENTITY }).structured.id);
        assert.equal(listPrs(db).length, 1);
        db.prepare("UPDATE context_prs SET state='awaiting_approval',draft_answer='EXACT DRAFT' WHERE id=?").run(id);
        const sent = await createLocalClient(db, config.RESPONDER_IDENTITY).sendMail({ from: config.RESPONDER_IDENTITY, to: config.APPROVER_EMAIL, subject: `[Nanobite ${id}] approval`, bodyText: 'EXACT DRAFT', idempotencyKey: `${id}:approval:1` });
        recordSent(db, sent.sentEmailId, id, 'approval', config.RESPONDER_IDENTITY);
        db.prepare('UPDATE context_prs SET approval_sent_email_id=? WHERE id=?').run(sent.sentEmailId, id);
        const csrf = (await (await fetch(`${origin}/pr/${id}`)).text()).match(/name="csrf"[^>]*value="([^"]+)"/)?.[1];
        assert.ok(csrf, 'the review form on the request page carries the CSRF token');
        const post = (path: string, data: URLSearchParams, o = origin) => fetch(origin + path, { method: 'POST', headers: { origin: o, 'content-type': 'application/x-www-form-urlencoded' }, body: data, redirect: 'manual' });
        const filed = await post('/requests', new URLSearchParams({ csrf, responder: config.RESPONDER_IDENTITY, topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges?' }));
        assert.equal(filed.status, 404, 'the dashboard cannot file requests');
        assert.equal(listPrs(db).length, 1);
        const approve = new URLSearchParams({ csrf, sent_id: '', action: 'approve' });
        assert.equal((await post(`/pr/${id}/reply`, approve, 'http://evil.example')).status, 403, 'foreign origin');
        assert.equal((await post(`/pr/${id}/reply`, new URLSearchParams({ csrf: 'wrong', action: 'approve' }))).status, 403, 'bad CSRF');
        const action = new URLSearchParams({ csrf, sent_id: sent.sentEmailId, action: 'edit', replacement: 'Exact replacement\n  indent' });
        assert.equal((await post('/pr/cpr_wrong/reply', action)).status, 400);
        assert.equal(listLocalInbox(db, config.APPROVER_EMAIL)[0].reply, null);
        assert.equal((await post(`/pr/${id}/reply`, action)).status, 303);
        assert.equal(listLocalInbox(db, config.APPROVER_EMAIL)[0].reply?.bodyText, 'edit\nExact replacement\n  indent');
        assert.equal(getPr(db, id)?.state, 'awaiting_approval');
        assert.equal((await fetch(origin + '/pr/nope')).status, 404);
    }
    finally {
        server.close();
        await once(server, 'close');
        db.close();
    }
});
