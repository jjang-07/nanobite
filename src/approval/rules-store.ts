import type {DatabaseSync} from 'node:sqlite';import {randomUUID} from 'node:crypto';import {nowIso} from '../ids.ts';
export interface AutoRule {id:string;responder_identity:string;requester_identity:string;topic:string;created_by:string;created_from_pr:string;created_at:string;revoked_at:string|null;}
export function findRule(db:DatabaseSync,responder:string,requester:string,topic:string):AutoRule|null{return db.prepare('SELECT * FROM rules WHERE responder_identity=? AND requester_identity=? AND topic=? AND revoked_at IS NULL').get(responder,requester,topic) as unknown as AutoRule??null;}
export function createRule(db:DatabaseSync,responder:string,requester:string,topic:string,createdBy:string,prId:string):AutoRule{
 const active=findRule(db,responder,requester,topic);if(active)return active;
 db.prepare('INSERT INTO rules(id,responder_identity,requester_identity,topic,created_by,created_from_pr,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(responder_identity,requester_identity,topic) DO UPDATE SET id=excluded.id,created_by=excluded.created_by,created_from_pr=excluded.created_from_pr,created_at=excluded.created_at,revoked_at=NULL').run(`rule_${randomUUID()}`,responder,requester,topic,createdBy,prId,nowIso());return findRule(db,responder,requester,topic)!;
}
export function revokeRule(db:DatabaseSync,id:string){db.prepare('UPDATE rules SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(nowIso(),id);}
