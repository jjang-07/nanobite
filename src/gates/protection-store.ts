import type { DatabaseSync } from 'node:sqlite';
import type { Rule } from './rules.ts';
export interface ProtectionRule extends Rule {
    id: number;
    responder_identity: string;
    note: string | null;
    enabled: number;
    is_custom: number;
}
export interface ProtectionInput { kind: string; pattern: string; placeholder: string; note?: string; }
export function listProtectionRules(db: DatabaseSync, responder: string): ProtectionRule[] {
    return db.prepare('SELECT * FROM denylist WHERE responder_identity=? ORDER BY is_custom DESC,id DESC').all(responder) as unknown as ProtectionRule[];
}
export function saveProtectionRule(db: DatabaseSync, responder: string, input: ProtectionInput, id?: number): number {
    const kind = input.kind, pattern = input.pattern.trim(), placeholder = input.placeholder.trim(), note = (input.note ?? '').trim();
    if (!['literal', 'sentence'].includes(kind)) throw new Error('Choose Replace text or Remove a sentence.');
    if (!pattern || pattern.length > 500 || /[\r\n]/.test(pattern)) throw new Error('Enter protected text on one line, up to 500 characters.');
    if (!/^\[[^\[\]\r\n]{1,60}\]$/.test(placeholder)) throw new Error('Use a short replacement in brackets, such as [customer] or [internal].');
    if (note.length > 200) throw new Error('Keep the note under 200 characters.');
    if (id !== undefined && !db.prepare('SELECT 1 FROM denylist WHERE id=? AND responder_identity=? AND is_custom=1').get(id, responder)) throw new Error('Custom rule not found for this responder.');
    if (db.prepare('SELECT 1 FROM denylist WHERE responder_identity=? AND kind=? AND lower(pattern)=lower(?) AND is_custom=1 AND id!=?').get(responder, kind, pattern, id ?? -1)) throw new Error('This custom rule already exists. Edit or enable the existing rule.');
    if (id !== undefined) {
        db.prepare('UPDATE denylist SET kind=?,pattern=?,placeholder=?,note=? WHERE id=? AND responder_identity=? AND is_custom=1').run(kind, pattern, placeholder, note || null, id, responder);
        return id;
    }
    return Number(db.prepare('INSERT INTO denylist(responder_identity,kind,pattern,placeholder,note,is_custom) VALUES(?,?,?,?,?,1)').run(responder, kind, pattern, placeholder, note || null).lastInsertRowid);
}
export function setProtectionRuleEnabled(db: DatabaseSync, responder: string, id: number, enabled: boolean) {
    if (!db.prepare('UPDATE denylist SET enabled=? WHERE id=? AND responder_identity=?').run(enabled ? 1 : 0, id, responder).changes) throw new Error('Rule not found for this responder.');
}
