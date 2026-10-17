import type {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import type {PrimitiveClient,SendInput,SendResult,ReplyEmail,InboundDetail} from './client.ts';
interface MailRow {
 seq:number;sent_id:string;inbound_id:string;thread_id:string;from_email:string;to_email:string;
 subject:string;body_text:string;reply_to_sent_id:string|null;references_json:string;
 purpose:string;idempotency_key:string;fingerprint:string;created_at:string;
}
export interface LocalInboxMessage extends InboundDetail {sentEmailId:string;purpose:string;reply:ReplyEmail|null;}
const ready=new WeakSet<DatabaseSync>();
function ensure(db:DatabaseSync){
 if(ready.has(db))return;
 db.exec(`CREATE TABLE IF NOT EXISTS local_mail (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_id TEXT NOT NULL UNIQUE, inbound_id TEXT NOT NULL UNIQUE, thread_id TEXT NOT NULL,
  from_email TEXT NOT NULL, to_email TEXT NOT NULL, subject TEXT NOT NULL, body_text TEXT NOT NULL,
  reply_to_sent_id TEXT, references_json TEXT NOT NULL, purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(from_email,idempotency_key)
 );
 CREATE INDEX IF NOT EXISTS local_mail_recipient ON local_mail(to_email,seq);
 CREATE INDEX IF NOT EXISTS local_mail_parent ON local_mail(reply_to_sent_id,seq);`);
 ready.add(db);
}
function rowBySent(db:DatabaseSync,id:string):MailRow{
 const row=db.prepare('SELECT * FROM local_mail WHERE sent_id=?').get(id) as unknown as MailRow|undefined;
 if(!row)throw new Error('Local message not found');return row;
}
function rowByInbound(db:DatabaseSync,id:string):MailRow{
 const row=db.prepare('SELECT * FROM local_mail WHERE inbound_id=?').get(id) as unknown as MailRow|undefined;
 if(!row)throw new Error('Local message not found');return row;
}
function detail(r:MailRow):InboundDetail{return {
 id:r.inbound_id,threadId:r.thread_id,sender:r.from_email,recipient:r.to_email,subject:r.subject,
 receivedAt:r.created_at,snippet:r.body_text.slice(0,200),fyi:false,automated:false,
 bodyText:r.body_text,bodyHtml:null,fromEmail:r.from_email,toEmail:r.to_email,
 replyToSentEmailId:r.reply_to_sent_id,inReplyTo:r.reply_to_sent_id?[r.reply_to_sent_id]:[],
 references:JSON.parse(r.references_json),attachments:[],
};}
function reply(r:MailRow):ReplyEmail{return {
 id:r.inbound_id,threadId:r.thread_id,replyToSentEmailId:r.reply_to_sent_id,
 fromEmail:r.from_email,toEmail:r.to_email,subject:r.subject,bodyText:r.body_text,
 receivedAt:r.created_at,fyi:false,senderVerified:true,
};}
function findReply(db:DatabaseSync,parent:MailRow):ReplyEmail|null{
 const r=db.prepare('SELECT * FROM local_mail WHERE reply_to_sent_id=? AND from_email=? AND to_email=? ORDER BY seq LIMIT 1').get(parent.sent_id,parent.to_email,parent.from_email) as unknown as MailRow|undefined;
 return r?reply(r):null;
}
function save(db:DatabaseSync,input:SendInput,parent?:MailRow):SendResult{
 if(!input.idempotencyKey)throw new Error('Local mail requires an idempotency key');
 const references=parent?[...JSON.parse(parent.references_json),parent.sent_id]:input.references??[];
 const fingerprint=createHash('sha256').update(JSON.stringify([input.from,input.to,input.subject,input.bodyText,parent?.sent_id??null,references])).digest('hex');
 const previous=db.prepare('SELECT * FROM local_mail WHERE from_email=? AND idempotency_key=?').get(input.from,input.idempotencyKey) as unknown as MailRow|undefined;
 if(previous){if(previous.fingerprint!==fingerprint)throw new Error('Idempotency key already used for different local message content');return {sentEmailId:previous.sent_id,status:'delivered',deliveryStatus:'delivered'};}
 const sentId=`local_sent_${randomUUID()}`,inboundId=`local_in_${randomUUID()}`;
 const purpose=input.idempotencyKey.split(':')[1]??'message';
 db.prepare('INSERT INTO local_mail(sent_id,inbound_id,thread_id,from_email,to_email,subject,body_text,reply_to_sent_id,references_json,purpose,idempotency_key,fingerprint,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(sentId,inboundId,parent?.thread_id??`local_thread_${randomUUID()}`,input.from,input.to,input.subject,input.bodyText,parent?.sent_id??null,JSON.stringify(references),purpose,input.idempotencyKey,fingerprint,new Date().toISOString());
 return {sentEmailId:sentId,status:'delivered',deliveryStatus:'delivered'};
}
/** Persistent mail confined to this database; it never contacts an email service. */
export function createLocalClient(db:DatabaseSync,identity:string):PrimitiveClient{
 ensure(db);
 return {
  async sendMail(input){
   if(input.from!==identity)throw new Error('Sender must match the local client identity');
   let parent:MailRow|undefined;
   if(input.inReplyTo){parent=db.prepare('SELECT * FROM local_mail WHERE sent_id=? OR inbound_id=?').get(input.inReplyTo,input.inReplyTo) as unknown as MailRow|undefined;if(!parent)throw new Error('Local parent message not found');if(parent.to_email!==identity||parent.from_email!==input.to)throw new Error('Reply recipient does not match the original message');}
   return save(db,input,parent);
  },
  async replyToEmail(id,input){const parent=rowByInbound(db,id);if(parent.to_email!==identity)throw new Error('Message recipient does not match the local identity');return save(db,{...input,from:identity,to:parent.from_email,subject:`Re: ${parent.subject}`},parent);},
  async awaitReply(id,_waitMs){const parent=rowBySent(db,id);if(parent.from_email!==identity)throw new Error('Message sender does not match the local identity');return findReply(db,parent);},
  async listInbound(recipient,since,_waitSeconds){
   if(recipient!==identity)throw new Error('Mailbox recipient does not match the local identity');
   if(since===null){const latest=db.prepare('SELECT * FROM local_mail WHERE to_email=? ORDER BY seq DESC LIMIT 1').get(identity) as unknown as MailRow|undefined;return {items:latest?[detail(latest)]:[],nextSince:`local:${latest?.seq??0}`};}
   let rows:MailRow[];
   if(/^local:\d+$/.test(since)){rows=db.prepare('SELECT * FROM local_mail WHERE to_email=? AND seq>? ORDER BY seq LIMIT 50').all(identity,Number(since.slice(6))) as unknown as MailRow[];}
   else{const timestamp=since.split('|')[0];if(!Number.isFinite(Date.parse(timestamp)))throw new Error('Invalid local inbox cursor');rows=db.prepare('SELECT * FROM local_mail WHERE to_email=? AND created_at>=? ORDER BY seq LIMIT 50').all(identity,timestamp) as unknown as MailRow[];}
   return {items:rows.map(detail),nextSince:rows.length?`local:${rows.at(-1)!.seq}`:since};
  },
  async getEmail(id){const row=rowByInbound(db,id);if(row.to_email!==identity)throw new Error('Message recipient does not match the local identity');return detail(row);},
 };
}
/** Human inbox messages only; request/capsule transport messages stay out of the UI. */
export function listLocalInbox(db:DatabaseSync,recipient:string):LocalInboxMessage[]{
 ensure(db);
 const rows=db.prepare("SELECT * FROM local_mail WHERE to_email=? AND purpose IN ('approval','clarification','notification','ack') ORDER BY seq DESC").all(recipient) as unknown as MailRow[];
 return rows.map(r=>({...detail(r),sentEmailId:r.sent_id,purpose:r.purpose,reply:findReply(db,r)}));
}
/** Called only by an explicit human action in the local dashboard, never at startup. */
export function submitLocalReply(db:DatabaseSync,input:{sentEmailId:string;author:string;bodyText:string;idempotencyKey?:string}):SendResult{
 ensure(db);const parent=rowBySent(db,input.sentEmailId);
 if(parent.to_email!==input.author)throw new Error('Reply author must be the original recipient');
 if(!['approval','clarification','notification'].includes(parent.purpose))throw new Error('This local message does not accept a human approval reply');
 if(!input.bodyText.trim())throw new Error('Reply body must not be empty');
 if(input.bodyText.length>20000)throw new Error('Reply body is too long');
 return save(db,{from:input.author,to:parent.from_email,subject:`Re: ${parent.subject}`,bodyText:input.bodyText,idempotencyKey:input.idempotencyKey??`human-reply:${parent.sent_id}`},parent);
}
