import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate, insertPr, getPr, updatePr, listPrs, addEvent, listEvents } from '../src/db/db.ts';
test('migrate creates tables and round-trips a PR', () => {
    const db = openDb(':memory:');
    migrate(db);
    insertPr(db, { id: 'cpr_test1', state: 'queued', requester_identity: 'a@x.primitive.email', responder_identity: 'b@y.primitive.email',
        topic: 'acme-sdk/retries', question: 'Why do I get duplicate charges on retry?', on_behalf_of: 'Alice', context_hint: null });
    const pr = getPr(db, 'cpr_test1');
    assert.equal(pr?.state, 'queued');
    updatePr(db, 'cpr_test1', { state: 'requested', request_sent_email_id: 'sent_1' });
    assert.equal(getPr(db, 'cpr_test1')?.request_sent_email_id, 'sent_1');
    addEvent(db, 'cpr_test1', 'created', { by: 'test' });
    assert.equal(listEvents(db, 'cpr_test1').length, 1);
    assert.equal(listPrs(db, { state: 'requested' }).length, 1);
    assert.equal(getPr(db, 'nope'), null);
});
