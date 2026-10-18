# Nanobite benchmark

Generated: 2026-10-18T00:05:31.957Z (UTC).

Model: **anthropic / claude-opus-5-5**. Claude drafting was exercised by this run.

Result: **3 passed, 0 failed**. Passing means local workflow/gate assertions passed; it is not a general answer-quality evaluation.

Provenance: the TK transcript and Acme scenario are synthetic fixtures. Model responses are generated during this run. Requests, approval messages, and capsules use the SQLite-backed local inbox adapter with disposable `:memory:` databases. No live email or Primitive call occurs.

**Every human decision below is SIMULATED by this benchmark.** The harness first verifies that absent approval blocks delivery. It then simulates `approve`, or records a full `edit` replacement that removes sentences containing flagged unreleased information. This is not evidence of a real human review, phone interaction, or human response time.

Request → capsule timing includes real model work and immediate simulated review, but excludes the normal worker polling sleep and token-count API calls. Each question runs once; these are individual observations, not averages or performance guarantees.

| Question | Workflow | Extracted source characters | Capsule characters | Source tokens | Capsule tokens | Request → capsule (s) | Simulated reply characters |
|---|---|---:|---:|---:|---:|---:|---:|
| Retries / idempotency | passed | 1852 | 663 | 760 | 259 | 6.104 | 7 |
| Timeout configuration | passed | 1852 | 506 | 760 | 201 | 4.029 | 7 |
| Fix location | passed | 1852 | 543 | 760 | 211 | 6.464 | 7 |

Character counts are Unicode code points, not tokens. The source baseline is all extracted session text, excluding thinking and bookkeeping blocks.

Token counts, when available, come from Anthropic `messages.countTokens` with the configured model and a single user message containing the extracted source or capsule. They are API input counts for that measurement request, not total billed drafting usage.
- Retries / idempotency: source/capsule token count quotient 2.93×.
- Timeout configuration: source/capsule token count quotient 3.78×.
- Fix location: source/capsule token count quotient 3.60×.

## Model request measurements

Prompt and output counts below come from the Anthropic `usage` object of each drafting response (prompt = input plus any cached input tokens). The API reports no server duration, so that column is N/A. They do not measure the complete source session or the capsule alone.

| Question | Model call wall time (s) | API prompt tokens | API output tokens | API duration (s) |
|---|---:|---:|---:|---:|
| Retries / idempotency | 6.093 | 1871 | 462 | N/A |
| Timeout configuration | 4.022 | 1863 | 356 | N/A |
| Fix location | 6.460 | 1857 | 403 | N/A |

## Retries / idempotency

Why do concurrent retries create duplicate charges in SDK 2.3, and how do I preserve one idempotency key?

Status: passed. Rules → minimize → human gate assertions: passed (human action simulated).

SIMULATED decision: approve; 7 typed characters. Model flags: ["/Users/tk/acme/sdk/packages/sdk/src/retry.ts"].

Exact simulated reply:

````text
approve
````

Delivered capsule:

````text
In SDK 2.3.x, charge() sets idempotencyKey = opts.idempotencyKey ?? randomUUID(). If you don't pass a key, every retry attempt generates a new one, so the server treats each retry as a separate charge. To keep a single key, generate it once outside the retry loop and pass it in: const key = randomUUID(); await withRetry(() => charge(params, { idempotencyKey: key }));. Alternatively, upgrade to SDK 2.4.0 and use withRetry(fn, { preserveIdempotencyKey: true }). Raising timeoutMs does not fix this. Note that the excerpts only cover timeout-triggered retries. They don't address truly concurrent (parallel) requests, which would also need to share the same key.
````

## Timeout configuration

How should I configure timeoutMs in createClient for the synthetic timeout and retry regression test?

Status: passed. Rules → minimize → human gate assertions: passed (human action simulated).

SIMULATED decision: approve; 7 typed characters. Model flags: ["v2.5"].

Exact simulated reply:

````text
approve
````

Delivered capsule:

````text
In the synthetic reproduction, set the request timeout via createClient({ baseUrl, timeoutMs: 500 }), and have the mock endpoint record the charge and then delay its first response by 1500 ms. That forces a timeout, so withRetry retries. Then assert exactly one recorded charge. Note that timeoutMs only triggers the retry. Changing it does not fix duplicate charges. The fix is to reuse one idempotencyKey generated outside withRetry, or use SDK 2.4.0 with withRetry(fn, { preserveIdempotencyKey: true }).
````

## Fix location

Which source file contains the SDK retry fix, and what should its regression test assert?

Status: passed. Rules → minimize → human gate assertions: passed (human action simulated).

SIMULATED decision: approve; 7 typed characters. Model flags: ["/Users/tk/acme/sdk/packages/sdk/src/retry.ts"].

Exact simulated reply:

````text
approve
````

Delivered capsule:

````text
The retry fix is in packages/sdk/src/retry.ts. The bug: charge() falls back to randomUUID() for the Idempotency-Key, so every retry gets a new key. Fix it by generating one idempotencyKey outside withRetry and passing it in, or upgrade to SDK 2.4.0 and use withRetry(fn, { preserveIdempotencyKey: true }). The regression test should force a timeout followed by a retry, then assert that exactly one charge was recorded. For example, set timeoutMs: 500 and have the mock endpoint record the charge before delaying its first response by 1500 ms.
````
