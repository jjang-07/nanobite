import {OllamaDrafter,AnthropicDrafter} from './gates/draft.ts';
import {loadConfig} from './config.ts';import {openDb,migrate} from './db/db.ts';import {clientForIdentity} from './primitive/registry.ts';import {runWorker} from './pipeline/worker.ts';
const config=loadConfig(),db=openDb(config.CONTEXTPR_DB);migrate(db);
const drafter=config.MODEL_PROVIDER==='anthropic'?new AnthropicDrafter({apiKey:config.ANTHROPIC_API_KEY,model:config.ANTHROPIC_MODEL}):new OllamaDrafter({baseUrl:config.OLLAMA_BASE_URL,model:config.OLLAMA_MODEL});
const abort=new AbortController();process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
await runWorker({db,config,drafter,clientFor:identity=>clientForIdentity(identity,config,db),signal:abort.signal});db.close();
