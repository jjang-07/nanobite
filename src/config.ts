export interface Config {
 REQUESTER_IDENTITY:string; RESPONDER_IDENTITY:string; APPROVER_EMAIL:string; APPROVER_NAME:string;
 PRIMITIVE_API_KEY:string; PRIMITIVE_API_KEY_REQUESTER:string; PRIMITIVE_API_KEY_RESPONDER:string;
 ANTHROPIC_API_KEY:string; ANTHROPIC_MODEL:string; CONTEXTPR_DB:string; DASHBOARD_PORT:number; DASHBOARD_PUBLIC_URL:string; POLL_WAIT_SECONDS:number; TRANSCRIPTS_DIR:string;
}
export function loadConfig(env:NodeJS.ProcessEnv=process.env):Config {
 const missing=['REQUESTER_IDENTITY','RESPONDER_IDENTITY','APPROVER_EMAIL'].filter(k=>!env[k]);
 if(!env.PRIMITIVE_API_KEY&&!(env.PRIMITIVE_API_KEY_REQUESTER&&env.PRIMITIVE_API_KEY_RESPONDER))missing.push('PRIMITIVE_API_KEY (or both split keys)');
 if(missing.length)throw new Error(`Missing configuration: ${missing.join(', ')}. Copy .env.example to .env and configure these fields.`);
 for(const key of ['REQUESTER_IDENTITY','RESPONDER_IDENTITY','APPROVER_EMAIL'])if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env[key]!))throw new Error(`Invalid ${key}: configure a real email address`);
 const port=Number(env.DASHBOARD_PORT??8787),poll=Number(env.POLL_WAIT_SECONDS??20);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid DASHBOARD_PORT');
 if(!Number.isInteger(poll)||poll<0||poll>30)throw new Error('Invalid POLL_WAIT_SECONDS (0–30)');
 return {REQUESTER_IDENTITY:env.REQUESTER_IDENTITY!,RESPONDER_IDENTITY:env.RESPONDER_IDENTITY!,APPROVER_EMAIL:env.APPROVER_EMAIL!,APPROVER_NAME:env.APPROVER_NAME??'Bob',PRIMITIVE_API_KEY:env.PRIMITIVE_API_KEY??'',PRIMITIVE_API_KEY_REQUESTER:env.PRIMITIVE_API_KEY_REQUESTER??'',PRIMITIVE_API_KEY_RESPONDER:env.PRIMITIVE_API_KEY_RESPONDER??'',ANTHROPIC_API_KEY:env.ANTHROPIC_API_KEY??'',ANTHROPIC_MODEL:env.ANTHROPIC_MODEL??'claude-opus-5-5',CONTEXTPR_DB:env.CONTEXTPR_DB??'./data/contextpr.db',DASHBOARD_PORT:port,DASHBOARD_PUBLIC_URL:env.DASHBOARD_PUBLIC_URL??`http://localhost:${port}`,POLL_WAIT_SECONDS:poll,TRANSCRIPTS_DIR:env.TRANSCRIPTS_DIR??'./demo/fixtures'};
}
