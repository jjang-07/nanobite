import { loadConfig } from '../src/config.ts';
import { openDb, migrate } from '../src/db/db.ts';
import { requestContext } from '../src/mcp/tools.ts';
const c = loadConfig(), db = openDb(c.CONTEXTPR_DB);
migrate(db);
console.log(requestContext(db, { responder: c.RESPONDER_IDENTITY, topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges with SDK 2.3?', context: 'test concurrent-retry fails: expected 1 charge, got 2', on_behalf_of: 'Alice (local demo)' }, { requesterIdentity: c.REQUESTER_IDENTITY }).structured);
db.close();
