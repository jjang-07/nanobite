# ContextPR benchmark

Generated: 2026-10-17T23:04:02.860Z (UTC).

Model: **ollama / qwen3:4b**. Claude API drafting and Claude token counts remain **unverified**; no Claude key was available for this run.

Result: **3 passed, 0 failed**. Passing means local workflow/gate assertions passed; it is not a general answer-quality evaluation.

Provenance: the Bob transcript and Acme scenario are synthetic fixtures. Model responses are generated during this run. Requests, approval messages, and capsules use the SQLite-backed local inbox adapter with disposable `:memory:` databases. No live email or Primitive call occurs.

**Every human decision below is SIMULATED by this benchmark.** The harness first verifies that absent approval blocks delivery. It then simulates `approve`, or records a full `edit` replacement that removes sentences containing flagged unreleased information. This is not evidence of a real human review, phone interaction, or human response time.

Request → capsule timing includes real model work and immediate simulated review, but excludes the normal worker polling sleep and token-count API calls. Each question runs once; these are individual observations, not averages or performance guarantees.

| Question | Workflow | Extracted source characters | Capsule characters | Source tokens | Capsule tokens | Request → capsule (s) | Simulated reply characters |
|---|---|---:|---:|---:|---:|---:|---:|
| Retries / idempotency | passed | 1853 | 171 | N/A | N/A | 1.572 | 7 |
| Timeout configuration | passed | 1853 | 158 | N/A | N/A | 1.168 | 7 |
| Fix location | passed | 1853 | 25 | N/A | N/A | 1.585 | 7 |

Character counts are Unicode code points, not tokens. The source baseline is all extracted session text, excluding thinking and bookkeeping blocks.

Source and capsule token counts are N/A. No character-based token estimates or compression claims are substituted.

## Model request measurements

Ollama counts below are reported by the local API for the actual drafting prompt and full structured JSON response. They do not measure the complete source session or the capsule alone.

| Question | Model call wall time (s) | API prompt tokens | API output tokens | API duration (s) |
|---|---:|---:|---:|---:|
| Retries / idempotency | 1.567 | 1176 | 140 | 1.543 |
| Timeout configuration | 1.166 | 1168 | 122 | 1.164 |
| Fix location | 1.584 | 1167 | 165 | 1.582 |

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
SDK 2.3 regenerates idempotencyKey on every retry attempt. To preserve one key, pass it outside the retry loop or upgrade to SDK 2.4.0 with `preserveIdempotencyKey: true`.
````

## Timeout configuration

How should I configure timeoutMs in createClient for the synthetic timeout and retry regression test?

Status: passed. Rules → minimize → human gate assertions: passed (human action simulated).

SIMULATED decision: approve; 7 typed characters. Model flags: [].

Exact simulated reply:

````text
approve
````

Delivered capsule:

````text
Set timeoutMs to 500 in createClient for the synthetic test. The mock endpoint delays first response by 1500ms after recording charge, so retry timeouts only.
````

## Fix location

Which source file contains the SDK retry fix, and what should its regression test assert?

Status: passed. Rules → minimize → human gate assertions: passed (human action simulated).

SIMULATED decision: approve; 7 typed characters. Model flags: ["The fix for duplicate charges due to idempotency key regeneration on retries is in the retry wrapper code"].

Exact simulated reply:

````text
approve
````

Delivered capsule:

````text
packages/sdk/src/retry.ts
````
