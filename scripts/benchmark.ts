import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config.ts';
import type { Config } from '../src/config.ts';
import { openDb, migrate, getPr, listEvents } from '../src/db/db.ts';
import { loadTranscriptFile } from '../src/indexer/index.ts';
import { parseTranscript } from '../src/indexer/transcript.ts';
import { seedRules } from '../src/gates/rules.ts';
import { AnthropicDrafter, OllamaDrafter } from '../src/gates/draft.ts';
import type { DraftUsage } from '../src/gates/draft.ts';
import type { Drafter } from '../src/types.ts';
import { createLocalClient, listLocalInbox, submitLocalReply } from '../src/primitive/local.ts';
import { initializeCursor } from '../src/pipeline/worker.ts';
import { sendQueuedRequests, pollDeliveries } from '../src/pipeline/requester.ts';
import { pollInbound, processReceived, pollApprovals } from '../src/pipeline/responder.ts';
import { requestContext, getContextRequest } from '../src/mcp/tools.ts';
const fixture = new URL('../demo/fixtures/tk-session.jsonl', import.meta.url);
const rules = new URL('../demo/fixtures/rules.sql', import.meta.url);
const sourceText = parseTranscript(readFileSync(fixture, 'utf8')).map(turn => turn.text).join('\n');
const characters = (text: string) => [...text].length;
const protectedFixture = /Northwind|ACME-4821|NEVER_LEAK_THIS_THINKING_TEXT|40k\s+charges|their CTO/i;
const unreleased = /\bv2\.5\b|\bunreleased\b/i;
export const questions = [
    { label: 'Retries / idempotency', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges in SDK 2.3, and how do I preserve one idempotency key?' },
    { label: 'Timeout configuration', topic: 'acme-sdk/timeout', question: 'How should I configure timeoutMs in createClient for the synthetic timeout and retry regression test?' },
    { label: 'Fix location', topic: 'acme-sdk/fix-location', question: 'Which source file contains the SDK retry fix, and what should its regression test assert?' },
] as const;
export function chooseSimulatedReply(answer: string, flagged: string[]): {
    bodyText: string;
    text: string;
    decision: 'approve' | 'edit';
} {
    assert.ok(!protectedFixture.test(answer), 'Protected fixture content survived the rules gate');
    if (!unreleased.test(answer))
        return { bodyText: 'approve', text: answer, decision: 'approve' };
    assert.ok(flagged.some(flag => unreleased.test(flag)), 'Unflagged unreleased content needs real human judgment; benchmark refuses automatic approval');
    // This deterministic policy stands in for a human editing the flagged sentence.
    // The complete replacement and typed character count are recorded in the report.
    const replacement = answer.split(/((?<=[.!?])\s+|\n)/).map(part => unreleased.test(part) ? '' : part).join('').trim();
    assert.ok(replacement.length > 0, 'Simulated review removed the whole answer; real human review is needed');
    assert.ok(!unreleased.test(replacement), 'Simulated replacement still contains unreleased content');
    return { bodyText: `edit\n${replacement}`, text: replacement, decision: 'edit' };
}
export interface BenchmarkOptions {
    config: Config;
    drafter: Drafter;
    providerLabel: string;
    modelLabel: string;
    countTokens?: (text: string) => Promise<number>;
    getUsage?: () => DraftUsage | null;
}
export interface BenchmarkResult {
    label: string;
    question: string;
    status: 'passed' | 'failed';
    error: string | null;
    sourceCharacters: number;
    capsuleCharacters: number | null;
    sourceTokens: number | null;
    capsuleTokens: number | null;
    tokenCountError: string | null;
    latencyMs: number | null;
    attemptMs: number;
    modelCallMs: number | null;
    usage: DraftUsage | null;
    draft: string | null;
    flagged: string[];
    capsule: string | null;
    gates: {
        rules: boolean;
        minimize: boolean;
        human: boolean;
    } | null;
    approval: {
        simulated: true;
        decision: 'approve' | 'edit';
        typedCharacters: number;
        bodyText: string;
    } | null;
}
export interface BenchmarkReport {
    generatedAt: string;
    provider: string;
    model: string;
    sourceCharacters: number;
    sourceTokens: number | null;
    sourceTokenCountError: string | null;
    results: BenchmarkResult[];
}
function safeError(error: unknown, secrets: string[]): string {
    let message = error instanceof Error ? error.message : 'Unknown benchmark failure';
    for (const secret of secrets)
        if (secret)
            message = message.replaceAll(secret, '[redacted]');
    return message.replace(/\b(?:sk-ant-|prim_)[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 1200);
}
export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkReport> {
    const config = { ...options.config, MAIL_PROVIDER: 'local' as const, POLL_WAIT_SECONDS: 0 };
    const secrets = [config.ANTHROPIC_API_KEY, config.PRIMITIVE_API_KEY, config.PRIMITIVE_API_KEY_REQUESTER, config.PRIMITIVE_API_KEY_RESPONDER];
    const report: BenchmarkReport = { generatedAt: new Date().toISOString(), provider: options.providerLabel, model: options.modelLabel, sourceCharacters: characters(sourceText), sourceTokens: null, sourceTokenCountError: null, results: [] };
    if (options.countTokens) {
        try {
            report.sourceTokens = await options.countTokens(sourceText);
        }
        catch (e) {
            report.sourceTokenCountError = safeError(e, secrets);
        }
    }
    for (const task of questions) {
        const db = openDb(':memory:');
        migrate(db);
        const row: BenchmarkResult = { label: task.label, question: task.question, status: 'failed', error: null, sourceCharacters: report.sourceCharacters, capsuleCharacters: null, sourceTokens: report.sourceTokens, capsuleTokens: null, tokenCountError: null, latencyMs: null, attemptMs: 0, modelCallMs: null, usage: null, draft: null, flagged: [], capsule: null, gates: null, approval: null };
        report.results.push(row);
        let start = performance.now();
        let modelCalled = false;
        try {
            loadTranscriptFile(db, config.RESPONDER_IDENTITY, fixture.pathname);
            seedRules(db, rules.pathname, config.RESPONDER_IDENTITY);
            const drafter: Drafter = { async draft(input) {
                    assert.ok(input.excerpts.length > 0, 'Minimization must have matching sources');
                    assert.ok(!protectedFixture.test(input.excerpts.map(e => e.text).join('\n')), 'Protected fixture content reached the model');
                    modelCalled = true;
                    const began = performance.now();
                    try {
                        return await options.drafter.draft(input);
                    }
                    finally {
                        row.modelCallMs = performance.now() - began;
                        row.usage = options.getUsage?.() ?? null;
                    }
                } };
            const deps = { config, drafter, clientFor: (identity: string) => createLocalClient(db, identity) };
            await initializeCursor(db, deps);
            start = performance.now();
            const request = requestContext(db, { responder: config.RESPONDER_IDENTITY, topic: task.topic, question: task.question }, { requesterIdentity: config.REQUESTER_IDENTITY });
            assert.ok(!request.isError, 'Request creation failed');
            const id = String(request.structured.id);
            await sendQueuedRequests(db, deps);
            await pollInbound(db, deps);
            await processReceived(db, deps);
            const pending = getPr(db, id)!;
            assert.equal(pending.state, 'awaiting_approval', `Expected approval gate; got ${pending.state}: ${pending.decision_reason ?? ''}`);
            assert.equal(pending.capsule_sent_email_id, null, 'Capsule left before human approval');
            await pollApprovals(db, deps);
            await pollDeliveries(db, deps);
            assert.equal(getPr(db, id)!.state, 'awaiting_approval', 'An absent human reply must not release the capsule');
            assert.equal(getContextRequest(db, { id }).structured.capsule, undefined, 'MCP exposed an unapproved draft');
            row.draft = pending.draft_answer!;
            row.flagged = JSON.parse(pending.draft_flagged ?? '[]');
            const approval = listLocalInbox(db, config.APPROVER_EMAIL).find(m => m.sentEmailId === pending.approval_sent_email_id);
            assert.ok(approval && approval.bodyText?.includes(row.draft), 'Approval inbox must show the exact draft');
            assert.ok(!protectedFixture.test(approval.bodyText!), 'Protected fixture content appeared in the approval inbox');
            const simulated = chooseSimulatedReply(row.draft, row.flagged);
            row.approval = { simulated: true, decision: simulated.decision, typedCharacters: characters(simulated.bodyText), bodyText: simulated.bodyText };
            // BENCHMARK ONLY: an explicit simulated action, never an actual human approval.
            submitLocalReply(db, { sentEmailId: pending.approval_sent_email_id!, author: config.APPROVER_EMAIL, bodyText: simulated.bodyText });
            await pollApprovals(db, deps);
            await pollDeliveries(db, deps);
            const delivered = getPr(db, id)!;
            assert.equal(delivered.state, 'delivered', 'Local capsule transport did not complete');
            assert.ok(delivered.capsule_inbound_email_id, 'Requester did not receive the capsule through local transport');
            assert.equal(delivered.approved_text, simulated.text, 'Delivered text differs from the simulated approved replacement');
            assert.ok(!protectedFixture.test(delivered.approved_text!) && !unreleased.test(delivered.approved_text!), 'Known sensitive fixture text left in the capsule');
            const eventKinds = listEvents(db, id).map(event => event.kind);
            const ordered = ['rules_applied', 'drafted', 'approval_sent', 'decision', 'capsule_sent', 'delivered'];
            for (let i = 0; i < ordered.length; i++)
                assert.ok(eventKinds.indexOf(ordered[i]) >= 0 && (i === 0 || eventKinds.indexOf(ordered[i]) > eventKinds.indexOf(ordered[i - 1])), `Missing or unordered gate evidence: ${ordered[i]}`);
            assert.ok(modelCalled, 'Real drafting adapter was not called');
            row.latencyMs = performance.now() - start;
            row.capsule = delivered.approved_text!;
            row.capsuleCharacters = characters(row.capsule);
            row.gates = { rules: true, minimize: true, human: true };
            row.status = 'passed';
            if (options.countTokens) {
                try {
                    row.capsuleTokens = await options.countTokens(row.capsule);
                }
                catch (e) {
                    row.tokenCountError = safeError(e, secrets);
                }
            }
        }
        catch (e) {
            row.error = safeError(e, secrets);
        }
        finally {
            row.attemptMs = performance.now() - start;
            db.close();
        }
    }
    return report;
}
const cell = (value: unknown) => String(value ?? 'N/A').replaceAll('|', '\\|').replaceAll('\n', ' ');
const seconds = (value: number | null) => value === null ? 'N/A' : (value / 1000).toFixed(3);
export function renderBenchmark(report: BenchmarkReport): string {
    const failed = report.results.filter(result => result.status === 'failed').length;
    const lines = [
        '# Nanobite benchmark',
        '', `Generated: ${report.generatedAt} (UTC).`,
        '', `Model: **${report.provider} / ${report.model}**. ${report.provider === 'anthropic' ? 'Claude drafting was exercised by this run.' : 'Claude API drafting and Claude token counts remain **unverified**; no Claude key was available for this run.'}`,
        '', `Result: **${report.results.length - failed} passed, ${failed} failed**. Passing means local workflow/gate assertions passed; it is not a general answer-quality evaluation.`,
        '', 'Provenance: the vendor transcript and Acme scenario are synthetic fixtures. Model responses are generated during this run. Requests, approval messages, and capsules use the SQLite-backed local inbox adapter with disposable `:memory:` databases. No live email or Primitive call occurs.',
        '', '**Every human decision below is SIMULATED by this benchmark.** The harness first verifies that absent approval blocks delivery. It then simulates `approve`, or records a full `edit` replacement that removes sentences containing flagged unreleased information. This is not evidence of a real human review, phone interaction, or human response time.',
        '', 'Request → capsule timing includes real model work and immediate simulated review, but excludes the normal worker polling sleep and token-count API calls. Each question runs once; these are individual observations, not averages or performance guarantees.',
        '', '| Question | Workflow | Extracted source characters | Capsule characters | Source tokens | Capsule tokens | Request → capsule (s) | Simulated reply characters |',
        '|---|---|---:|---:|---:|---:|---:|---:|',
    ];
    for (const row of report.results)
        lines.push(`| ${cell(row.label)} | ${row.status} | ${row.sourceCharacters} | ${cell(row.capsuleCharacters)} | ${cell(row.sourceTokens)} | ${cell(row.capsuleTokens)} | ${seconds(row.latencyMs)} | ${cell(row.approval?.typedCharacters)} |`);
    lines.push('', 'Character counts are Unicode code points, not tokens. The source baseline is all extracted session text, excluding thinking and bookkeeping blocks.');
    if (report.provider === 'anthropic') {
        lines.push('', 'Token counts, when available, come from Anthropic `messages.countTokens` with the configured model and a single user message containing the extracted source or capsule. They are API input counts for that measurement request, not total billed drafting usage.');
        for (const row of report.results)
            if (row.sourceTokens !== null && row.capsuleTokens)
                lines.push(`- ${row.label}: source/capsule token count quotient ${(row.sourceTokens / row.capsuleTokens).toFixed(2)}×.`);
    }
    else
        lines.push('', 'Source and capsule token counts are N/A. No character-based token estimates or compression claims are substituted.');
    if (report.sourceTokenCountError)
        lines.push('', `Source token count unavailable: ${cell(report.sourceTokenCountError)}`);
    const usageNote = report.provider === 'anthropic'
        ? 'Prompt and output counts below come from the Anthropic `usage` object of each drafting response (prompt = input plus any cached input tokens). The API reports no server duration, so that column is N/A. They do not measure the complete source session or the capsule alone.'
        : 'Ollama counts below are reported by the local API for the actual drafting prompt and full structured JSON response. They do not measure the complete source session or the capsule alone.';
    lines.push('', '## Model request measurements', '', usageNote, '','| Question | Model call wall time (s) | API prompt tokens | API output tokens | API duration (s) |', '|---|---:|---:|---:|---:|');
    for (const row of report.results)
        lines.push(`| ${cell(row.label)} | ${seconds(row.modelCallMs)} | ${cell(row.usage?.promptTokens)} | ${cell(row.usage?.outputTokens)} | ${seconds(row.usage?.durationMs ?? null)} |`);
    for (const row of report.results) {
        lines.push('', `## ${row.label}`, '', row.question, '', `Status: ${row.status}. Rules → minimize → human gate assertions: ${row.gates ? 'passed (human action simulated)' : 'not all verified'}.`);
        if (row.error)
            lines.push('', `Failure: ${cell(row.error)}`);
        if (row.tokenCountError)
            lines.push('', `Capsule token count unavailable: ${cell(row.tokenCountError)}`);
        if (row.approval)
            lines.push('', `SIMULATED decision: ${row.approval.decision}; ${row.approval.typedCharacters} typed characters. Model flags: ${JSON.stringify(row.flagged)}.`, '', 'Exact simulated reply:', '', '````text', row.approval.bodyText, '````');
        if (row.capsule)
            lines.push('', 'Delivered capsule:', '', '````text', row.capsule, '````');
    }
    return lines.join('\n') + '\n';
}
async function main() {
    const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    const config = loadConfig({ ...process.env, MAIL_PROVIDER: 'local', MODEL_PROVIDER: hasClaudeKey ? 'anthropic' : 'ollama', OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen3:4b' });
    const drafter = config.MODEL_PROVIDER === 'anthropic' ? new AnthropicDrafter({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL }) : new OllamaDrafter({ baseUrl: config.OLLAMA_BASE_URL, model: config.OLLAMA_MODEL });
    const counter = config.MODEL_PROVIDER === 'anthropic' ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }) : null;
    const report = await runBenchmark({ config, drafter, providerLabel: config.MODEL_PROVIDER, modelLabel: config.MODEL_PROVIDER === 'anthropic' ? config.ANTHROPIC_MODEL : config.OLLAMA_MODEL,
        ...(counter ? { countTokens: async (text: string) => (await counter.messages.countTokens({ model: config.ANTHROPIC_MODEL, messages: [{ role: 'user', content: text }] })).input_tokens } : {}),
        getUsage: () => drafter.lastUsage });
    const markdown = renderBenchmark(report);
    writeFileSync(new URL('../benchmark.md', import.meta.url), markdown);
    console.log(markdown);
    if (report.results.some(result => result.status === 'failed'))
        process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    await main();
