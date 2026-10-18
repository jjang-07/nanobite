import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, incoming, config } from './helpers.ts';
import { listPrs } from '../src/db/db.ts';
import { initializeCursor } from '../src/pipeline/worker.ts';
import { pollInbound } from '../src/pipeline/responder.ts';
// Primitive compares cursors at microsecond precision but returns millisecond timestamps,
// so a cursor built from the newest email's own timestamp returns that email again (verified live 2026-10-17).
test('a worker started on an existing inbox never replays the newest old request', async () => {
    const { db, mail, deps } = setup();
    mail.deliverInbound(incoming('cpr_oldrun'));
    const old = await mail.getEmail('in_cpr_oldrun');
    mail.listInbound = async (_recipient, since) => ({ items: [old], nextSince: since ?? `${old.receivedAt}|${old.id}` });
    await initializeCursor(db, deps);
    await pollInbound(db, deps);
    assert.equal(listPrs(db).length, 0, 'an email that predates this worker must not become a Nanobite request');
    assert.equal(mail.sent.length, 0, 'no approval email may be sent for a replayed request');
    assert.ok(db.prepare('SELECT 1 FROM inbound_seen WHERE email_id=? AND identity=?').get('in_cpr_oldrun', config.RESPONDER_IDENTITY));
});
