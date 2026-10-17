import type {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import type {Removal} from '../types.ts';import {transaction} from '../db/db.ts';
export interface Rule {kind:'literal'|'regex'|'sentence';pattern:string;placeholder:string;}
export function mergeRemovals(...groups:Removal[][]):Removal[]{const counts=new Map<string,number>();for(const g of groups)for(const r of g)counts.set(r.placeholder,(counts.get(r.placeholder)??0)+r.count);return [...counts].map(([placeholder,count])=>({placeholder,count}));}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function applyRules(text:string,rules:readonly Rule[]):{text:string;removals:Removal[]}{
 const counts=new Map<string,number>();const hit=(p:string)=>{counts.set(p,(counts.get(p)??0)+1);return p;};
 for(const r of rules.filter(r=>r.kind==='literal').sort((a,b)=>b.pattern.length-a.pattern.length)){
  // Do not split an email/domain before the email rule can mask it completely.
  const pattern=/^\w+$/.test(r.pattern)?`(?<![\\w@.])${escape(r.pattern)}(?![\\w@.])`:escape(r.pattern);
  text=text.replace(new RegExp(pattern,'gi'),()=>hit(r.placeholder));
 }
 for(const r of rules.filter(r=>r.kind==='regex'))text=text.replace(new RegExp(r.pattern,'gi'),()=>hit(r.placeholder));
 for(const r of rules.filter(r=>r.kind==='sentence'))text=text.split(/((?<=[.!?])\s+|\n)/).map(sentence=>{if(!sentence.toLowerCase().includes(r.pattern.toLowerCase()))return sentence;const leading=sentence.match(/^\s*/)?.[0]??'';return `${leading}[sentence removed: ${hit(r.placeholder)}]`;}).join('');
 return {text,removals:[...counts].map(([placeholder,count])=>({placeholder,count}))};
}
export function loadRules(db:DatabaseSync,responderIdentity:string):Rule[]{return db.prepare('SELECT kind,pattern,placeholder FROM denylist WHERE responder_identity=? ORDER BY id').all(responderIdentity) as unknown as Rule[];}
export function seedRules(db:DatabaseSync,sqlPath:string,responderIdentity=process.env.RESPONDER_IDENTITY??'sdk-help@acme.local'){
 const sql=readFileSync(sqlPath,'utf8').replaceAll('__RESPONDER__',responderIdentity.replaceAll("'","''"));
 transaction(db,()=>{db.prepare('DELETE FROM denylist WHERE responder_identity=?').run(responderIdentity);db.exec(sql);});
}
