# ContextPR benchmark

Generated: 2026-10-17T23:35:21.444Z (UTC).

Model: **anthropic / claude-opus-5-5**. Claude drafting was exercised by this run.

Result: **3 passed, 0 failed**. Passing means local workflow/gate assertions passed; it is not a general answer-quality evaluation.

Provenance: the TK transcript and Acme scenario are synthetic fixtures. Model responses are generated during this run. Requests, approval messages, and capsules use the SQLite-backed local inbox adapter with disposable `:memory:` databases. No live email or Primitive call occurs.

**Every human decision below is SIMULATED by this benchmark.** The harness first verifies that absent approval blocks delivery. It then simulates `approve`, or records a full `edit` replacement that removes sentences containing flagged unreleased information. This is not evidence of a real human review, phone interaction, or human response time.

Request → capsule timing includes real model work and immediate simulated review, but excludes the normal worker polling sleep and token-count API calls. Each question runs once; these are individual observations, not averages or performance guarantees.

| Question | Workflow | Extracted source characters | Capsule characters | Source tokens | Capsule tokens | Request → capsule (s) | Simulated reply characters |
|---|---|---:|---:|---:|---:|---:|---:|
| Retries / idempotency | passed | 1853 | 654 | 760 | 272 | 8.049 | 7 |
| Timeout configuration | passed | 1853 | 535 | 760 | 211 | 4.090 | 7 |
| Fix location | passed | 1853 | 393 | 760 | 150 | 3.843 | 7 |

Character counts are Unicode code points, not tokens. The source baseline is all extracted session text, excluding thinking and bookkeeping blocks.

Token counts, when available, come from Anthropic `messages.countTokens` with the configured model and a single user message containing the extracted source or capsule. They are API input counts for that measurement request, not total billed drafting usage.
- Retries / idempotency: source/capsule token count quotient 2.79×.
- Timeout configuration: source/capsule token count quotient 3.60×.
- Fix location: source/capsule token count quotient 5.07×.

## Model request measurements

Prompt and output counts below come from the Anthropic `usage` object of each drafting response (prompt = input plus any cached input tokens). The API reports no server duration, so that column is N/A. They do not measure the complete source session or the capsule alone.

| Question | Model call wall time (s) | API prompt tokens | API output tokens | API duration (s) |
|---|---:|---:|---:|---:|
| Retries / idempotency | 8.035 | 1871 | 784 | N/A |
| Timeout configuration | 4.084 | 1863 | 393 | N/A |
| Fix location | 3.837 | 1857 | 317 | N/A |

## Retries / idempotency

Why do concurrent retries create duplicate charges in SDK 2.3, and how do I preserve one idempotency key?

Status: passed. Rules → minimize → human gate assertions: passed (human action simulated).

SIMULATED decision: approve; 7 typed characters. Model flags: [].

Exact simulated reply:

````text
approve
````

Delivered capsule:

````text
In SDK 2.3.x, charge() sets `idempotencyKey = opts.idempotencyKey ?? randomUUID()`, so each call made by withRetry gets a new key. The server sees every retry as a new charge. The excerpts only cover timeout-triggered retries, not concurrent requests specifically.

Fix: generate the key once, outside the retry loop, and reuse it:
```ts
const idempotencyKey = randomUUID();
await withRetry(() => charge(params, { idempotencyKey }));
```
Or upgrade to 2.4.0 and use `withRetry(fn, { preserveIdempotencyKey: true })`. Changing timeoutMs does not fix the duplicates. Add a regression test that asserts exactly one recorded charge after a timeout and retry.
````

## Timeout configuration

How should I configure timeoutMs in createClient for the synthetic timeout and retry regression test?

Status: passed. Rules → minimize → human gate assertions: passed (human action simulated).

SIMULATED decision: approve; 7 typed characters. Model flags: ["/Users/tk/acme/sdk/packages/sdk/src/retry.ts","v2.5"].

Exact simulated reply:

````text
approve
````

Delivered capsule:

````text
In the synthetic reproduction, set the request timeout with createClient({ baseUrl, timeoutMs: 500 }). Have the mock endpoint record the charge, then delay its first response by 1500 ms. That exceeds the 500 ms timeout and forces a retry. Assert that exactly one charge is recorded after the timeout and retry. timeoutMs only controls when the retry happens. It does not fix the duplicate charges. The fix is to generate one idempotencyKey outside the retry loop, or to use withRetry(fn, { preserveIdempotencyKey: true }) on SDK 2.4.0.
````

## Fix location

Which source file contains the SDK retry fix, and what should its regression test assert?

Status: passed. Rules → minimize → human gate assertions: passed (human action simulated).

SIMULATED decision: approve; 7 typed characters. Model flags: ["v2.5"].

Exact simulated reply:

````text
approve
````

Delivered capsule:

````text
The retry fix lives in packages/sdk/src/retry.ts. The regression test should simulate a timeout followed by a retry and assert that exactly one charge is recorded. The root cause is that charge() generates a new idempotency key on every call. Fix it by creating a single idempotency key outside withRetry, or by upgrading to SDK 2.4.0 and using withRetry(fn, { preserveIdempotencyKey: true }).
````
