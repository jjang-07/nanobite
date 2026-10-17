import type { DatabaseSync } from 'node:sqlite';
import type { Config } from '../config.ts';
import type { PrimitiveClient } from '../primitive/client.ts';
import type { Drafter } from '../types.ts';
import { sendQueuedRequests, pollDeliveries } from './requester.ts';
import { pollInbound, processReceived, pollApprovals, retryFinalized } from './responder.ts';
import { setTimeout } from 'node:timers/promises';
import { nowIso } from '../ids.ts';
import { transaction } from '../db/db.ts';
export interface Deps {
    clientFor: (identity: string) => PrimitiveClient;
    config: Config;
    drafter?: Drafter;
    now?: () => string;
}
export async function initializeCursor(db: DatabaseSync, deps: Deps) {
    const identity = deps.config.RESPONDER_IDENTITY;
    if (db.prepare('SELECT since FROM cursors WHERE identity=?').get(identity)?.since)
        return;
    const baseline = await deps.clientFor(identity).listInbound(identity, null, 0);
    // Primitive's forward cursor can be inclusive of the newest email (microsecond server time vs
    // millisecond API timestamps), so mail that predates this worker is marked seen, never replayed.
    transaction(db, () => {
        for (const item of baseline.items)
            db.prepare('INSERT OR IGNORE INTO inbound_seen(email_id,identity,seen_at) VALUES(?,?,?)').run(item.id, identity, nowIso());
        db.prepare('INSERT OR REPLACE INTO cursors(identity,since) VALUES(?,?)').run(identity, baseline.nextSince ?? `${nowIso()}|00000000-0000-0000-0000-000000000000`);
    });
}
export async function runCycle(db: DatabaseSync, deps: Deps) { for (const step of [sendQueuedRequests, pollInbound, pollApprovals, processReceived, retryFinalized, pollDeliveries]) {
    try {
        await step(db, deps);
    }
    catch (e) {
        console.error(`${step.name}: ${e instanceof Error ? e.message : 'worker error'}`);
    }
} }
export async function runWorker(deps: Deps & {
    db: DatabaseSync;
    signal?: AbortSignal;
}) { let initialized = false; while (!deps.signal?.aborted && !initialized) {
    try {
        await initializeCursor(deps.db, deps);
        initialized = true;
    }
    catch (e) {
        console.error(`initializeCursor: ${e instanceof Error ? e.message : 'worker error'}`);
        try {
            await setTimeout(1000, undefined, { signal: deps.signal });
        }
        catch {
            return;
        }
    }
} while (!deps.signal?.aborted) {
    await runCycle(deps.db, deps);
    try {
        await setTimeout(1000, undefined, { signal: deps.signal });
    }
    catch {
        break;
    }
} }
