import { startDashboard } from './dashboard/server.ts';
import { OllamaDrafter, AnthropicDrafter } from './gates/draft.ts';
import { loadConfig } from './config.ts';
import { openDb, migrate } from './db/db.ts';
import { clientForIdentity } from './primitive/registry.ts';
import { runWorker } from './pipeline/worker.ts';
import { acquireWorkerLock } from './runtime-lock.ts';
import { startMcpHttp } from './mcp/http.ts';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
const config = loadConfig(), release = acquireWorkerLock(config.CONTEXTPR_DB);
let db: DatabaseSync | undefined, dashboard: Server | undefined, mcpHttp: Server | undefined;
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());
async function closeServer(server: Server | undefined) {
    if (server?.listening)
        await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    // closeAll, not closeIdle: an open Inbox tab holds a live-update request that would otherwise block exit.
}
try {
    db = openDb(config.CONTEXTPR_DB);
    migrate(db);
    const database = db;
    const drafter = config.MODEL_PROVIDER === 'anthropic' ? new AnthropicDrafter({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL }) : new OllamaDrafter({ baseUrl: config.OLLAMA_BASE_URL, model: config.OLLAMA_MODEL });
    dashboard = await startDashboard(database, config.DASHBOARD_PORT, { config });
    console.error(`Nanobite local Inbox: http://127.0.0.1:${config.DASHBOARD_PORT} (mail=${config.MAIL_PROVIDER}, model=${config.MODEL_PROVIDER})`);
    if (config.MCP_HTTP_TOKEN) {
        mcpHttp = await startMcpHttp(database, { port: config.MCP_HTTP_PORT, token: config.MCP_HTTP_TOKEN, requesterIdentity: config.REQUESTER_IDENTITY, allowedHosts: config.MCP_HTTP_ALLOWED_HOSTS });
        console.error(`Nanobite MCP over HTTP: http://127.0.0.1:${config.MCP_HTTP_PORT}/mcp (bearer token required)`);
    }
    else
        console.error('Nanobite MCP over HTTP: disabled (set MCP_HTTP_TOKEN to enable); stdio MCP is available via npm run mcp');
    await runWorker({ db: database, config, drafter, clientFor: identity => clientForIdentity(identity, config, database), signal: abort.signal });
}
finally {
    await closeServer(mcpHttp);
    await closeServer(dashboard);
    db?.close();
    release();
}
