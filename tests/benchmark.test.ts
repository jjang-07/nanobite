import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { FakeDrafter } from '../src/gates/draft.ts';
import { runBenchmark, renderBenchmark, chooseSimulatedReply } from '../scripts/benchmark.ts';
test('benchmark exercises exactly three local requests with explicitly simulated approvals', async () => {
    const report = await runBenchmark({ config: loadConfig({}), drafter: new FakeDrafter(), providerLabel: 'test double', modelLabel: 'fixture' });
    assert.equal(report.results.length, 3);
    for (const result of report.results) {
        assert.equal(result.status, 'passed', result.error ?? undefined);
        assert.equal(result.gates?.rules, true);
        assert.equal(result.gates?.minimize, true);
        assert.equal(result.gates?.human, true);
        assert.equal(result.approval?.simulated, true);
        assert.equal(result.approval?.decision, 'edit');
        assert.ok(result.approval!.typedCharacters > 7);
        assert.ok(!/v2\.5|Northwind|ACME-4821|NEVER_LEAK_THIS_THINKING_TEXT/.test(result.capsule!));
        assert.equal(result.sourceTokens, null);
        assert.equal(result.capsuleTokens, null);
    }
    const markdown = renderBenchmark(report);
    assert.match(markdown, /SIMULATED/);
    assert.match(markdown, /Claude.*unverified/i);
    assert.match(markdown, /N\/A/);
    assert.doesNotMatch(markdown, /token ratio/i);
});
test('simulated review records a full replacement and refuses unflagged unreleased content', () => {
    assert.deepEqual(chooseSimulatedReply('Use one key.', ['v2.5']), { bodyText: 'approve', text: 'Use one key.', decision: 'approve' });
    const edit = chooseSimulatedReply('Use one key. v2.5 is unreleased.', ['v2.5']);
    assert.equal(edit.text, 'Use one key.');
    assert.equal(edit.bodyText, 'edit\nUse one key.');
    assert.throws(() => chooseSimulatedReply('Use v2.5.', []), /unflagged/i);
});
test('benchmark records model failures without submitting simulated approvals or making success claims', async () => {
    const report = await runBenchmark({ config: loadConfig({}), drafter: { async draft() { throw new Error('model unavailable'); } }, providerLabel: 'test double', modelLabel: 'fixture' });
    assert.equal(report.results.length, 3);
    for (const result of report.results) {
        assert.equal(result.status, 'failed');
        assert.equal(result.capsule, null);
        assert.equal(result.approval, null);
        assert.equal(result.latencyMs, null);
    }
    assert.match(renderBenchmark(report), /3 failed/);
});
