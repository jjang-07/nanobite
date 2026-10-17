import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parseTranscriptWithStats } from './transcript.ts';
import type { Excerpt } from '../types.ts';
import { transaction } from '../db/db.ts';
export function loadTranscriptFile(db: DatabaseSync, ownerIdentity: string, filePath: string) {
    const { turns, skipped } = parseTranscriptWithStats(readFileSync(filePath, 'utf8'));
    transaction(db, () => { const stmt = db.prepare('INSERT OR REPLACE INTO sources(id,owner_identity,session_id,file_path,turn_index,role,text,timestamp) VALUES(?,?,?,?,?,?,?,?)'); for (const t of turns) {
        const id = `${t.sessionId}:${t.index}`;
        const old = db.prepare('SELECT owner_identity FROM sources WHERE id=?').get(id);
        if (old && old.owner_identity !== ownerIdentity)
            throw new Error('Transcript session already belongs to another identity');
        stmt.run(id, ownerIdentity, t.sessionId, filePath, t.index, t.role, t.text, t.timestamp);
    } });
    if (skipped)
        console.error(`Transcript loader: skipped ${skipped} malformed lines`);
    return { loaded: turns.length, skipped };
}
const stop = new Set('the and for that with this from why how what when where does are can you your have into get got our'.split(' '));
export function searchSources(db: DatabaseSync, ownerIdentity: string, query: string, limit = 8): Excerpt[] {
    const tokens = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !stop.has(t)))];
    const all = db.prepare('SELECT id,session_id,turn_index,role,text FROM sources WHERE owner_identity=? ORDER BY session_id,turn_index').all(ownerIdentity) as unknown as Excerpt[];
    const hits = all.map((e, i) => ({ i, score: tokens.filter(t => e.text.toLowerCase().includes(t)).length })).filter(h => h.score >= 2).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit);
    const selected = new Set<number>();
    for (const h of hits)
        for (const n of [h.i - 1, h.i, h.i + 1])
            if (all[n]?.session_id === all[h.i].session_id)
                selected.add(n);
    let remaining = 6000;
    const result: Excerpt[] = [];
    for (const i of [...selected].sort((a, b) => a - b)) {
        if (!remaining)
            break;
        const e = all[i];
        const text = e.text.slice(0, remaining);
        result.push({ ...e, text });
        remaining -= text.length;
    }
    return result;
}
