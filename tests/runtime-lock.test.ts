import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireWorkerLock, assertWorkerStopped } from '../src/runtime-lock.ts';
import { resetDatabase } from '../scripts/reset.ts';
import { openDb, migrate, insertPr, listPrs } from '../src/db/db.ts';
function temporary(t: TestContext) {
    const directory = mkdtempSync(join(tmpdir(), 'nanobite-runtime-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    return join(directory, 'contextpr.db');
}
function seeded(path: string) {
    const db = openDb(path);
    migrate(db);
    insertPr(db, { id: 'cpr_preserve', state: 'queued', requester_identity: 'a@example.com', responder_identity: 'b@example.com', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges?' });
    db.close();
}
test('one worker owns a database and release allows another worker', t => {
    const path = temporary(t), release = acquireWorkerLock(path);
    assert.throws(() => acquireWorkerLock(path), /worker.*running|already.*running/i);
    assert.throws(() => assertWorkerStopped(path), /worker.*running|already.*running/i);
    release();
    release();
    assertWorkerStopped(path);
    const again = acquireWorkerLock(path);
    again();
    assert.equal(existsSync(`${path}.worker.lock`), false);
});
test('release never deletes another owner token', t => {
    const path = temporary(t), release = acquireWorkerLock(path), lock = `${path}.worker.lock`;
    const replacement = { ...JSON.parse(readFileSync(lock, 'utf8')), token: 'b'.repeat(64) };
    writeFileSync(lock, JSON.stringify(replacement));
    release();
    assert.deepEqual(JSON.parse(readFileSync(lock, 'utf8')), replacement);
});
test('only a valid marker for an exited process can be reclaimed', t => {
    const path = temporary(t), release = acquireWorkerLock(path), lock = `${path}.worker.lock`;
    const exited = spawnSync(process.execPath, ['-e', '']);
    assert.equal(exited.status, 0);
    const record = { ...JSON.parse(readFileSync(lock, 'utf8')), pid: exited.pid };
    writeFileSync(lock, JSON.stringify(record));
    assertWorkerStopped(path);
    const next = acquireWorkerLock(path);
    release();
    assert.equal(existsSync(lock), true);
    next();
    assert.equal(existsSync(lock), false);
});
test('unknown and symlink lock files are never removed', t => {
    const path = temporary(t), lock = `${path}.worker.lock`;
    writeFileSync(lock, 'unrelated file');
    assert.throws(() => acquireWorkerLock(path), /lock.*(invalid|unrecognized|safely)|unrecognized.*lock/i);
    assert.throws(() => assertWorkerStopped(path));
    assert.equal(readFileSync(lock, 'utf8'), 'unrelated file');
    rmSync(lock);
    const other = `${path}.other`;
    writeFileSync(other, 'keep');
    symlinkSync(other, lock);
    assert.throws(() => acquireWorkerLock(path), /symlink|symbolic|regular file/i);
    assert.equal(readFileSync(other, 'utf8'), 'keep');
});
test('memory databases do not create filesystem locks', () => {
    const first = acquireWorkerLock(':memory:'), second = acquireWorkerLock(':memory:');
    assertWorkerStopped(':memory:');
    first();
    second();
});
test('reset refuses an active worker without changing requests', t => {
    const path = temporary(t);
    seeded(path);
    const release = acquireWorkerLock(path);
    try {
        assert.throws(() => resetDatabase(path), /worker.*running|already.*running/i);
    }
    finally {
        release();
    }
    const db = openDb(path);
    assert.equal(listPrs(db).length, 1);
    db.close();
});
test('reset recreates the configured database and preserves adjacent files', t => {
    const path = temporary(t);
    seeded(path);
    writeFileSync(`${path}.backup`, 'preserve');
    resetDatabase(path);
    const db = openDb(path);
    assert.equal(listPrs(db).length, 0);
    db.close();
    assert.equal(readFileSync(`${path}.backup`, 'utf8'), 'preserve');
    assert.equal(existsSync(`${path}.worker.lock`), false);
});
test('reset refuses non-SQLite and symlink targets before deleting anything', t => {
    const path = temporary(t);
    writeFileSync(path, 'valuable text');
    assert.throws(() => resetDatabase(path), /SQLite/);
    assert.equal(readFileSync(path, 'utf8'), 'valuable text');
    rmSync(path);
    const target = `${path}.original`;
    seeded(target);
    symlinkSync(target, path);
    assert.throws(() => resetDatabase(path), /symlink|symbolic|regular file/i);
    const db = openDb(target);
    assert.equal(listPrs(db).length, 1);
    db.close();
});
test('reset refuses symlink sidecars and retains the database', t => {
    const path = temporary(t);
    seeded(path);
    const target = `${path}.unrelated`;
    writeFileSync(target, 'preserve');
    symlinkSync(target, `${path}-wal`);
    assert.throws(() => resetDatabase(path), /symlink|symbolic|regular file/i);
    assert.equal(existsSync(path), true);
    assert.equal(readFileSync(target, 'utf8'), 'preserve');
});
test('reset command uses the app default without model credentials', t => {
    const path = temporary(t), directory = join(path, '..'), defaultDb = join(directory, 'data', 'contextpr.db');
    seeded(defaultDb);
    const env = { ...process.env };
    delete env.CONTEXTPR_DB;
    delete env.ANTHROPIC_API_KEY;
    const run = spawnSync(process.execPath, [new URL('../scripts/reset.ts', import.meta.url).pathname], { env, cwd: directory, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const db = openDb(defaultDb);
    assert.equal(listPrs(db).length, 0);
    db.close();
});
