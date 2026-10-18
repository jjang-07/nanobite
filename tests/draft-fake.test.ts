import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDrafter, buildDraftPrompt, DraftSchema, DRAFT_SYSTEM } from '../src/gates/draft.ts';
import type { Draft, Excerpt } from '../src/types.ts';
const excerpts: Excerpt[] = [{ id: 'session:1', session_id: 'session', turn_index: 1, role: 'assistant', text: 'Set preserveIdempotencyKey: true.' }];
test('fake default and explicit drafts preserve the expected contract', async () => {
    const input = { question: 'How do I fix retries?', excerpts };
    const draft = await new FakeDrafter().draft(input);
    assert.match(draft.answer, /preserveIdempotencyKey/);
    assert.match(draft.answer, /\[another customer\]/);
    assert.ok(draft.flagged.includes('v2.5'));
    assert.deepEqual(draft.used_excerpt_ids, ['session:1']);
    const canned: Draft = { answer: 'exact replacement', summary: 'Plain summary.', why_relevant: 'A source matches.', confidence: 'high', used_excerpt_ids: ['session:1'], flagged: [] };
    assert.deepEqual(await new FakeDrafter(canned).draft(input), canned);
    assert.throws(() => DraftSchema.parse({ ...canned, extra: 'unexpected' }));
});
test('draft prompt identifies excerpts and treats their content as source data', () => {
    const prompt = buildDraftPrompt({ question: 'How do retries work?', context: 'Expected one charge', excerpts });
    assert.match(prompt, /session:1/);
    assert.match(prompt, /Expected one charge/);
    assert.match(prompt, /How do retries work/);
    assert.match(prompt, /source data|untrusted/i);
});
test('drafting instructions explain masked placeholders so the answer writes around them', () => {
    assert.match(DRAFT_SYSTEM, /\[sentence removed/);
    assert.match(DRAFT_SYSTEM, /never (copy|repeat) (a )?placeholder/i);
    assert.match(DRAFT_SYSTEM, /do not guess/i);
});
