import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakePrimitive } from '../src/primitive/fake.ts';
test('fake sends, replies, inbound once, getEmail and idempotency', async () => {
 const f=new FakePrimitive(); const i={from:'a@x',to:'b@y',subject:'s',bodyText:'t',idempotencyKey:'k'};
 const r=await f.sendMail(i);assert.equal(r.sentEmailId,'sent_1');assert.deepEqual(f.sent,[i]);
 assert.equal((await f.sendMail(i)).sentEmailId,'sent_1');assert.equal(f.sent.length,1);
 f.deliverReply(r.sentEmailId,{fromEmail:'b@y',bodyText:'approve'});
 assert.equal((await f.awaitReply(r.sentEmailId,1))?.bodyText,'approve');
 f.deliverInbound({id:'in_1',fromEmail:'a@x',toEmail:'b@y',bodyText:'hello'});
 assert.equal((await f.listInbound('b@y',null,0)).items.length,1);
 assert.equal((await f.listInbound('b@y',null,0)).items.length,0);
 assert.equal((await f.getEmail('in_1')).bodyText,'hello');
 await f.replyToEmail('in_1',{bodyText:'answer',idempotencyKey:'reply'});assert.equal(f.sent[1].inReplyTo,'in_1');
});
