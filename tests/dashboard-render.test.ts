import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDb,migrate,insertPr,getPr,updatePr} from '../src/db/db.ts';
import {renderInbox,renderPr} from '../src/dashboard/render.ts';
import {loadConfig} from '../src/config.ts';
import type {LocalInboxMessage} from '../src/primitive/local.ts';
function sample(){const db=openDb(':memory:');migrate(db);insertPr(db,{id:'cpr_demo',state:'awaiting_approval',requester_identity:'alice@startup.local',responder_identity:'sdk@acme.local',topic:'sdk/retries',question:'Why do retries create duplicate charges?'});updatePr(db,'cpr_demo',{draft_answer:'Use one key.\nUnreleased line.',approved_text:'Use one key.\nApproved change.',draft_flagged:'["v2.5"]',removals:'[{"placeholder":"[another customer]","count":2}]',matched_source_ids:'["session:3"]',approval_sent_email_id:'sent_approval',request_sent_email_id:'sent_request',request_thread_id:'thread_request',decision:'edit',approver:'bob@acme.local',outcome_result:'passed'});const pr=getPr(db,'cpr_demo')!;db.close();return pr;}
function message(purpose='approval'):LocalInboxMessage{return {id:'in_approval',sentEmailId:'sent_approval',purpose,reply:null,threadId:'thread1',sender:'sdk@acme.local',recipient:'bob@acme.local',fromEmail:'sdk@acme.local',toEmail:'bob@acme.local',subject:'[ContextPR cpr_demo] Review',bodyText:'Review exact draft',bodyHtml:null,receivedAt:'2026-10-17T20:00:00Z',snippet:null,fyi:false,automated:false,replyToSentEmailId:null,inReplyTo:[],references:[],attachments:[]};}
const config=loadConfig({});
test('Inbox includes complete review table and explicit local request form',()=>{
 const html=renderInbox([sample()],{csrfToken:'safe-token',config});
 for(const value of ['cpr_demo','awaiting_approval','sdk/retries','/pr/cpr_demo','Requester','Responder','Decision','Removals','Outcome','Updated','Local inbox','Ollama','Synthetic fixture demo'])assert.ok(html.includes(value),value);
 assert.match(html,/<form[^>]+action="\/requests"/);assert.match(html,/name="csrf" value="safe-token"/);
 for(const name of ['responder','topic','question','context','on_behalf_of'])assert.ok(html.includes(`name="${name}"`));
 assert.doesNotMatch(html,/<meta[^>]+http-equiv="refresh"/i);assert.match(html,/dirty/);
});
test('PR detail contains exact content, audit data, line changes and approval actions',()=>{
 const pr=sample();const html=renderPr(pr,[{id:1,pr_id:pr.id,at:pr.created_at,kind:'drafted',detail:'{"model":"demo"}'}],{csrfToken:'csrf',config,messages:[message()]});
 for(const value of [pr.question,'Use one key.\nUnreleased line.','Approved change.','[another customer]','×2','v2.5','session:3','drafted','sent_request','thread_request','passed'])assert.ok(html.includes(value),value);
 assert.match(html,/<del>Unreleased line\.<\/del>/);assert.match(html,/action="\/pr\/cpr_demo\/reply"/);assert.match(html,/name="sent_id" value="sent_approval"/);
 for(const action of ['approve','approve_always','deny','edit'])assert.ok(html.includes(`value="${action}"`));
 assert.match(html,/name="replacement"/);assert.match(html,/name="reason"/);assert.doesNotMatch(html,/<script|http-equiv="refresh"/i);
});
test('notification exposes explicit revoke; stale or answered approvals have no action',()=>{
 const pr=sample();assert.match(renderPr(pr,[],{config,messages:[message('notification')]}),/value="revoke"/);
 assert.doesNotMatch(renderPr({...pr,state:'delivered'},[],{config,messages:[message()]}),/value="approve"/);
 assert.doesNotMatch(renderPr(pr,[],{config,messages:[{...message(),sentEmailId:'old'}]}),/value="approve"/);
});
test('all untrusted fields and form values are escaped; locked design has no decorative elements',()=>{
 const evil='</textarea><script>alert("x")</script><img src=x onerror=alert(1)>';
 const pr={...sample(),question:evil,draft_answer:evil,approved_text:evil,draft_flagged:JSON.stringify([evil]),matched_source_ids:JSON.stringify([evil])};
 const inbox=renderInbox([pr],{csrfToken:'" onfocus="alert(1)',config:{...config,RESPONDER_IDENTITY:evil}});
 const detail=renderPr(pr,[{id:1,pr_id:pr.id,at:pr.created_at,kind:evil,detail:evil}],{csrfToken:'" onfocus="alert(1)',config,messages:[{...message(),bodyText:evil}]});
 for(const html of [inbox,detail]){assert.ok(html.includes('&lt;'));assert.doesNotMatch(html,/<img|<svg|box-shadow|linear-gradient|<script>alert|value="" onfocus=/i);assert.match(html,/background:\s*#fff/);}
 assert.doesNotMatch(detail,/<\/textarea><script>/);
});
