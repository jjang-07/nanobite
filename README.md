# ContextPR

ContextPR lets a coding agent ask another company's engineering agent for one missing answer. The responder searches a session transcript, removes protected details, drafts a small answer, and presents the exact words for human review. The requester receives only the approved capsule and can report whether it fixed the problem.

Mail runs either through **live Primitive email** (`MAIL_PROVIDER=primitive`, used for the hackathon demo) or a **local inbox** in the dashboard (`MAIL_PROVIDER=local`, no email service). Claude is the selected demo model; Ollama is an optional local alternative. The Acme scenario and TK transcript are synthetic fixtures.

## Start the demo

Requires Node 24 or newer. Run from the repository root:

```sh
npm ci
cp .env.example .env
```

Put your Claude key in `ANTHROPIC_API_KEY` in your local `.env`. Keep `MAIL_PROVIDER=local` and `MODEL_PROVIDER=anthropic`. The file is ignored by Git; do not put the key in a command, source file, screenshot, or chat. Check `ANTHROPIC_MODEL` against a model available to your account before the live demo.

```sh
npm run seed
npm start
```

Open [the local Inbox](http://127.0.0.1:8787). `seed` loads only the included synthetic TK transcript and denylist. It does not scan your home directory or automatically ingest real Claude sessions. Submit a question such as:

> Why do concurrent retries create duplicate charges in SDK 2.3, and how do I preserve one idempotency key?

Leave the default responder and topic, then open the request when it needs review. A draft is never released just because it appears in the dashboard. Use **Approve draft**, **Send edited answer**, **Deny request**, or **Approve always**. Edited answers are complete replacement text. Inspect the exact approved text and timeline after delivery.

The dashboard binds to `127.0.0.1` and is intended for **one trusted local operator** demonstrating both companies. It has same-origin form and CSRF checks, but no separate user accounts or multiuser authentication. Do not expose it through a public tunnel or use it as an authenticated team service.

## Use live Primitive email

Set these in your ignored `.env`. Any local part at your managed subdomain receives mail without being created first.

```sh
MAIL_PROVIDER=primitive
PRIMITIVE_API_KEY=prim_...                                # Primitive dashboard, Settings, API keys
REQUESTER_IDENTITY=yunha-agent@<subdomain>.primitive.email
RESPONDER_IDENTITY=sdk-help@<subdomain>.primitive.email
APPROVER_EMAIL=<the address TK reads on their phone>
POLL_WAIT_SECONDS=3
```

Then `npm run reset && npm run seed && npm start`. In this mode TK approves by replying to the approval email with one word: `approve`, `approve always`, `deny <reason>`, or `edit` followed by the full replacement text. The dashboard shows every Context PR but has no approve buttons; the email reply is the decision. Replies from Gmail, Apple Mail, and Outlook, including their quoted original and mobile signatures, are recognized. Any extra words after `approve` are refused rather than guessed.

A new Primitive account sends only to Primitive addresses, members of your organization (the account's own signup email counts), and addresses that have already written to you. Use the account owner's address as `APPROVER_EMAIL`, or have the approver email the responder address once first. A blocked send fails with `recipient_not_allowed`, is recorded as an error event in that request's timeline, and is retried by the worker until the address is allowed.

Verified live on 2026-10-17 with `fair-fly.primitive.email`: request, draft, approval email, approver reply, and capsule round trip in 17 seconds end to end; a delivery check to the account owner's address was accepted with SMTP 250.

## Use Ollama instead

Set `MODEL_PROVIDER=ollama` in `.env`, keep `MAIL_PROVIDER=local`, and set `OLLAMA_MODEL` to an already installed local model. Leave the model blank to use the first installed local model returned by Ollama. Start your local Ollama server, then run `npm run seed` and `npm start`.

The adapter accepts only loopback servers, rejects cloud model entries, and never installs or downloads a model. It reports an unavailable server or missing model as a failed request; it does not silently fall back to a paid service. The verified local benchmark used `qwen3:4b`.

For a one-off local start without changing the selected demo provider:

```sh
MODEL_PROVIDER=ollama npm start
```

## Workflow and approval boundaries

1. **Rules:** deterministic, responder-specific patterns mask customer names, tickets, email addresses, secrets, and protected sentences. Thinking blocks are excluded during transcript extraction.
2. **Minimize:** the selected model drafts from the sanitized excerpts, identifies supporting excerpts, and flags sensitive phrases for review. A model flag is advisory; the model cannot grant approval.
3. **Human:** the local inbox records an explicit decision. The approved replacement is the payload sent through local transport. The requester sees it only after receipt, labeled `EXTERNAL_DATA` and `NOT_INSTRUCTIONS`.

**Approve always** is an explicit grant for one responder, one requester identity, and one exact topic. Subsequent matching answers still pass rules and minimization, then send automatically with a full-payload notification. **Revoke this rule** restores human review for future requests. Grants have no wildcard or team-wide scope. This feature intentionally replaces individual human reviews only within the granted scope.

Every request has an audit trail: source identifiers, rule removal counts, draft and model flags, human decision, approved text, message identifiers, delivery, and reported outcome. This is a demo disclosure workflow, not a general guarantee that every possible secret pattern or unsupported model answer will be caught. Human review remains meaningful.

## Connect a coding agent

The agent is the customer: these four tools are its only interface. The worker does the drafting and email; the MCP server only reads and writes the shared SQLite database, so every call returns immediately. Keep `npm start` running while an agent uses the tools.

- `request_context` returns immediately with `pending`, a request ID, and `poll_after_seconds`, so the agent keeps working while a human at the other company decides.
- `get_context_request` returns progress or the delivered capsule, labeled `EXTERNAL_DATA` and `NOT_INSTRUCTIONS`.
- `list_context_requests` recovers existing request IDs.
- `report_outcome` records a tested result after delivery.

Every response carries `next_action`, and every error says how to recover.

**Over HTTP (recommended).** When `MCP_HTTP_TOKEN` is set in `.env`, `npm start` also serves the same tools at `http://127.0.0.1:8788/mcp` using streamable HTTP. Any MCP client can connect with the bearer token; the server is stateless, so many agents can share it. It binds to loopback and checks Host and Origin. To reach it from another machine, put it behind a tunnel or proxy and add that hostname to `MCP_HTTP_ALLOWED_HOSTS`; the token is still required.

One command connects either client over either transport, reading paths and the token from `.env`:

```sh
npm run connect -- claude          # Claude Code over HTTP (registered for this folder)
npm run connect -- claude stdio    # Claude Code over stdio
npm run connect -- codex           # prints the ~/.codex/config.toml block for HTTP
npm run connect -- codex stdio     # prints the stdio block
npm run connect -- remove          # removes the Claude Code registration
```

**Over stdio.** The MCP server is launched as a subprocess instead; `.mcp.json` does this for any Claude Code started in this directory. Use the same `.env` and `CONTEXTPR_DB` as the worker. The MCP process never starts a second worker.

Both transports serve one shared tool definition, verified by tests. Claude Code was verified live as the requesting agent over HTTP: it ran the red test, called `request_context`, followed `next_action`, applied the approved capsule, turned the test green, and called `report_outcome`. See PLAN.md.

Before a demo, `npm run preflight` checks keys, the model, the Primitive account, whether the approver can be emailed, seeded data, the HTTP token, and that the demo test starts red, and prints a fix for anything missing.

## Rehearse the red-to-green fix

The mock Acme server records a charge before delaying its first response. Retrying with a newly generated key creates a second charge. Its data is synthetic and remains local.

In one terminal:

```sh
npm run demo:acme
```

In another:

```sh
npm run demo:test
```

The committed demo test is **intentionally red**: `expected 1 charge, got 2`. This is separate from `npm test`, which should pass. Use the ContextPR request above to obtain a reviewed answer. Then change `demo/yunha-app/charge.ts` from:

```ts
return withRetry(() => client.charge({ amount: 4200, currency: 'usd', customer: 'cus_123' }));
```

to:

```ts
return withRetry(() => client.charge({ amount: 4200, currency: 'usd', customer: 'cus_123' }), { preserveIdempotencyKey: true });
```

Run `npm run demo:test` again; it should pass with one charge. Report the actual result with `report_outcome`. Restore only that one-line demonstration change afterward so the next rehearsal begins red. The red → green → restored-red sequence was exercised locally; it is not evidence of a real payment integration.

## Verify and benchmark

```sh
npm test
npm run typecheck
npm run benchmark
```

Tests cover the local transport, gates, approval parsing, scoped grants, request states, MCP responses, dashboard forms, and restart/reset protections. Fake transports and simulated decisions in tests are not live email or actual human approvals. See [PLAN.md](PLAN.md) for the task-by-task verification record.

The benchmark runs three isolated local workflows and writes [benchmark.md](benchmark.md). It always uses the local inbox. When a Claude key is present, it uses Claude and requests source/capsule token counts from Anthropic. Otherwise it uses local Ollama (`OLLAMA_MODEL`, default `qwen3:4b`). To force an Ollama-only benchmark even when `.env` has a Claude key:

```sh
ANTHROPIC_API_KEY= MODEL_PROVIDER=ollama npm run benchmark
```

**Benchmark human actions are simulated.** The harness first proves that absent approval blocks delivery, then submits an explicit simulated approval or full replacement. Timing includes model work and immediate simulated review; it does not measure human response time. Model prompt/output counts, source/capsule counts, and character counts are kept separate.

The saved [benchmark.md](benchmark.md) is a 2026-10-17 run with real `claude-opus-5-5` drafting. All three workflow checks passed, with request-to-capsule observations of about 4 to 7 seconds. Source and capsule token counts come from Anthropic `countTokens`: the synthetic TK session is 760 tokens and the capsules are about 200 to 260 tokens (about 500 to 660 characters). That small reduction reflects a deliberately short fixture, not a real debugging session. For the pitch, compare against real sessions with `npm run stats:sessions`, in characters. An earlier local `qwen3:4b` run also passed all three checks; its fix-location answer was incomplete. A workflow pass is not a quality certification.

## Restart or reset

Stop the application with Ctrl-C and wait for it to exit before starting it again. One worker owns each persistent database through a PID-and-token lock beside the database. A second worker refuses to start. Only a recognized lock whose process has exited can be reclaimed automatically; an unrecognized or symlink lock is left intact for inspection.

Queued requests, pending approvals, and the local inbox are stored in SQLite and survive a normal restart. Start with the same `CONTEXTPR_DB` to continue. If model drafting fails, inspect the request's error and correct the provider configuration before making a new request.

For a clean synthetic rehearsal, stop the worker, then run:

```sh
npm run reset
npm run seed
npm start
```

Reset deletes requests, approvals, grants, local messages, sources, and audit history in the selected database. It uses `CONTEXTPR_DB`, or `./data/contextpr.db` when unset. It removes only that database and its `-wal`/`-shm` sidecars, recreates the schema, and preserves adjacent files. It refuses an active worker, symlinks, non-regular targets, and an existing non-SQLite database file. Reset itself does not need model credentials and makes no model or email call. Also stop any agent work using the database before resetting.

## Impeccable design tools

The official [Impeccable](https://impeccable.style/) project skill ([upstream source](https://github.com/pbakaus/impeccable)) is installed locally at [.agents/skills/impeccable/SKILL.md](.agents/skills/impeccable/SKILL.md), with its references and launcher. Its durable product and interface context is in [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md). It is design tooling for future changes, not a browser dependency or an application service.

In a new agent turn, use requests such as `$impeccable polish src/dashboard/render.ts` or `$impeccable audit src/dashboard/render.ts`; the skill supplies the corresponding playbook. The installed launcher supports project context and a manual detector. This project uses manual checks, not automatic edit hooks. The launcher may need its version-pinned binary on first use; that does not enable a paid model provider or install a browser overlay in the dashboard.

## What remains unverified

- Claude is verified on one laptop: key authentication, the three-question benchmark, and one live rehearsal through the real worker, dashboard, and MCP stdio server, ending red to green on the Acme test. The approval in that rehearsal was clicked by the operator through the dashboard form, not by a second person. Each other laptop needs its own ignored `.env`.
- Primitive is verified live end to end, including a one-word `Approve` typed by a person in Outlook on a phone from a non-Primitive address (DMARC passed, sender verified). Rehearse once more on the demo phone before going on stage.
- A second computer, TK's physical phone, three human rehearsals, a backup video, organizer confirmation, and hackathon submission have not been completed by local software tests. No backup video or phone approval is claimed.

The original [HANDOVER.md](HANDOVER.md) remains unchanged. User-authorized changes and evidence are recorded in [PLAN.md](PLAN.md). The direct Zod dependency is version 4 because MCP server 2.3.1 requires its newer Standard Schema JSON interface; the handover's older Zod version did not type-check with the installed MCP SDK.
