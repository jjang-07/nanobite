import { startDashboard } from './dashboard/server.ts';
import { OllamaDrafter, AnthropicDrafter } from './gates/draft.ts';
import { loadConfig } from './config.ts';
import { openDb, migrate } from './db/db.ts';
import { clientForIdentity } from './primitive/registry.ts';
import { runWorker } from './pipeline/worker.ts';
import { acquireWorkerLock } from './runtime-lock.ts';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
const config = loadConfig(), release = acquireWorkerLock(config.CONTEXTPR_DB);
let db: DatabaseSync | undefined, dashboard: Server | undefined;
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());
try {
    db = openDb(config.CONTEXTPR_DB);
    migrate(db);
    const database = db;
    const drafter = config.MODEL_PROVIDER === 'anthropic' ? new AnthropicDrafter({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL }) : new OllamaDrafter({ baseUrl: config.OLLAMA_BASE_URL, model: config.OLLAMA_MODEL });
    dashboard = await startDashboard(database, config.DASHBOARD_PORT, { config });
    console.error(`ContextPR local Inbox: http://127.0.0.1:${config.DASHBOARD_PORT} (mail=${config.MAIL_PROVIDER}, model=${config.MODEL_PROVIDER})`);
    await runWorker({ db: database, config, drafter, clientFor: identity => clientForIdentity(identity, config, database), signal: abort.signal });
}
finally {
    if (dashboard?.listening) {
        const server = dashboard;
        await new Promise<void>(resolve => { server.close(() => resolve()); server.closeIdleConnections(); });
    }
    db?.close();
    release();
}
