import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTranscript } from '../src/indexer/transcript.ts';
import { loadTranscriptFile, searchSources } from '../src/indexer/index.ts';
import { openDb, migrate } from '../src/db/db.ts';
const FIX = new URL('../demo/fixtures/bob-session.jsonl', import.meta.url);
test('parseTranscript extracts user/assistant/tool turns and never thinking', () => {
    const turns = parseTranscript(readFileSync(FIX, 'utf8'));
    assert.ok(turns.length >= 8);
    assert.ok(turns.some(t => t.role === 'user' && /Northwind/.test(t.text)));
    assert.ok(turns.some(t => t.role === 'tool' && /withRetry/.test(t.text)));
    assert.ok(turns.some(t => t.role === 'assistant_tool' && /^Read\(/.test(t.text)));
    assert.ok(!turns.some(t => /NEVER_LEAK_THIS_THINKING_TEXT/.test(t.text)));
    assert.ok(!turns.some(t => /file-history-snapshot/.test(t.text)));
});
test('load and search find the retry fix', () => {
    const db = openDb(':memory:');
    migrate(db);
    const r = loadTranscriptFile(db, 'sdk-help@acme.primitive.email', FIX.pathname);
    assert.ok(r.loaded >= 8);
    const ex = searchSources(db, 'sdk-help@acme.primitive.email', 'acme-sdk retries Why do concurrent retries create duplicate charges idempotency key SDK 2.3');
    assert.ok(ex.length > 0);
    assert.ok(ex.some(e => /preserveIdempotencyKey|idempotencyKey/.test(e.text)));
    assert.equal(searchSources(db, 'nobody@else.primitive.email', 'retries').length, 0);
});
