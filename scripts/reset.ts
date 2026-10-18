import { lstatSync, openSync, readSync, closeSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquireWorkerLock, assertWorkerStopped } from '../src/runtime-lock.ts';
import { openDb, migrate } from '../src/db/db.ts';
function regularOrAbsent(path: string): boolean {
    try {
        const stat = lstatSync(path);
        if (stat.isSymbolicLink() || !stat.isFile())
            throw new Error(`Refusing reset: ${path} must be a regular file, never a symlink`);
        return true;
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return false;
        throw error;
    }
}
function assertSqlite(path: string) {
    const descriptor = openSync(path, 'r');
    try {
        const header = Buffer.alloc(16), bytes = readSync(descriptor, header, 0, header.length, 0);
        if (bytes !== 16 || !header.equals(Buffer.from('SQLite format 3\0')))
            throw new Error(`Refusing reset: ${path} is not a SQLite database`);
    }
    finally {
        closeSync(descriptor);
    }
}
/** Reset only the selected database and its two SQLite sidecars, while owning its lock. */
export function resetDatabase(databasePath: string): void {
    if (!databasePath.trim() || databasePath === ':memory:')
        throw new Error('Reset requires a persistent SQLite database path');
    const path = resolve(databasePath);
    assertWorkerStopped(path);
    const release = acquireWorkerLock(path);
    try {
        const targets = [path, `${path}-wal`, `${path}-shm`];
        const existing = targets.filter(regularOrAbsent);
        if (existing.includes(path))
            assertSqlite(path);
        // Validate every path before removing anything; an unsafe sidecar aborts the reset.
        for (const target of existing)
            unlinkSync(target);
        const db = openDb(path);
        try {
            migrate(db);
        }
        finally {
            db.close();
        }
    }
    finally {
        release();
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const path = process.env.CONTEXTPR_DB ?? './data/contextpr.db';
        resetDatabase(path);
        console.log(`Reset local Nanobite data at ${resolve(path)}. Run npm run seed to reload the synthetic fixture.`);
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : 'Reset failed');
        process.exitCode = 1;
    }
}
