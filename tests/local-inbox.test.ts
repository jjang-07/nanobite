import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, migrate } from '../src/db/db.ts';
import { createLocalClient, listLocalInbox, submitLocalReply } from '../src/primitive/local.ts';
import { loadConfig } from '../src/config.ts';
import { clientForIdentity } from '../src/primitive/registry.ts';
const yunha = 'yunha@startup.local', acme = 'sdk-help@acme.local', tk = 'tk@acme.local';
const approval = { from: acme, to: tk, subject: '[ContextPR cpr_test] Approve?', bodyText: 'Exact draft\n  keep spaces', idempotencyKey: 'cpr_test:approval:1' };
test('local mailbox routes requests and replies without network or automatic approval', async () => {
    const db = openDb(':memory:');
    migrate(db);
    try {
        const a = createLocalClient(db, yunha), b = createLocalClient(db, acme);
        const baseline = await b.listInbound(acme, null, 0);
        assert.equal(baseline.nextSince, 'local:0');
        const sent = await a.sendMail({ from: yunha, to: acme, subject: 'question', bodyText: 'question body', idempotencyKey: 'cpr_test:request:1' });
        const incoming = await b.listInbound(acme, baseline.nextSince, 0);
        assert.equal(incoming.items.length, 1);
        assert.equal((await b.getEmail(incoming.items[0].id)).bodyText, 'question body');
        await b.replyToEmail(incoming.items[0].id, { bodyText: 'answer exact\n  line', idempotencyKey: 'cpr_test:capsule:1' });
        const reply = await a.awaitReply(sent.sentEmailId, 0);
        assert.equal(reply?.bodyText, 'answer exact\n  line');
        assert.equal(reply?.senderVerified, true);
        const pending = await b.sendMail(approval);
        assert.equal(await b.awaitReply(pending.sentEmailId, 0), null);
        assert.equal((await b.listInbound(acme, incoming.nextSince, 0)).items.length, 0);
        await assert.rejects(() => a.sendMail({ ...approval, idempotencyKey: 'wrong-sender' }), /identity/i);
        await assert.rejects(() => a.getEmail(incoming.items[0].id), /identity|recipient|not found/i);
    }
    finally {
        db.close();
    }
});
test('human replies and duplicate sends survive database restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'contextpr-local-'));
    const path = join(dir, 'mail.db');
    let db = openDb(path);
    migrate(db);
    try {
        let client = createLocalClient(db, acme);
        const sent = await client.sendMail(approval);
        assert.equal((await client.sendMail(approval)).sentEmailId, sent.sentEmailId);
        let inbox = listLocalInbox(db, tk);
        assert.equal(inbox.length, 1);
        assert.equal(inbox[0].bodyText, approval.bodyText);
        assert.equal(inbox[0].purpose, 'approval');
        assert.equal(inbox[0].reply, null);
        assert.throws(() => submitLocalReply(db, { sentEmailId: sent.sentEmailId, author: yunha, bodyText: 'approve' }), /recipient|author/i);
        const exact = 'edit\nApproved replacement\n  keep indent';
        const first = submitLocalReply(db, { sentEmailId: sent.sentEmailId, author: tk, bodyText: exact });
        const duplicate = submitLocalReply(db, { sentEmailId: sent.sentEmailId, author: tk, bodyText: exact });
        assert.equal(duplicate.sentEmailId, first.sentEmailId);
        assert.throws(() => submitLocalReply(db, { sentEmailId: sent.sentEmailId, author: tk, bodyText: 'different' }), /idempotency|already/i);
        db.close();
        db = openDb(path);
        migrate(db);
        client = createLocalClient(db, acme);
        assert.equal((await client.sendMail(approval)).sentEmailId, sent.sentEmailId);
        const reply = await client.awaitReply(sent.sentEmailId, 0);
        assert.equal(reply?.bodyText, exact);
        assert.equal(reply?.fromEmail, tk);
        assert.equal(reply?.toEmail, acme);
        assert.equal(reply?.senderVerified, true);
        inbox = listLocalInbox(db, tk);
        assert.equal(inbox.length, 1);
        assert.equal(inbox[0].reply?.bodyText, exact);
    }
    finally {
        db.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
test('configuration defaults to local mail and Ollama; paid providers require explicit keys', () => {
    const c = loadConfig({});
    assert.equal(c.MAIL_PROVIDER, 'local');
    assert.equal(c.MODEL_PROVIDER, 'ollama');
    assert.ok(c.REQUESTER_IDENTITY);
    assert.equal(c.PRIMITIVE_API_KEY, '');
    assert.throws(() => loadConfig({ MAIL_PROVIDER: 'primitive' }), /PRIMITIVE_API_KEY/);
    assert.throws(() => loadConfig({ MODEL_PROVIDER: 'anthropic' }), /ANTHROPIC_API_KEY/);
    assert.throws(() => loadConfig({ MAIL_PROVIDER: 'wrong' }), /MAIL_PROVIDER/);
    assert.throws(() => loadConfig({ OLLAMA_BASE_URL: 'https://remote.example.com' }), /local|loopback/i);
    const db = openDb(':memory:');
    migrate(db);
    try {
        assert.ok(clientForIdentity(c.REQUESTER_IDENTITY, c, db));
        assert.throws(() => clientForIdentity(c.REQUESTER_IDENTITY, c), /database/i);
    }
    finally {
        db.close();
    }
});
