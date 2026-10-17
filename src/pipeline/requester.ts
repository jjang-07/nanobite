import type {DatabaseSync} from 'node:sqlite';
import {listPrs,updatePr,addEvent} from '../db/db.ts';
import {requestContext} from '../mcp/tools.ts';
import {encodeEnvelope} from '../envelope.ts';import {nowIso} from '../ids.ts';
import type {Deps} from './worker.ts';
export const createRequest=requestContext;
export function recordSent(db:DatabaseSync,id:string,prId:string,purpose:string,identity:string,handled=0){db.prepare('INSERT OR IGNORE INTO sent_emails(sent_email_id,pr_id,purpose,identity,handled,created_at) VALUES(?,?,?,?,?,?)').run(id,prId,purpose,identity,handled,nowIso());}
export function recordError(db:DatabaseSync,id:string,e:unknown){const message=e instanceof Error?e.message:'Unknown worker error';addEvent(db,id,'error',{message});console.error(`ContextPR ${id}: ${message}`);}
export async function sendQueuedRequests(db:DatabaseSync,deps:Deps){for(const p of listPrs(db,{state:'queued'})){try{
 const r=await deps.clientFor(p.requester_identity).sendMail({from:p.requester_identity,to:p.responder_identity,subject:`[ContextPR ${p.id}] ${p.topic}`,bodyText:`From ${p.requester_identity}, for ${p.on_behalf_of??'an engineer'}\nTopic: ${p.topic}\n${p.question}\n${p.context_hint??''}\n\n`+encodeEnvelope('request',{v:1,id:p.id,topic:p.topic,question:p.question,context:p.context_hint,requester_identity:p.requester_identity,on_behalf_of:p.on_behalf_of}),idempotencyKey:`${p.id}:request:1`});
 if(['bounced','gate_denied','agent_failed','canceled'].includes(r.status))throw new Error(`Request send ${r.status}`);
 recordSent(db,r.sentEmailId,p.id,'request',p.requester_identity);updatePr(db,p.id,{state:'requested',request_sent_email_id:r.sentEmailId});addEvent(db,p.id,'request_sent',{sent_email_id:r.sentEmailId});
 }catch(e){recordError(db,p.id,e);}}}
export async function pollDeliveries(_db:DatabaseSync,_deps:Deps){}
