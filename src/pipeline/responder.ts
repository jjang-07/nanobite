import type {DatabaseSync} from 'node:sqlite';
import {getPr,insertPr,updatePr,addEvent,transaction,listPrs} from '../db/db.ts';
import {encodeEnvelope,parseEnvelope} from '../envelope.ts';import {nowIso} from '../ids.ts';
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

import type {PrRow} from '../db/db.ts';import type {ReplyEmail} from '../primitive/client.ts';import type {Decision,Removal} from '../types.ts';
import {recordSent,recordError} from './requester.ts';import {parseDecision,buildApprovalEmail,buildClarificationEmail} from '../gates/approval.ts';
export function trustedReply(r:ReplyEmail,sentId:string,from:string,to:string){return r.senderVerified&&!r.fyi&&r.fromEmail.toLowerCase()===from.toLowerCase()&&r.toEmail.toLowerCase()===to.toLowerCase()&&r.replyToSentEmailId===sentId;}
export async function sendApproval(db:DatabaseSync,deps:Deps,p:PrRow){
 const r=await deps.clientFor(p.responder_identity).sendMail({from:p.responder_identity,to:deps.config.APPROVER_EMAIL,...buildApprovalEmail(p,deps.config),idempotencyKey:`${p.id}:approval:1`});
 recordSent(db,r.sentEmailId,p.id,'approval',p.responder_identity);updatePr(db,p.id,{state:'awaiting_approval',approval_sent_email_id:r.sentEmailId,approver:deps.config.APPROVER_EMAIL});addEvent(db,p.id,'approval_sent',{sent_email_id:r.sentEmailId});
}
export async function processReceived(db:DatabaseSync,deps:Deps){for(const p of listPrs(db,{state:'received'})){try{
 updatePr(db,p.id,{state:'drafting'});
 const excerpts=searchSources(db,p.responder_identity,p.topic.replace(/[-/]/g,' ')+' '+p.question+' '+(p.context_hint??''));
 if(!excerpts.length){await finalize(db,deps,p,'deny',undefined,'no_sources','system');continue;}
 const rules=loadRules(db,p.responder_identity);let removals:Removal[]=[];
 const clean=excerpts.map(e=>{const r=applyRules(e.text,rules);removals=mergeRemovals(removals,r.removals);return {...e,text:r.text};});
 addEvent(db,p.id,'sources_matched',{ids:excerpts.map(e=>e.id)});
 if(!deps.drafter)throw new Error('No model provider configured. Configure Claude or local Ollama and create a new request.');
 const draft=await deps.drafter.draft({question:p.question,context:p.context_hint??undefined,excerpts:clean});
 const answer=applyRules(draft.answer,rules);removals=mergeRemovals(removals,answer.removals);
 const flagged=draft.flagged.map(f=>applyRules(f,rules).text);
 updatePr(db,p.id,{draft_answer:answer.text,draft_flagged:JSON.stringify(flagged),removals:JSON.stringify(removals),matched_source_ids:JSON.stringify(excerpts.map(e=>e.id))});
 addEvent(db,p.id,'rules_applied',{removals});addEvent(db,p.id,'drafted',{confidence:draft.confidence,why_relevant:applyRules(draft.why_relevant,rules).text,used_excerpt_ids:draft.used_excerpt_ids});
 await sendApproval(db,deps,getPr(db,p.id)!);
 }catch(e){recordError(db,p.id,e);updatePr(db,p.id,{state:'failed',decision_reason:e instanceof Error?e.message:'draft_failed'});}}}
export async function sendFinalized(db:DatabaseSync,deps:Deps,p:PrRow){
 if(!p.request_inbound_email_id||p.capsule_sent_email_id)return;
 const denied=p.state==='denied';const decision=p.decision==='auto'?'auto_merged':p.decision==='edit'?'edited':'approved';
 const envelope=denied?encodeEnvelope('denial',{v:1,id:p.id,reason:p.decision_reason??'Declined by approver',suggestion:'Narrow the question, include the failing test and SDK version, or ask a different responder.'}):encodeEnvelope('capsule',{v:1,id:p.id,text:p.approved_text,decision,approved_at:p.decided_at,gates:{rules_removals:(JSON.parse(p.removals??'[]') as Removal[]).reduce((n,r)=>n+r.count,0),minimized:true,human:decision}});
 const purpose=denied?'denial':'capsule';const r=await deps.clientFor(p.responder_identity).replyToEmail(p.request_inbound_email_id,{bodyText:`Context PR ${p.id}: ${denied?'denied':'approved answer'}\n\n${envelope}`,idempotencyKey:`${p.id}:${purpose}:1`});
 recordSent(db,r.sentEmailId,p.id,purpose,p.responder_identity,1);updatePr(db,p.id,{capsule_sent_email_id:r.sentEmailId});addEvent(db,p.id,denied?'denied':'capsule_sent',{sent_email_id:r.sentEmailId});
}
export async function finalize(db:DatabaseSync,deps:Deps,p:PrRow,decision:Decision,text?:string,reason?:string,approver=deps.config.APPROVER_EMAIL){
 const denied=decision==='deny';
 updatePr(db,p.id,{state:denied?'denied':'approved',decision,decision_reason:reason??null,approved_text:denied?null:decision==='edit'?text!:p.draft_answer,approver,decided_at:nowIso()});addEvent(db,p.id,'decision',{decision,approver});
 if(p.approval_sent_email_id)db.prepare('UPDATE sent_emails SET handled=1 WHERE sent_email_id=?').run(p.approval_sent_email_id);
 await sendFinalized(db,deps,getPr(db,p.id)!);
}
export async function pollApprovals(db:DatabaseSync,deps:Deps){await Promise.all(listPrs(db,{state:'awaiting_approval'}).map(async p=>{try{
 const id=p.approval_sent_email_id;if(!id)return;const r=await deps.clientFor(p.responder_identity).awaitReply(id,3000);if(!r||!trustedReply(r,id,p.approver??deps.config.APPROVER_EMAIL,p.responder_identity))return;
 const parsed=parseDecision(r.bodyText);
 if(['approve','approve_always','deny','edit'].includes(parsed.decision)){await finalize(db,deps,p,parsed.decision,parsed.text,parsed.reason,r.fromEmail);}
 else {
  const attempt=Number(db.prepare("SELECT count(*) n FROM sent_emails WHERE pr_id=? AND purpose='clarification'").get(p.id)?.n??0)+1;
  const sent=await deps.clientFor(p.responder_identity).sendMail({from:p.responder_identity,to:p.approver??deps.config.APPROVER_EMAIL,...buildClarificationEmail(p),idempotencyKey:`${p.id}:clarification:${attempt}`});
  recordSent(db,sent.sentEmailId,p.id,'clarification',p.responder_identity);db.prepare('UPDATE sent_emails SET handled=1 WHERE sent_email_id=?').run(id);updatePr(db,p.id,{approval_sent_email_id:sent.sentEmailId});
 }
 }catch(e){recordError(db,p.id,e);}}));}

import {searchSources} from '../indexer/index.ts';
import {applyRules,loadRules,mergeRemovals} from '../gates/rules.ts';
