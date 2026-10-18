import { constants, openSync, closeSync, writeFileSync, readFileSync, lstatSync, fstatSync, unlinkSync, mkdirSync, realpathSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { dirname, basename, resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
interface WorkerLock {
    kind: 'contextpr-worker-lock';
    version: 1;
    pid: number;
    token: string;
    database: string;
}
interface ExistingLock {
    record: WorkerLock;
    stat: Stats;
}
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
function locations(databasePath: string, createParent = false) {
    if (!databasePath.trim())
        throw new Error('A database path is required');
    const absolute = resolve(databasePath), parent = dirname(absolute);
    if (createParent)
        mkdirSync(parent, { recursive: true });
    let canonicalParent = parent;
    try {
        canonicalParent = realpathSync(parent);
    }
    catch (error) {
        if (!missing(error))
            throw error;
    }
    const database = join(canonicalParent, basename(absolute));
    return { database, lock: `${database}.worker.lock` };
}
function readLock(path: string, database: string): ExistingLock | null {
    let stat: Stats;
    try {
        stat = lstatSync(path);
    }
    catch (error) {
        if (missing(error))
            return null;
        throw error;
    }
    if (stat.isSymbolicLink() || !stat.isFile())
        throw new Error('Worker lock must be a regular file, never a symlink');
    let record: Partial<WorkerLock>;
    try {
        record = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        throw new Error('Worker lock is invalid; refusing to remove an unrecognized file');
    }
    if (!record || record.kind !== 'contextpr-worker-lock' || record.version !== 1 || record.database !== database || !Number.isInteger(record.pid) || record.pid! < 1 || typeof record.token !== 'string' || !/^[a-f0-9]{64}$/.test(record.token)) {
        throw new Error('Worker lock is invalid; refusing to remove an unrecognized file');
    }
    return { record: record as WorkerLock, stat };
}
function alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ESRCH')
            return false;
        if (code === 'EPERM')
            return true;
        throw error;
    }
}
function running(pid: number): Error {
    return new Error(`A Nanobite worker is already running for this database (PID ${pid}). Stop that worker before starting another worker or resetting its data.`);
}
function removeMatching(path: string, database: string, expected: ExistingLock): boolean {
    const current = readLock(path, database);
    if (!current)
        return false;
    if (current.record.token !== expected.record.token || current.record.pid !== expected.record.pid || current.stat.dev !== expected.stat.dev || current.stat.ino !== expected.stat.ino)
        return false;
    unlinkSync(path);
    return true;
}
/** A live worker owns the persistent database; stale, recognized locks are reclaimable. */
export function acquireWorkerLock(databasePath: string): () => void {
    if (databasePath === ':memory:')
        return () => { };
    const { database, lock } = locations(databasePath, true);
    try {
        if (lstatSync(database).isSymbolicLink())
            throw new Error('Database must not be a symlink');
    }
    catch (error) {
        if (!missing(error))
            throw error;
    }
    const token = randomBytes(32).toString('hex');
    const record: WorkerLock = { kind: 'contextpr-worker-lock', version: 1, pid: process.pid, token, database };
    for (let attempt = 0; attempt < 3; attempt++) {
        let descriptor: number;
        try {
            descriptor = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error;
            const previous = readLock(lock, database);
            if (!previous)
                continue;
            if (alive(previous.record.pid))
                throw running(previous.record.pid);
            if (!removeMatching(lock, database, previous))
                throw new Error('Worker lock changed while checking it; retry after the other operation finishes');
            continue;
        }
        let owned: ExistingLock;
        try {
            writeFileSync(descriptor, JSON.stringify(record) + '\n');
            owned = { record, stat: fstatSync(descriptor) };
        }
        finally {
            closeSync(descriptor);
        }
        let released = false;
        return () => {
            if (released)
                return;
            released = true;
            try {
                removeMatching(lock, database, owned);
            }
            catch (error) {
                if (missing(error))
                    return;
                // A changed or unrecognized lock belongs to someone else; leave it intact.
                if (error instanceof Error && /Worker lock/.test(error.message))
                    return;
                throw error;
            }
        };
    }
    throw new Error('Could not acquire the worker lock; another operation is changing it');
}
/** Read-only stop guard used before destructive demo resets. */
export function assertWorkerStopped(databasePath: string): void {
    if (databasePath === ':memory:')
        return;
    const { database, lock } = locations(databasePath), existing = readLock(lock, database);
    if (existing && alive(existing.record.pid))
        throw running(existing.record.pid);
}
