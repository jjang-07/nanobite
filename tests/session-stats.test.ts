import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionStats } from '../scripts/session-stats.ts';
const line = (type: string, content: unknown) => JSON.stringify({ type, sessionId: 's', timestamp: '2026-10-17T00:00:00Z', message: { role: type, content } });
test('session stats count extracted characters per session, never thinking, and report only aggregates', () => {
    const root = mkdtempSync(join(tmpdir(), 'cpr-stats-'));
    try {
        mkdirSync(join(root, 'proj-a')); mkdirSync(join(root, 'proj-b'));
        const pad = 'x'.repeat(1000);
        writeFileSync(join(root, 'proj-a', 'one.jsonl'), [line('user', 'a'.repeat(100)), line('assistant', [{ type: 'thinking', thinking: 'SECRET'.repeat(500) }, { type: 'text', text: 'b'.repeat(100) }]), pad && ''].join('\n'));
        writeFileSync(join(root, 'proj-b', 'two.jsonl'), [line('user', 'c'.repeat(400)), line('assistant', [{ type: 'text', text: 'd'.repeat(600) }])].join('\n'));
        writeFileSync(join(root, 'proj-b', 'tiny.jsonl'), 'x');
        const s = sessionStats(root);
        assert.equal(s.sessions, 2, 'files under 100 bytes are skipped');
        assert.deepEqual(s.characters, [200, 1000]);
        assert.equal(s.median, 200);
        assert.equal(JSON.stringify(s).includes('SECRET'), false);
        assert.equal(JSON.stringify(s).includes('proj-'), false, 'no project names or paths in the output');
    }
    finally { rmSync(root, { recursive: true, force: true }); }
});
