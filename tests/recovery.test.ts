import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { openDb, migrate, getPr, insertPr, updatePr } from '../src/db/db.ts';
import { loadConfig } from '../src/config.ts';
import { loadTranscriptFile } from '../src/indexer/index.ts';
import { seedRules } from '../src/gates/rules.ts';
import { FakeDrafter } from '../src/gates/draft.ts';
import { createLocalClient, listLocalInbox, submitLocalReply } from '../src/primitive/local.ts';
import { requestContext } from '../src/mcp/tools.ts';
import { runCycle, initializeCursor, runWorker } from '../src/pipeline/worker.ts';
import { sendQueuedRequests, pollDeliveries } from '../src/pipeline/requester.ts';
import { createRule, findRule } from '../src/approval/rules-store.ts';
import { setup, queued, incoming } from './helpers.ts';
import { pollInbound, processReceived, pollApprovals } from '../src/pipeline/responder.ts';
function local(path = ':memory:') {
    const db = openDb(path);
    migrate(db);
    const config = loadConfig({});
    loadTranscriptFile(db, config.RESPONDER_IDENTITY, new URL('../demo/fixtures/bob-session.jsonl', import.meta.url).pathname);
    seedRules(db, new URL('../demo/fixtures/rules.sql', import.meta.url).pathname, config.RESPONDER_IDENTITY);
    const deps = { config, drafter: new FakeDrafter(), clientFor: (identity: string) => createLocalClient(db, identity) };
    const request = () => requestContext(db, { responder: config.RESPONDER_IDENTITY, topic: 'acme-sdk/retries', question: 'Why do retries create duplicate charges with SDK 2.3?' }, { requesterIdentity: config.REQUESTER_IDENTITY }).structured.id;
    return { db, deps, config, request };
}
test('approved exact bytes survive a failed capsule send and database restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'contextpr-restart-'));
    const path = join(dir, 'test.db');
    let s = local(path);
    try {
        await initializeCursor(s.db, s.deps);
        const id = s.request();
        await runCycle(s.db, s.deps);
        const exact = 'Use one key.\n  Keep this indentation.';
        submitLocalReply(s.db, { sentEmailId: getPr(s.db, id)!.approval_sent_email_id!, author: s.config.APPROVER_EMAIL, bodyText: `edit\n${exact}` });
        const failing = { ...s.deps, clientFor: (identity: string) => ({ ...s.deps.clientFor(identity), async replyToEmail() { throw new Error('injected send failure'); } }) };
        await pollApprovals(s.db, failing);
        assert.equal(getPr(s.db, id)?.state, 'approved');
        assert.equal(getPr(s.db, id)?.capsule_sent_email_id, null);
        s.db.close();
        s = local(path);
        await runCycle(s.db, s.deps);
        await runCycle(s.db, s.deps);
        assert.equal(getPr(s.db, id)?.state, 'delivered');
        assert.equal(getPr(s.db, id)?.approved_text, exact);
        assert.equal(s.db.prepare("SELECT count(*) n FROM local_mail WHERE purpose='capsule'").get()?.n, 1);
    }
    finally {
        s.db.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
test('auto notification failure preserves shipped delivery and retries exactly once', async () => {
    const s = local();
    await initializeCursor(s.db, s.deps);
    createRule(s.db, s.config.RESPONDER_IDENTITY, s.config.REQUESTER_IDENTITY, 'acme-sdk/retries', s.config.APPROVER_EMAIL, 'prior');
    let fail = true;
    const original = s.deps.clientFor;
    s.deps.clientFor = (identity: string) => { const client = original(identity); return { ...client, async sendMail(input) { if (input.idempotencyKey.includes(':notification:') && fail) {
            fail = false;
            throw new Error('injected notification failure');
        } return client.sendMail(input); } }; };
    const id = s.request();
    await runCycle(s.db, s.deps);
    assert.notEqual(getPr(s.db, id)?.state, 'failed');
    await runCycle(s.db, s.deps);
    assert.equal(getPr(s.db, id)?.state, 'delivered');
    assert.equal(listLocalInbox(s.db, s.config.APPROVER_EMAIL).filter(m => m.purpose === 'notification').length, 1);
    s.db.close();
});
test('a queued revoke prevents a new automatic release in the same cycle', async () => {
    const s = local();
    await initializeCursor(s.db, s.deps);
    createRule(s.db, s.config.RESPONDER_IDENTITY, s.config.REQUESTER_IDENTITY, 'acme-sdk/retries', s.config.APPROVER_EMAIL, 'prior');
    const first = s.request();
    await runCycle(s.db, s.deps);
    const notification = listLocalInbox(s.db, s.config.APPROVER_EMAIL).find(m => m.purpose === 'notification')!;
    submitLocalReply(s.db, { sentEmailId: notification.sentEmailId, author: s.config.APPROVER_EMAIL, bodyText: 'revoke' });
    const second = s.request();
    await runCycle(s.db, s.deps);
    assert.equal(getPr(s.db, first)?.state, 'delivered');
    assert.equal(getPr(s.db, second)?.state, 'awaiting_approval');
    assert.equal(getPr(s.db, second)?.capsule_sent_email_id, null);
    assert.equal(findRule(s.db, s.config.RESPONDER_IDENTITY, s.config.REQUESTER_IDENTITY, 'acme-sdk/retries'), null);
    s.db.close();
});
test('failed transport status never records a capsule as sent; later accepted send recovers', async () => {
    const { db, mail, deps } = setup();
    const id = queued(db);
    mail.deliverInbound(incoming(id));
    await pollInbound(db, deps);
    await processReceived(db, deps);
    mail.deliverReply(getPr(db, id)!.approval_sent_email_id!, { bodyText: 'approve' });
    const original = mail.replyToEmail.bind(mail);
    mail.replyToEmail = async () => ({ sentEmailId: 'bounced', status: 'bounced', deliveryStatus: 'bounced' });
    await pollApprovals(db, deps);
    assert.equal(getPr(db, id)?.capsule_sent_email_id, null);
    mail.replyToEmail = original;
    await runCycle(db, deps);
    assert.ok(getPr(db, id)?.capsule_sent_email_id);
    db.close();
});
test('completed draft retries approval sending without repeating model work', async () => {
    const { db, mail, deps } = setup();
    const id = queued(db);
    mail.deliverInbound(incoming(id));
    await pollInbound(db, deps);
    let calls = 0;
    const draft = deps.drafter.draft.bind(deps.drafter);
    deps.drafter.draft = async (i) => { calls++; return draft(i); };
    const send = mail.sendMail.bind(mail);
    mail.sendMail = async () => { throw new Error('approval unavailable'); };
    await processReceived(db, deps);
    assert.equal(getPr(db, id)?.state, 'drafting');
    mail.sendMail = send;
    await runCycle(db, deps);
    assert.equal(getPr(db, id)?.state, 'awaiting_approval');
    assert.equal(calls, 1);
    db.close();
});
test('approve always remains an audit decision after local delivery', async () => {
    const s = local();
    await initializeCursor(s.db, s.deps);
    const id = s.request();
    await runCycle(s.db, s.deps);
    submitLocalReply(s.db, { sentEmailId: getPr(s.db, id)!.approval_sent_email_id!, author: s.config.APPROVER_EMAIL, bodyText: 'approve always' });
    await runCycle(s.db, s.deps);
    assert.equal(getPr(s.db, id)?.state, 'delivered');
    assert.equal(getPr(s.db, id)?.decision, 'approve_always');
    s.db.close();
});
test('clarification bookkeeping interruption reuses the sent message and its reply', async () => {
    const { db, mail, deps } = setup();
    const id = queued(db);
    mail.deliverInbound(incoming(id));
    await pollInbound(db, deps);
    await processReceived(db, deps);
    mail.deliverReply(getPr(db, id)!.approval_sent_email_id!, { bodyText: 'unsure' });
    db.exec("CREATE TEMP TRIGGER interrupt_clarification BEFORE UPDATE OF approval_sent_email_id ON context_prs BEGIN SELECT RAISE(FAIL, 'injected interruption'); END;");
    await pollApprovals(db, deps);
    const clarification = mail.sent.findIndex(m => m.idempotencyKey.includes(':clarification:')) + 1;
    mail.deliverReply(`sent_${clarification}`, { bodyText: 'approve' });
    db.exec('DROP TRIGGER interrupt_clarification');
    await pollApprovals(db, deps);
    await pollApprovals(db, deps);
    assert.equal(getPr(db, id)?.state, 'approved');
    assert.equal(mail.sent.filter(m => m.idempotencyKey.includes(':clarification:')).length, 1);
    db.close();
});
test('requested row is still polled after reopening its durable database', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'contextpr-requested-'));
    const path = join(dir, 'test.db');
    let s = local(path);
    try {
        await initializeCursor(s.db, s.deps);
        const id = s.request();
        await sendQueuedRequests(s.db, s.deps);
        const sent = getPr(s.db, id)!.request_sent_email_id;
        s.db.close();
        s = local(path);
        const seen: string[] = [];
        const deps = { ...s.deps, clientFor: (identity: string) => ({ ...s.deps.clientFor(identity), async awaitReply(id: string) { seen.push(id); return null; } }) };
        await pollDeliveries(s.db, deps);
        assert.deepEqual(seen, [sent]);
    }
    finally {
        s.db.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
test('two pending requests complete a polling cycle within ten seconds', async () => {
    const { db, mail, deps } = setup();
    for (const id of ['cpr_wait1', 'cpr_wait2']) {
        queued(db, id);
        updatePr(db, id, { state: 'awaiting_approval', approval_sent_email_id: `approval_${id}`, request_sent_email_id: `request_${id}` });
    }
    mail.awaitReply = async (_id, ms) => { await setTimeout(ms); return null; };
    const start = performance.now();
    await runCycle(db, deps);
    assert.ok(performance.now() - start < 10000);
    db.close();
});
test('worker retries cursor initialization without exiting', async () => {
    const { db, mail, deps } = setup();
    const abort = new AbortController();
    let calls = 0;
    mail.listInbound = async () => { calls++; if (calls === 1)
        throw new Error('temporary startup failure'); abort.abort(); return { items: [], nextSince: 'local:0' }; };
    await runWorker({ ...deps, db, signal: abort.signal });
    assert.equal(calls, 2);
    db.close();
});
