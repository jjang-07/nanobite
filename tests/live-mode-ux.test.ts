import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate, insertPr, listEvents } from '../src/db/db.ts';
import { recordError } from '../src/pipeline/requester.ts';
import { renderInbox } from '../src/dashboard/render.ts';
import { loadConfig } from '../src/config.ts';
test('a retried identical error is logged once, a different error is logged again', () => {
    const db = openDb(':memory:'); migrate(db);
    insertPr(db, { id: 'cpr_err1', state: 'drafting', requester_identity: 'a@x.primitive.email', responder_identity: 'b@y.primitive.email', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges?' });
    for (let i = 0; i < 5; i++)
        recordError(db, 'cpr_err1', new Error('Primitive 403 recipient_not_allowed'));
    assert.equal(listEvents(db, 'cpr_err1').filter(e => e.kind === 'error').length, 1);
    recordError(db, 'cpr_err1', new Error('Primitive 429 rate_limited'));
    assert.equal(listEvents(db, 'cpr_err1').filter(e => e.kind === 'error').length, 2);
});
test('the Inbox offers the request form in live email mode too', () => {
    const config = loadConfig({ MAIL_PROVIDER: 'primitive', PRIMITIVE_API_KEY: 'test', REQUESTER_IDENTITY: 'yunha-agent@x.primitive.email', RESPONDER_IDENTITY: 'sdk-help@x.primitive.email', APPROVER_EMAIL: 'tk@x.primitive.email' });
    const html = renderInbox([], { csrfToken: 'c'.repeat(64), config });
    assert.match(html, /action="\/requests"/);
    assert.match(html, /name="question"/);
});
