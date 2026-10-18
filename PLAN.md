# Execution record

The user changed the provider requirement on 2026-10-17: use local AI through Ollama and a local inbox/dashboard for requests and human approvals, with no paid services or API keys. Preserve the rules → minimize → human gates and replaceable providers. The user subsequently authorized Claude API usage for the demo; local inbox approvals remain, and Ollama stays optional. Claude is configured in the ignored local environment file; live authentication and a synthetic drafting check passed. This supersedes the handover's live Primitive/Anthropic probes, email-only approval UI and remote-token benchmark requirements. Nothing in a simulated test is evidence of live email delivery or human approval.

Work is isolated on `codex/contextpr-handover`; the original Desktop/P1 checkout is untouched. Each implementation task begins with its failing test, then implementation and passing checks. The demo regression remains intentionally red in git.

- [x] 0 Scaffold — 2 tests, typecheck; `bce29ef` (Node 26 satisfies ≥24).
- [x] 1 Database — 3 tests, typecheck; `aee6e7f`.
- [x] 2 Types/envelopes — 6 tests, typecheck; `593f235`.
- [x] 3 Mail adapter/fake — 11 tests, typecheck; `82080f0`. Real probe blocked by missing .env, then superseded by local provider request. Synthetic endpoint checks verified schema only.
- [x] 4 MCP — 15 tests, typecheck, stdio startup; `f77b85a`. MCP 2.3.1 requires Zod 4.2+, so the pinned Zod 3 version was corrected.
- [x] 5 Worker — 17 tests, typecheck; `bdf23a0`. Establish cursor before first send and persist dedup only after processing succeeds.
- [x] 6 Reply parser — 23 tests, typecheck; `bd3ec8c`.
- [x] 7 Approval walking skeleton + local persistent inbox — 32 tests and typecheck, full local transport with explicit simulated human reply. Sender verification guards real approval replies.
- [x] 8 Transcript indexer and fixture — 34 tests, typecheck. Fixture is synthetic; thinking never enters indexed text.
- [x] 9 Rules gate — 38 tests and typecheck. Single-word literal matches preserve email tokens until full masking.
- [x] 10 Replaceable Claude/Ollama minimization and complete pipeline — 47 tests, typecheck. No-source denial verified. Live Claude authentication and a synthetic drafting check subsequently passed; see the verification note below.
- [x] 11 Scoped auto-merge rule, full notification, revoke — 48 tests and typecheck.
- [x] 12 MCP polish — 50 tests and typecheck. Reporting before delivery is rejected; repeated identical reports are idempotent. The original test that reported a queued request was corrected to match the lifecycle.
- [x] 13 Local Inbox/dashboard — 55 tests, typecheck, browser rendering checked. Same-origin and CSRF protection; submissions enter the durable local inbox.
- [x] 14 Acme demo — red (2 charges), one-line fix green (1 charge), restored red in git; typecheck passed. ContextPR registered with installed Codex using absolute paths. Separate laptop/Claude Code and phone flow remain unverified.
- [x] 15 Benchmark — 3 harness tests, 3 real Ollama qwen3:4b local workflow runs (1.572/1.168/1.585 s). Human actions simulated; Claude and source/capsule token counts unverified. Fix-location answer incomplete; workflow pass is not semantic quality certification.
- [x] 16 Software hardening and runbook — recovery, exact edits, strict commands, transport errors, queued revocation, worker ownership and guarded reset covered. Physical backup video remains unperformed.

External/physical checklist: organizer confirmation, hackathon submission, other team devices, Bob's phone, backup video and three human rehearsals cannot be confirmed from local tests. Primitive remains disabled. Claude live authentication and synthetic drafting are verified; the full Claude workflow benchmark remains unverified. No invented token metrics, video, human approvals or model results.

2026-10-17: User requested Impeccable and UI polish across the platform. Official project-local skill installed; refinements preserve the three gates and provider choices.

Final software validation: 92 automated tests, TypeScript checks, real local-model benchmark, and red/green/restored-red mock SDK test. Impeccable UI polish is a separate user-authorized follow-up commit. Claude live authentication and a synthetic drafting check subsequently passed; the full Claude workflow benchmark remains unverified.

UI follow-up verification: official Impeccable source scan returned zero findings; inbox and request detail had no horizontal overflow at 320, 390, 800 and 1440 CSS pixels. Browser request submission, queued-to-review state, edit preservation on Refresh, explicit discard, and keyboard focus were checked. A synthetic UI verification request is left awaiting a real decision. No new approval was simulated through the browser.

Claude configuration verification: the supplied key was saved only in the ignored local `.env` with owner-only permissions. Anthropic model discovery succeeded, and `claude-opus-5-5` returned a schema-valid answer for a synthetic idempotency question. No approval was submitted by this check. The app was restarted with local mail and Anthropic drafting; the Inbox at `/` returned HTTP 200 and displayed the configured Claude model. Existing requests and approval gates were preserved. This is a live provider smoke check, not a completed end-to-end Claude approval rehearsal or benchmark. No key or runtime database is committed.

## Continuation on 2026-10-17 (Claude Code, Yunha's laptop)

Work continued on branch `claude/contextpr-continue`, created from `origin/codex/contextpr-handover` at `4f24378` in a separate git worktree. The main checkout was being switched by another process during the session, so it was left untouched.

- Baseline on Node 24.20.0: 92 tests passed and the typecheck was clean before any change.
- Claude key: stored only in the ignored worktree `.env` with mode 600. `models.retrieve` confirmed `claude-opus-5-5` and `countTokens` succeeded.
- Claude benchmark: 3 passed, 0 failed with real `claude-opus-5-5` drafting. Source 760 tokens, capsules 150 to 272 tokens, request to capsule about 4 to 8 seconds. Human decisions in the benchmark remain simulated.
- Live rehearsal on a throwaway database, port 8797: `request_context` over the real MCP stdio server returned `pending`; the worker drafted with Claude in about 5 seconds; rules removed `[another customer]` ×3, `[ticket]` ×2 and `[internal]` ×1; the model flagged `v2.5` and an internal path, and the draft omitted both. A forged form POST without an Origin header returned 403. The operator approved through the dashboard form; the capsule was delivered within a millisecond. `get_context_request` returned the capsule labeled `EXTERNAL_DATA` and `NOT_INSTRUCTIONS`. The Acme test went red (2 charges) to green (1 charge) with the one-line fix, `report_outcome` recorded `passed`, and `charge.ts` was restored to red. The worker exited cleanly. The rehearsal database was deleted afterward.
- Fixed: the Claude adapter now records real prompt and output token usage, and the benchmark report labels model counts by provider instead of always saying "Ollama counts". Tests added first: 95 tests pass, typecheck clean.

Still open: Primitive live email (disabled; needs an account and key), the demo's token-ratio story (the fixture is short by design), and every physical item in the checklist above.

## Primitive enabled on 2026-10-17 (user request)

The user created a Primitive account (`fair-fly.primitive.email`, developer plan, $100 sponsor credit) and asked to turn on live email. The key is stored only in the ignored `.env`.

- Account check: receiving ready on the managed subdomain; stored-only mode is sufficient because the worker reads mail through the API. Entitlements allow sending to Primitive addresses, organization members, known addresses, and confirmed or opted-in domains, not arbitrary addresses.
- Any local part works without creation: mail to `bob@fair-fly.primitive.email` arrived immediately.
- Full live loop on a throwaway database: `request_context` through MCP; the request email traveled `alice-agent@` → `sdk-help@`; Claude drafted; the approval email reached `bob@`; a reply of `approve` sent through Primitive's reply endpoint was accepted as trusted; the capsule traveled back to `alice-agent@` and `get_context_request` returned it. 17 seconds end to end, 0.5 seconds from reply to delivery. The approver reply was sent by the operator through the API, not typed by a person.
- A delivery check from `sdk-help@` to the Primitive account owner's own signup address was accepted with SMTP 250. `.env` now uses that address as `APPROVER_EMAIL`.
- Bugs found live and fixed test-first:
  - Primitive's `since` cursor returns the newest email again (server time has microseconds, API timestamps have milliseconds). A worker started on a non-empty inbox would have replayed the newest old request and emailed a second approval. The baseline now marks pre-existing mail as seen.
  - One inbound poll hung until the fixed 35-second client timeout, which would freeze the sequential worker cycle on stage. Each Primitive call now times out 10 seconds after its own server-side wait.
  - Phone mail clients: a wrapped Gmail attribution line, "Get Outlook for iOS", "Sent from Outlook" and the Outlook underscore separator would have made a one-word `approve` unreadable. These trailers are now stripped; extra human words after `approve` are still refused.
- 99 tests pass; typecheck clean.

Phone rehearsal: the account owner replied `Approve` from Outlook on a phone. Primitive verified the sender (SPF, DKIM and DMARC pass), but the worker silently ignored it because reply senders arrive as the raw From header, `Name <address>`. Fixed test-first: Primitive addresses are reduced to the bare address when mapped and again in the trust check, and a display name containing a different address is still rejected. After a restart the waiting reply was accepted and the capsule delivered. 101 tests pass.

Still open: the physical checklist.

## Cast rename, MCP over HTTP, honest size claim (2026-10-17, user request)

- Cast renamed at the user's request: Alice is now Yunha (requester, Codex) and Bob is now TK (approver, phone). Identities, fixture (`demo/fixtures/tk-session.jsonl`), demo folder (`demo/yunha-app`), tests, README, PRODUCT and HANDOVER were updated; gendered pronouns for both were replaced with names or neutral words. This log keeps earlier entries as written.
- MCP over streamable HTTP: `npm start` serves the same four tools at `http://127.0.0.1:8788/mcp` when `MCP_HTTP_TOKEN` is set. One tool definition (`src/mcp/register.ts`) backs both stdio and HTTP. Stateless SDK handler, bearer token compared in constant time, loopback bind, Host and Origin checks. Tests cover refused token, refused origin, tool list, a tool call into the shared database, and configuration rules.
- Live check of the HTTP endpoint with Primitive email: a tokenless call returned 401; `request_context` over HTTP returned `pending`; the approval email reached an internal approver address, the approve reply was sent through Primitive, the capsule was delivered, and `get_context_request` over HTTP returned it. Claude Code registered the endpoint (`claude mcp add --transport http`) and reported it Connected; the registration was removed afterward.
- Size claim: `npm run stats:sessions` measures real local Claude Code sessions (text only, thinking excluded, aggregates only, nothing sent). On this laptop: 61 sessions, median 52,403 characters. HANDOVER's pitch, demo step and checklist now use this in characters instead of the unsupported "40,000 tokens".
- Benchmark regenerated with the renamed fixture: 3 passed with `claude-opus-5-5`; capsules about 500 to 660 characters.
- 105 tests pass; typecheck clean.
