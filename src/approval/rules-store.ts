import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { nowIso } from '../ids.ts';
export interface AutoRule {
    id: string;
    responder_identity: string;
    requester_identity: string;
    topic: string;
    created_by: string;
    created_from_pr: string;
    created_at: string;
    revoked_at: string | null;
}
export function findRule(db: DatabaseSync, responder: string, requester: string, topic: string): AutoRule | null { return db.prepare('SELECT * FROM rules WHERE responder_identity=? AND requester_identity=? AND topic=? AND revoked_at IS NULL').get(responder, requester, topic) as unknown as AutoRule ?? null; }
export function createRule(db: DatabaseSync, responder: string, requester: string, topic: string, createdBy: string, prId: string): AutoRule {
    const active = findRule(db, responder, requester, topic);
    if (active)
        return active;
    db.prepare('INSERT INTO rules(id,responder_identity,requester_identity,topic,created_by,created_from_pr,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(responder_identity,requester_identity,topic) DO UPDATE SET id=excluded.id,created_by=excluded.created_by,created_from_pr=excluded.created_from_pr,created_at=excluded.created_at,revoked_at=NULL').run(`rule_${randomUUID()}`, responder, requester, topic, createdBy, prId, nowIso());
    return findRule(db, responder, requester, topic)!;
}
export function revokeRule(db: DatabaseSync, id: string) { db.prepare('UPDATE rules SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(nowIso(), id); }

export function listApprovalRules(db: DatabaseSync, responder: string): AutoRule[] {
    return db.prepare('SELECT * FROM rules WHERE responder_identity=? AND revoked_at IS NULL ORDER BY created_at DESC').all(responder) as unknown as AutoRule[];
}
export function createManualApprovalRule(db: DatabaseSync, responder: string, requester: string, topic: string, author: string, confirmed: boolean): AutoRule {
    requester = requester.trim(); topic = topic.trim();
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(requester) || requester.length > 254 || requester.includes('*')) throw new Error('Enter the exact requester email address.');
    if (!/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(topic) || topic.length > 120) throw new Error('Enter an exact topic using lowercase words, hyphens, or slashes. Wildcards are not supported.');
    if (!confirmed) throw new Error('Confirm that matching answers may be sent without a fresh review.');
    return createRule(db, responder, requester, topic, author, 'manual');
}
export function revokeScopedRule(db: DatabaseSync, responder: string, id: string) {
    if (!db.prepare('SELECT 1 FROM rules WHERE id=? AND responder_identity=? AND revoked_at IS NULL').get(id, responder)) throw new Error('Approval rule not found for this responder.');
    revokeRule(db, id);
}
