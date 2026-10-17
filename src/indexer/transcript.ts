import type {Turn} from '../types.ts';
export function parseTranscriptWithStats(jsonl:string):{turns:Turn[];skipped:number}{
 const turns:Turn[]=[];let skipped=0;
 for(const line of jsonl.split('\n')){if(!line.trim())continue;let r:any;try{r=JSON.parse(line);}catch{skipped++;continue;}
  if(!r||!['user','assistant'].includes(r.type)||r.isMeta===true)continue;
  if(typeof r.sessionId!=='string'||!r.message){skipped++;continue;}
  const add=(role:Turn['role'],text:unknown)=>{if(typeof text==='string'&&text.trim())turns.push({index:turns.length,role,text,timestamp:typeof r.timestamp==='string'?r.timestamp:null,sessionId:r.sessionId});};
  const c=r.message.content;
  if(r.type==='user'&&typeof c==='string'){add('user',c);continue;}
  if(!Array.isArray(c)){skipped++;continue;}
  for(const b of c){if(!b)continue;
   if(b.type==='text')add(r.type,b.text);
   else if(r.type==='user'&&b.type==='tool_result'){const text=typeof b.content==='string'?b.content:Array.isArray(b.content)?b.content.filter((x:any)=>x?.type==='text'&&typeof x.text==='string').map((x:any)=>x.text).join('\n'):'';add('tool',text.slice(0,2000));}
   else if(r.type==='assistant'&&b.type==='tool_use'&&typeof b.name==='string')add('assistant_tool',`${b.name}(${JSON.stringify(b.input??{}).slice(0,500)})`);
  }
 }return {turns,skipped};
}
export function parseTranscript(jsonl:string):Turn[]{return parseTranscriptWithStats(jsonl).turns;}
