import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaDrafter } from '../src/gates/draft.ts';
import type { Excerpt } from '../src/types.ts';
const excerpts: Excerpt[] = [{ id: 's:1', session_id: 's', turn_index: 1, role: 'assistant', text: 'Set preserveIdempotencyKey: true.' }];
const input = { question: 'How do I fix retry duplicates?', excerpts };
const draft = { answer: 'Set preserveIdempotencyKey: true.', summary: 'Reuse one key across retries.', why_relevant: 'The source covers retries.', confidence: 'high', used_excerpt_ids: ['s:1'], flagged: [] };
function mockFetch(content: unknown = draft, extra: Record<string, unknown> = {}) {
    const calls: {
        url: string;
        init: RequestInit;
    }[] = [];
    const fetchImpl = (async (url: any, init: RequestInit = {}) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(String(url).endsWith('/api/tags') ? { models: [{ name: 'qwen3:4b', size: 2500000000 }] } : { model: 'qwen3:4b', message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) }, done: true, done_reason: 'stop', prompt_eval_count: 120, eval_count: 45, total_duration: 250000000, ...extra }), { status: 200 }); }) as typeof fetch;
    return { calls, fetchImpl };
}
test('Ollama discovers an installed local model, requests schema output and records real usage', async () => {
    const mock = mockFetch();
    const d = new OllamaDrafter({ fetchImpl: mock.fetchImpl });
    assert.deepEqual(await d.draft(input), draft);
    assert.equal(mock.calls[0].url, 'http://127.0.0.1:11434/api/tags');
    const request = JSON.parse(String(mock.calls[1].init.body));
    assert.equal(mock.calls[1].url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(request.model, 'qwen3:4b');
    assert.equal(request.stream, false);
    assert.equal(request.think, false);
    assert.equal(request.options.temperature, 0);
    assert.ok(request.options.num_predict > 0);
    assert.equal(request.format.type, 'object');
    assert.equal(request.format.additionalProperties, false);
    assert.match(request.messages[1].content, /s:1/);
    assert.deepEqual(d.lastUsage, { model: 'qwen3:4b', promptTokens: 120, outputTokens: 45, durationMs: 250 });
});
test('Ollama rejects malformed drafts, foreign source ids, incomplete generation and missing local models', async () => {
    for (const content of ['not json', { ...draft, used_excerpt_ids: ['other:9'] }, { ...draft, extra: true }]) {
        const d = new OllamaDrafter({ model: 'qwen3:4b', fetchImpl: mockFetch(content).fetchImpl });
        await assert.rejects(() => d.draft(input), /draft|source|JSON|schema/i);
    }
    const truncated = new OllamaDrafter({ fetchImpl: mockFetch(draft, { done_reason: 'length' }).fetchImpl });
    await assert.rejects(() => truncated.draft(input), /incomplete|limit/i);
    const empty = new OllamaDrafter({ fetchImpl: (async () => new Response(JSON.stringify({ models: [] }))) as typeof fetch });
    await assert.rejects(() => empty.draft(input), /installed local model/i);
});
test('Ollama refuses remote endpoints and cloud models without making a request', async () => {
    const fail = (async () => { throw new Error('must not fetch'); }) as typeof fetch;
    assert.throws(() => new OllamaDrafter({ baseUrl: 'https://ollama.com', fetchImpl: fail }), /local|loopback/i);
    assert.throws(() => new OllamaDrafter({ model: 'qwen3-coder:480b-cloud', fetchImpl: fail }), /cloud/i);
    const cloud = new OllamaDrafter({ fetchImpl: (async () => new Response(JSON.stringify({ models: [{ name: 'cloud-alias', remote_host: 'https://ollama.com' }] }))) as typeof fetch });
    await assert.rejects(() => cloud.draft(input), /installed local model/i);
});
test('Ollama never invents absent usage counts', async () => {
    const mock = mockFetch(draft, { prompt_eval_count: undefined, eval_count: undefined, total_duration: undefined });
    const d = new OllamaDrafter({ fetchImpl: mock.fetchImpl });
    await d.draft(input);
    assert.deepEqual(d.lastUsage, { model: 'qwen3:4b', promptTokens: null, outputTokens: null, durationMs: null });
});
