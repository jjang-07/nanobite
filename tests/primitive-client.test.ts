import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrimitiveClient } from '../src/primitive/client.ts';

function stubFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  return (async (input: any, init: any) => {
    const { status, body } = handler(String(input), init ?? {});
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

test('sendMail posts snake_case body with idempotency header and maps the result', async () => {
  let seen: any;
  const client = createPrimitiveClient('prim_test', stubFetch((url, init) => {
    seen = { url, init, body: JSON.parse(String(init.body)) };
    return { status: 200, body: { success: true, data: { id: 'sent_1', status: 'delivered', delivery_status: 'delivered' } } };
  }));
  const r = await client.sendMail({ from: 'a@x.primitive.email', to: 'b@y.com', subject: 's', bodyText: 'hi', idempotencyKey: 'cpr_1:request:1', wait: true });
  assert.equal(seen.url, 'https://api.primitive.dev/v1/send-mail');
  assert.equal(seen.body.body_text, 'hi'); assert.equal(seen.body.wait, true);
  assert.equal((seen.init.headers as any)['Idempotency-Key'], 'cpr_1:request:1');
  assert.equal((seen.init.headers as any)['Authorization'], 'Bearer prim_test');
  assert.deepEqual(r, { sentEmailId: 'sent_1', status: 'delivered', deliveryStatus: 'delivered' });
});

test('awaitReply maps ReplyEmail and returns null on timeout', async () => {
  const client = createPrimitiveClient('prim_test', stubFetch((url) => {
    assert.match(url, /\/sent-emails\/sent_1\/reply\?wait=true&wait_timeout_ms=5000$/);
    return { status: 200, body: { success: true, data: { sent_email_id: 'sent_1', waited: true, timed_out: false,
      reply: { id: 'in_9', thread_id: 't1', reply_to_sent_email_id: 'sent_1', from_email: 'bob@g.com', to_email: 'sdk-help@y.primitive.email',
               subject: 'Re: x', body_text: 'approve', body_html: null, received_at: '2026-10-17T20:00:00Z', status: 'received', sender_verified: true, sender_matches_recipient: true, fyi: false, auth: {} } } } };
  }));
  const r = await client.awaitReply('sent_1', 5000);
  assert.equal(r?.bodyText, 'approve'); assert.equal(r?.fromEmail, 'bob@g.com');
  const none = createPrimitiveClient('prim_test', stubFetch(() => ({ status: 200, body: { success: true, data: { sent_email_id: 'sent_1', waited: true, timed_out: true, reply: null } } })));
  assert.equal(await none.awaitReply('sent_1', 5000), null);
});

test('listInbound builds the long-poll query and computes nextSince', async () => {
  const client = createPrimitiveClient('prim_test', stubFetch((url) => {
    assert.match(url, /\/emails\?/); assert.match(url, /recipient=sdk-help%40y\.primitive\.email/); assert.match(url, /since=2026/); assert.match(url, /wait=20/);
    return { status: 200, body: { success: true, meta: { total: 1, limit: 50, cursor: null },
      data: [{ id: 'in_1', thread_id: 't', sender: 'a@x.primitive.email', recipient: 'sdk-help@y.primitive.email', subject: '[ContextPR cpr_1] acme-sdk/retries', received_at: '2026-10-17T19:00:00Z', snippet: 'q', fyi: false, automated: false }] } };
  }));
  const r = await client.listInbound('sdk-help@y.primitive.email', '2026-10-17T18:00:00Z|00000000-0000-0000-0000-000000000000', 20);
  assert.equal(r.items[0].id, 'in_1'); assert.equal(r.nextSince, '2026-10-17T19:00:00Z|in_1');
});

test('non-2xx becomes an Error carrying status and code', async () => {
  const client = createPrimitiveClient('prim_test', stubFetch(() => ({ status: 403, body: { success: false, error: { code: 'recipient_not_allowed' }, gates: [{ fix: { action: 'claim_account' } }] } })));
  await assert.rejects(() => client.sendMail({ from: 'a', to: 'b', subject: 's', bodyText: 't', idempotencyKey: 'k' }), /403.*recipient_not_allowed/);
});
