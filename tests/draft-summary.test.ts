import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, queued, incoming } from './helpers.ts';
import { getPr, openDb, migrate } from '../src/db/db.ts';
import { DraftSchema, FakeDrafter } from '../src/gates/draft.ts';
import { pollInbound, processReceived } from '../src/pipeline/responder.ts';
test('every draft carries a plain-language summary for the approver', async () => {
    const base = { answer: 'Pass one key.', why_relevant: 'Covers retries.', confidence: 'high', used_excerpt_ids: ['s:1'], flagged: [] };
    assert.equal(DraftSchema.safeParse(base).success, false, 'summary is required');
    assert.equal(DraftSchema.safeParse({ ...base, summary: 'Each retry is treated as a new payment. Reuse one key.' }).success, true);
    const fake = await new FakeDrafter().draft({ question: 'q', excerpts: [{ id: 's:1', session_id: 's', turn_index: 1, role: 'assistant', text: 'x' }] });
    assert.ok(fake.summary.length > 0);
});
test('the summary passes the rules gate and is stored next to the exact draft', async () => {
    const s = setup();
    const id = queued(s.db);
    s.mail.deliverInbound(incoming(id));
    await pollInbound(s.db, s.deps);
    const drafter = { async draft(input: any) { return { answer: 'Reuse one idempotency key.', summary: 'Northwind hit this too: every retry looked like a new payment. Reuse one key.', why_relevant: 'Same bug.', confidence: 'high' as const, used_excerpt_ids: [input.excerpts[0].id], flagged: [] }; } };
    await processReceived(s.db, { ...s.deps, drafter });
    const p = getPr(s.db, id)!;
    assert.equal(p.state, 'awaiting_approval');
    assert.match(p.draft_summary!, /^\[another customer\] hit this too/);
    assert.equal(p.draft_answer, 'Reuse one idempotency key.');
});
test('migrate adds the summary column to a database created before it existed', () => {
    const db = openDb(':memory:'); migrate(db);
    db.exec('ALTER TABLE context_prs DROP COLUMN draft_summary');
    migrate(db);
    const cols = db.prepare('PRAGMA table_info(context_prs)').all().map((c: any) => c.name);
    assert.ok(cols.includes('draft_summary'));
});
import { renderPr } from '../src/dashboard/render.ts';
test('the request page shows the plain summary above the exact draft, labeled as not sent', () => {
    const s = setup(); const id = queued(s.db);
    s.db.prepare("UPDATE context_prs SET state='awaiting_approval', draft_answer='EXACT', draft_summary='PLAIN WORDS' WHERE id=?").run(id);
    const html = renderPr(getPr(s.db, id)!, [], { config: s.deps.config });
    assert.ok(html.indexOf('PLAIN WORDS') > 0 && html.indexOf('PLAIN WORDS') < html.indexOf('EXACT'));
    assert.match(html, /not sent/);
});
