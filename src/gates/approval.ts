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
