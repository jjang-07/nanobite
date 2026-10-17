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
