import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnthropicDrafter } from '../src/gates/draft.ts';
import type { Excerpt } from '../src/types.ts';
const excerpts: Excerpt[] = [{ id: 's:1', session_id: 's', turn_index: 1, role: 'assistant', text: 'Set preserveIdempotencyKey: true.' }];
const input = { question: 'How do I fix retry duplicates?', excerpts };
const draft = { answer: 'Set preserveIdempotencyKey: true.', summary: 'Reuse one key across retries.', why_relevant: 'The source covers retries.', confidence: 'high' as const, used_excerpt_ids: ['s:1'], flagged: [] };
function fakeClient(response: Record<string, unknown>) {
    const calls: any[] = [];
    return { calls, client: { messages: { parse: async (params: any) => { calls.push(params); return response; } } } };
}
test('Anthropic drafter records real usage, counting cached prompt tokens', async () => {
    const fake = fakeClient({ model: 'claude-opus-5-5', stop_reason: 'end_turn', parsed_output: draft, usage: { input_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 276, output_tokens: 140 } });
    const d = new AnthropicDrafter({ model: 'claude-opus-5-5', client: fake.client });
    assert.deepEqual(await d.draft(input), draft);
    assert.equal(fake.calls[0].model, 'claude-opus-5-5');
    assert.equal(fake.calls[0].thinking, undefined);
    assert.equal(fake.calls[0].output_config.effort, 'medium');
    assert.equal(d.lastUsage?.model, 'claude-opus-5-5');
    assert.equal(d.lastUsage?.promptTokens, 1176);
    assert.equal(d.lastUsage?.outputTokens, 140);
    assert.equal(d.lastUsage?.durationMs, null);
});
test('Anthropic drafter never invents absent usage and clears usage on failure', async () => {
    const d = new AnthropicDrafter({ client: fakeClient({ model: 'claude-opus-5-5', stop_reason: 'end_turn', parsed_output: draft }).client });
    await d.draft(input);
    assert.deepEqual(d.lastUsage, { model: 'claude-opus-5-5', promptTokens: null, outputTokens: null, durationMs: null });
    const refused = new AnthropicDrafter({ client: fakeClient({ model: 'claude-opus-5-5', stop_reason: 'refusal', parsed_output: null, usage: { input_tokens: 5, output_tokens: 0 } }).client });
    await assert.rejects(() => refused.draft(input), /draft_failed/);
    assert.equal(refused.lastUsage, null);
});
