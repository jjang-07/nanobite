import {test} from 'node:test';import assert from 'node:assert/strict';
import {openDb,migrate,getPr} from '../src/db/db.ts';import {loadConfig} from '../src/config.ts';import {clientForIdentity} from '../src/primitive/registry.ts';import {listLocalInbox,submitLocalReply} from '../src/primitive/local.ts';
import {requestContext} from '../src/mcp/tools.ts';import {initializeCursor} from '../src/pipeline/worker.ts';import {sendQueuedRequests,pollDeliveries} from '../src/pipeline/requester.ts';import {pollInbound,processReceived,pollApprovals} from '../src/pipeline/responder.ts';
test('persistent local transport waits for an explicit human reply then delivers exact edit',async()=>{
 const db=openDb(':memory:');migrate(db);const config=loadConfig({});const deps={config,clientFor:(identity:string)=>clientForIdentity(identity,config,db)};
 await initializeCursor(db,deps);
 const id=requestContext(db,{responder:config.RESPONDER_IDENTITY,topic:'acme-sdk/retries',question:'Why do concurrent retries create duplicate charges with SDK 2.3?'},{requesterIdentity:config.REQUESTER_IDENTITY}).structured.id;
 await sendQueuedRequests(db,deps);await pollInbound(db,deps);await processReceived(db,deps);await pollApprovals(db,deps);assert.equal(getPr(db,id)?.state,'awaiting_approval');
 const messages=listLocalInbox(db,config.APPROVER_EMAIL);assert.equal(messages.length,1);
 submitLocalReply(db,{sentEmailId:messages[0].sentEmailId,author:config.APPROVER_EMAIL,bodyText:'edit\nUse one idempotencyKey outside the retry loop.'});
 await pollApprovals(db,deps);assert.equal(getPr(db,id)?.state,'approved');await pollDeliveries(db,deps);assert.equal(getPr(db,id)?.state,'delivered');assert.equal(getPr(db,id)?.approved_text,'Use one idempotencyKey outside the retry loop.');db.close();
});
