import type {Decision} from '../types.ts';
export function stripQuotedReply(body:string):string {
 const lines=body.replace(/\r\n/g,'\n').split('\n'),out:string[]=[];
 for(let i=0;i<lines.length;i++){const l=lines[i];
  if(/^On .+ wrote:\s*$/.test(l)||/^-{2,}\s*Original Message/i.test(l)||/^Sent from my /i.test(l)||/^-- $/.test(l)||(/^From: .+$/.test(l)&&lines.slice(i+1,i+4).some(s=>/^Sent: /.test(s))))break;
  if(!/^>/.test(l))out.push(l);
 }return out.join('\n').trim();
}
export function parseDecision(body:string|null):{decision:Decision;text?:string;reason?:string}{
 const lines=stripQuotedReply(body??'').split('\n');const first=lines.findIndex(l=>l.trim());if(first<0)return {decision:'unrecognized'};
 const line=lines[first].trim().toLowerCase().replace(/[.!?:;,]+$/,'');
 if(/^approve always\b/.test(line))return {decision:'approve_always'};
 if(/^(approve|approved|ok|okay|lgtm|yes|ship it)\b/.test(line))return {decision:'approve'};
 if(/^(deny|denied|reject|no)\b/.test(line))return {decision:'deny',reason:[lines[first].trim().replace(/^(deny|denied|reject|no)\b[\s:,-]*/i,''),...lines.slice(first+1)].join('\n').trim()};
 if(/^edit\b/.test(line)){const text=lines.slice(first+1).join('\n').trim();return text?{decision:'edit',text}:{decision:'unrecognized'};}
 if(/^revoke\b/.test(line))return {decision:'revoke'};
 return {decision:'unrecognized'};
}

import type {PrRow} from '../db/db.ts';
import type {Config} from '../config.ts';
import type {Removal} from '../types.ts';
export function buildApprovalEmail(p:PrRow,config:Config):{subject:string;bodyText:string}{
 const removals=(JSON.parse(p.removals??'[]') as Removal[]).map(r=>`${r.placeholder} ×${r.count}`).join(', ')||'none';
 const ids=JSON.parse(p.matched_source_ids??'[]') as string[];
 return {subject:`[ContextPR ${p.id}] Approve answer to ${p.requester_identity}? (${p.topic})`,bodyText:`A coding agent at ${p.requester_identity} (for ${p.on_behalf_of??'an engineer'}) asked your agent:\n\n  "${p.question}"\n\nDRAFT ANSWER — sent word for word if you approve:\n----------------------------------------\n${p.draft_answer}\n----------------------------------------\nAlready removed by rules: ${removals}\nModel flagged for your judgment: ${(JSON.parse(p.draft_flagged??'[]') as string[]).map(s=>JSON.stringify(s)).join(', ')||'none'}\nSources: ${new Set(ids.map(id=>id.split(':')[0])).size} session, ${ids.length} excerpts. Nothing else is sent.\n\nReply with ONE of:\n  approve\n  approve always      auto-send future answers on this topic to this requester; you get a copy each time\n  deny <reason>\n  edit                then paste the full replacement text below it\n\nContext PR: ${config.DASHBOARD_PUBLIC_URL}/pr/${p.id}`};
}
export function buildClarificationEmail(p:PrRow){return {subject:`[ContextPR ${p.id}] Clarify your decision`,bodyText:'I could not read that reply. Reply with exactly one of: approve, approve always, deny <reason>, edit. For edit, paste the full replacement text below the first line.'};}
import type {AutoRule} from '../approval/rules-store.ts';
export function buildNotificationEmail(p:PrRow,rule:AutoRule){return {subject:`[ContextPR ${p.id}] Auto-sent under your rule (${p.topic}) — reply "revoke" to stop`,bodyText:`Full capsule sent under rule ${rule.id}\nRequester: ${rule.requester_identity}\nTopic: ${rule.topic}\n\n${p.approved_text}\n\nReply revoke to delete this rule. Future requests will require approval.`};}
export function buildAckEmail(p:PrRow){return {subject:`[ContextPR ${p.id}] Rule revoked`,bodyText:'The rule was revoked. Future requests for this requester and topic will require human approval.'};}
