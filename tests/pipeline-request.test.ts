import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, queued, incoming, config } from './helpers.ts';
import { getPr, listPrs } from '../src/db/db.ts';
import { parseEnvelope } from '../src/envelope.ts';
import { sendQueuedRequests } from '../src/pipeline/requester.ts';
import { pollInbound } from '../src/pipeline/responder.ts';
test('queued request goes through mail, inbound, durable dedup', async () => { const { db, mail, deps } = setup(); const id = queued(db); await sendQueuedRequests(db, deps); const p = getPr(db, id)!; assert.equal(p.state, 'requested'); assert.equal(p.request_sent_email_id, 'sent_1'); assert.equal(mail.sent[0].from, config.REQUESTER_IDENTITY); assert.equal(mail.sent[0].to, config.RESPONDER_IDENTITY); assert.equal(mail.sent[0].idempotencyKey, `${id}:request:1`); assert.equal(parseEnvelope(mail.sent[0].bodyText)?.kind, 'request'); mail.deliverInbound(incoming(id)); await pollInbound(db, deps); assert.equal(getPr(db, id)?.state, 'received'); assert.equal(getPr(db, id)?.request_inbound_email_id, `in_${id}`); assert.equal(db.prepare('SELECT count(*) n FROM inbound_seen').get()?.n, 1); mail.deliverInbound(incoming(id)); await pollInbound(db, deps); assert.equal(listPrs(db).length, 1); assert.equal(mail.sent.length, 1); });
test('unknown inbound creates a request on the responder node', async () => { const { db, mail, deps } = setup(); mail.deliverInbound(incoming('cpr_remote')); await pollInbound(db, deps); assert.equal(getPr(db, 'cpr_remote')?.state, 'received'); });
