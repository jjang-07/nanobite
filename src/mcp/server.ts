import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { openDb, migrate } from '../db/db.ts';
import { createContextPrMcpServer } from './register.ts';
const db = openDb(process.env.CONTEXTPR_DB ?? './data/contextpr.db');
migrate(db);
const requesterIdentity = process.env.REQUESTER_IDENTITY ?? 'yunha-agent@startup.local';
if (!requesterIdentity)
    throw new Error('Missing REQUESTER_IDENTITY. Configure .env before starting the MCP server.');
await createContextPrMcpServer(db, requesterIdentity).connect(new StdioServerTransport());
