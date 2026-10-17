export interface Config {
 MAIL_PROVIDER:'local'|'primitive'; MODEL_PROVIDER:'ollama'|'anthropic'; OLLAMA_BASE_URL:string; OLLAMA_MODEL:string;
 REQUESTER_IDENTITY:string; RESPONDER_IDENTITY:string; APPROVER_EMAIL:string; APPROVER_NAME:string;
 PRIMITIVE_API_KEY:string; PRIMITIVE_API_KEY_REQUESTER:string; PRIMITIVE_API_KEY_RESPONDER:string;
 ANTHROPIC_API_KEY:string; ANTHROPIC_MODEL:string; CONTEXTPR_DB:string; DASHBOARD_PORT:number; DASHBOARD_PUBLIC_URL:string; POLL_WAIT_SECONDS:number; TRANSCRIPTS_DIR:string;
}
export function loadConfig(env:NodeJS.ProcessEnv=process.env):Config {
 const mail=env.MAIL_PROVIDER??'local',model=env.MODEL_PROVIDER??'ollama';
 if(mail!=='local'&&mail!=='primitive')throw new Error('Invalid MAIL_PROVIDER: use local or primitive');
 if(model!=='ollama'&&model!=='anthropic')throw new Error('Invalid MODEL_PROVIDER: use ollama or anthropic');
 const values={...env,REQUESTER_IDENTITY:env.REQUESTER_IDENTITY??'alice-agent@startup.local',RESPONDER_IDENTITY:env.RESPONDER_IDENTITY??'sdk-help@acme.local',APPROVER_EMAIL:env.APPROVER_EMAIL??'bob@acme.local'};
 const missing:string[]=[];
 if(mail==='primitive'){
  for(const key of ['REQUESTER_IDENTITY','RESPONDER_IDENTITY','APPROVER_EMAIL'])if(!env[key])missing.push(key);
  if(!env.PRIMITIVE_API_KEY&&!(env.PRIMITIVE_API_KEY_REQUESTER&&env.PRIMITIVE_API_KEY_RESPONDER))missing.push('PRIMITIVE_API_KEY (or both split keys)');
 }
 if(model==='anthropic'&&!env.ANTHROPIC_API_KEY)missing.push('ANTHROPIC_API_KEY');
 if(missing.length)throw new Error(`Missing configuration: ${missing.join(', ')}. Copy .env.example to .env and configure these fields.`);
 for(const key of ['REQUESTER_IDENTITY','RESPONDER_IDENTITY','APPROVER_EMAIL'] as const)if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(values[key]))throw new Error(`Invalid ${key}: configure an email address`);
 const port=Number(env.DASHBOARD_PORT??8787),poll=Number(env.POLL_WAIT_SECONDS??(mail==='local'?0:20));
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid DASHBOARD_PORT');
 if(!Number.isInteger(poll)||poll<0||poll>30)throw new Error('Invalid POLL_WAIT_SECONDS (0–30)');
 const ollama=env.OLLAMA_BASE_URL??'http://127.0.0.1:11434';let url:URL;
 try{url=new URL(ollama);}catch{throw new Error('Invalid OLLAMA_BASE_URL: use a local loopback URL');}
 if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password)throw new Error('OLLAMA_BASE_URL must use a local loopback server');
 return {MAIL_PROVIDER:mail,MODEL_PROVIDER:model,OLLAMA_BASE_URL:ollama.replace(/\/$/,''),OLLAMA_MODEL:env.OLLAMA_MODEL??'',REQUESTER_IDENTITY:values.REQUESTER_IDENTITY,RESPONDER_IDENTITY:values.RESPONDER_IDENTITY,APPROVER_EMAIL:values.APPROVER_EMAIL,APPROVER_NAME:env.APPROVER_NAME??'Bob',PRIMITIVE_API_KEY:env.PRIMITIVE_API_KEY??'',PRIMITIVE_API_KEY_REQUESTER:env.PRIMITIVE_API_KEY_REQUESTER??'',PRIMITIVE_API_KEY_RESPONDER:env.PRIMITIVE_API_KEY_RESPONDER??'',ANTHROPIC_API_KEY:env.ANTHROPIC_API_KEY??'',ANTHROPIC_MODEL:env.ANTHROPIC_MODEL??'claude-opus-5-5',CONTEXTPR_DB:env.CONTEXTPR_DB??'./data/contextpr.db',DASHBOARD_PORT:port,DASHBOARD_PUBLIC_URL:env.DASHBOARD_PUBLIC_URL??`http://localhost:${port}`,POLL_WAIT_SECONDS:poll,TRANSCRIPTS_DIR:env.TRANSCRIPTS_DIR??'./demo/fixtures'};
}
