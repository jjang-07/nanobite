import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb, migrate, insertPr, getPr, listPrs } from '../src/db/db.ts';
import { loadConfig } from '../src/config.ts';
import { createLocalClient, listLocalInbox } from '../src/primitive/local.ts';
import { recordSent } from '../src/pipeline/requester.ts';
import { startDashboard } from '../src/dashboard/server.ts';
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
        const html = await page.text();
        const csrf = html.match(/name="csrf"[^>]*value="([^"]+)"/)?.[1];
        assert.ok(csrf);
        const body = new URLSearchParams({ csrf, responder: config.RESPONDER_IDENTITY, topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges?' });
        const post = (path: string, data: URLSearchParams, o = origin) => fetch(origin + path, { method: 'POST', headers: { origin: o, 'content-type': 'application/x-www-form-urlencoded' }, body: data, redirect: 'manual' });
        assert.equal((await post('/requests', body, 'http://evil.example')).status, 403);
        assert.equal(listPrs(db).length, 0);
        assert.equal((await post('/requests', new URLSearchParams({ ...Object.fromEntries(body), csrf: 'wrong' }))).status, 403);
        const created = await post('/requests', body);
        assert.equal(created.status, 303);
        assert.equal(listPrs(db).length, 1);
        const id = listPrs(db)[0].id;
        db.prepare("UPDATE context_prs SET state='awaiting_approval',draft_answer='EXACT DRAFT' WHERE id=?").run(id);
        const sent = await createLocalClient(db, config.RESPONDER_IDENTITY).sendMail({ from: config.RESPONDER_IDENTITY, to: config.APPROVER_EMAIL, subject: `[Nanobite ${id}] approval`, bodyText: 'EXACT DRAFT', idempotencyKey: `${id}:approval:1` });
        recordSent(db, sent.sentEmailId, id, 'approval', config.RESPONDER_IDENTITY);
        db.prepare('UPDATE context_prs SET approval_sent_email_id=? WHERE id=?').run(sent.sentEmailId, id);
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
