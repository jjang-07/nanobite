import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { nowIso } from '../ids.ts';
export interface PrRow {
    id: string;
    state: string;
    requester_identity: string;
    responder_identity: string;
    on_behalf_of: string | null;
    topic: string;
    question: string;
    context_hint: string | null;
    request_sent_email_id: string | null;
    request_inbound_email_id: string | null;
    request_thread_id: string | null;
    matched_source_ids: string | null;
    draft_answer: string | null;
    draft_summary: string | null;
    draft_flagged: string | null;
    removals: string | null;
    approval_sent_email_id: string | null;
    approval_thread_id: string | null;
    decision: string | null;
    decision_reason: string | null;
    approved_text: string | null;
    approver: string | null;
    decided_at: string | null;
    capsule_sent_email_id: string | null;
    capsule_inbound_email_id: string | null;
    outcome_result: string | null;
    outcome_note: string | null;
    tokens_source: number | null;
    tokens_capsule: number | null;
    created_at: string;
    updated_at: string;
}
export type NewPr = Pick<PrRow, 'id' | 'state' | 'requester_identity' | 'responder_identity' | 'topic' | 'question'> & Partial<PrRow>;
export interface EventRow {
    id: number;
    pr_id: string;
    at: string;
    kind: string;
    detail: string;
}
const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const columns = new Set(sql.split('CREATE TABLE IF NOT EXISTS sources')[0].match(/^  \w+ /gm)?.map(s => s.trim()) ?? []);
export function openDb(path: string): DatabaseSync {
    if (path !== ':memory:')
        mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    return db;
}
/** Creates tables, then adds columns introduced after a database was first created. */
export function migrate(db: DatabaseSync) {
    db.exec(sql);
    const have = new Set(db.prepare('PRAGMA table_info(context_prs)').all().map((c: any) => String(c.name)));
    if (!have.has('draft_summary'))
        db.exec('ALTER TABLE context_prs ADD COLUMN draft_summary TEXT');
    const ruleColumns = new Set(db.prepare('PRAGMA table_info(denylist)').all().map((c: any) => String(c.name)));
    if (!ruleColumns.has('enabled'))
        db.exec('ALTER TABLE denylist ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
    if (!ruleColumns.has('is_custom'))
        db.exec('ALTER TABLE denylist ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0');
}
function entries(value: Record<string, unknown>) {
    return Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => {
        if (!columns.has(k))
            throw new Error(`Unknown PR column: ${k}`);
        return [k, v] as [
            string,
            string | number | null
        ];
    });
}
export function insertPr(db: DatabaseSync, pr: NewPr) {
    const e = entries({ ...pr, created_at: pr.created_at ?? nowIso(), updated_at: nowIso() });
    db.prepare(`INSERT INTO context_prs (${e.map(([k]) => k).join(',')}) VALUES (${e.map(() => '?').join(',')})`).run(...e.map(([, v]) => v));
}
export function getPr(db: DatabaseSync, id: string): PrRow | null { return db.prepare('SELECT * FROM context_prs WHERE id=?').get(id) as unknown as PrRow ?? null; }
export function updatePr(db: DatabaseSync, id: string, patch: Partial<PrRow>) {
    if ('id' in patch || 'created_at' in patch)
        throw new Error('Cannot change PR identity or creation time');
    const e = entries({ ...patch, updated_at: nowIso() });
    db.prepare(`UPDATE context_prs SET ${e.map(([k]) => `${k}=?`).join(',')} WHERE id=?`).run(...e.map(([, v]) => v), id);
}
export function listPrs(db: DatabaseSync, opts: {
    state?: string;
    limit?: number;
} = {}): PrRow[] {
    const limit = opts.limit ?? 50;
    return (opts.state ? db.prepare('SELECT * FROM context_prs WHERE state=? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(opts.state, limit)
        : db.prepare('SELECT * FROM context_prs ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit)) as unknown as PrRow[];
}
export function addEvent(db: DatabaseSync, prId: string, kind: string, detail?: unknown) { db.prepare('INSERT INTO events(pr_id,at,kind,detail) VALUES(?,?,?,?)').run(prId, nowIso(), kind, JSON.stringify(detail ?? null)); }
export function listEvents(db: DatabaseSync, prId: string): EventRow[] { return db.prepare('SELECT * FROM events WHERE pr_id=? ORDER BY id').all(prId) as unknown as EventRow[]; }
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
