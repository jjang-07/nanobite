import {loadConfig} from './config.ts';import {openDb,migrate} from './db/db.ts';import {clientForIdentity} from './primitive/registry.ts';import {runWorker} from './pipeline/worker.ts';
const config=loadConfig(),db=openDb(config.CONTEXTPR_DB);migrate(db);
const abort=new AbortController();process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
await runWorker({db,config,clientFor:identity=>clientForIdentity(identity,config,db),signal:abort.signal});db.close();
