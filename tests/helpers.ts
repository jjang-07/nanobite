import { loadTranscriptFile } from '../src/indexer/index.ts';
import { seedRules } from '../src/gates/rules.ts';
import { FakeDrafter } from '../src/gates/draft.ts';
import { openDb, migrate, insertPr } from '../src/db/db.ts';
import { FakePrimitive } from '../src/primitive/fake.ts';
import { loadConfig } from '../src/config.ts';
import { encodeEnvelope } from '../src/envelope.ts';
export const config = loadConfig({ REQUESTER_IDENTITY: 'yunha-agent@startup.primitive.email', RESPONDER_IDENTITY: 'sdk-help@acme.primitive.email', APPROVER_EMAIL: 'tk@example.com', PRIMITIVE_API_KEY: 'test', POLL_WAIT_SECONDS: '0' });
export function setup() { const db = openDb(':memory:'); migrate(db); const mail = new FakePrimitive(); loadTranscriptFile(db, config.RESPONDER_IDENTITY, new URL('../demo/fixtures/tk-session.jsonl', import.meta.url).pathname); seedRules(db, new URL('../demo/fixtures/rules.sql', import.meta.url).pathname, config.RESPONDER_IDENTITY); return { db, mail, deps: { config, clientFor: () => mail, drafter: new FakeDrafter() } }; }
export function queued(db: ReturnType<typeof openDb>, id = 'cpr_test1') { insertPr(db, { id, state: 'queued', requester_identity: config.REQUESTER_IDENTITY, responder_identity: config.RESPONDER_IDENTITY, topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges with SDK 2.3?' }); return id; }
export function incoming(id = 'cpr_test1') { return { id: `in_${id}`, fromEmail: config.REQUESTER_IDENTITY, toEmail: config.RESPONDER_IDENTITY, bodyText: encodeEnvelope('request', { v: 1, id, topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges with SDK 2.3?', requester_identity: config.REQUESTER_IDENTITY }), subject: `[Nanobite ${id}] acme-sdk/retries` }; }
