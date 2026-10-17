import type {DatabaseSync} from 'node:sqlite';
import {getPr,insertPr,updatePr,addEvent,transaction} from '../db/db.ts';
import {parseEnvelope} from '../envelope.ts';import {nowIso} from '../ids.ts';
import type {InboundDetail} from '../primitive/client.ts';import type {Deps} from './worker.ts';
export function handleInboundRequest(db:DatabaseSync,deps:Deps,detail:InboundDetail){
 const env=parseEnvelope(detail.bodyText);if(env?.kind!=='request')return;
 const p=env.payload;const identity=deps.config.RESPONDER_IDENTITY;
 if(!/^cpr_[a-z0-9]+$/.test(p.id)||typeof p.question!=='string'||p.question.length<20||p.question.length>2000||typeof p.topic!=='string'||!/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(p.topic)||p.requester_identity!==detail.fromEmail||detail.toEmail!==identity)return;
 const old=getPr(db,p.id);
 if(old&&(old.requester_identity!==detail.fromEmail||old.responder_identity!==identity||old.state!=='requested'&&old.state!=='queued'))return;
 if(!old)insertPr(db,{id:p.id,state:'received',requester_identity:detail.fromEmail,responder_identity:identity,question:p.question,topic:p.topic,context_hint:typeof p.context==='string'?p.context.slice(0,4000):null,on_behalf_of:typeof p.on_behalf_of==='string'?p.on_behalf_of.slice(0,120):null});
 updatePr(db,p.id,{state:'received',request_inbound_email_id:detail.id,request_thread_id:detail.threadId});addEvent(db,p.id,'received',{inbound_email_id:detail.id});
}
export async function pollInbound(db:DatabaseSync,deps:Deps){
 const identity=deps.config.RESPONDER_IDENTITY;const cursor=db.prepare('SELECT since FROM cursors WHERE identity=?').get(identity)?.since as string|null|undefined;
 const r=await deps.clientFor(identity).listInbound(identity,cursor??null,deps.config.POLL_WAIT_SECONDS);
 for(const item of r.items){if(db.prepare('SELECT 1 FROM inbound_seen WHERE email_id=?').get(item.id))continue;
  const detail=await deps.clientFor(identity).getEmail(item.id);
  transaction(db,()=>{handleInboundRequest(db,deps,detail);db.prepare('INSERT OR IGNORE INTO inbound_seen(email_id,identity,seen_at) VALUES(?,?,?)').run(item.id,identity,nowIso());});
 }
 db.prepare('INSERT INTO cursors(identity,since) VALUES(?,?) ON CONFLICT(identity) DO UPDATE SET since=excluded.since').run(identity,r.nextSince);
}
export async function processReceived(_db:DatabaseSync,_deps:Deps){}
export async function pollApprovals(_db:DatabaseSync,_deps:Deps){}
