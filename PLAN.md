# Execution record

The user changed the provider requirement on 2026-10-17: use local AI through Ollama and a local inbox/dashboard for requests and human approvals, with no paid services or API keys. Preserve the rules → minimize → human gates and replaceable providers. This supersedes the handover's live Primitive/Anthropic probes, email-only approval UI and remote-token benchmark requirements. Nothing in a simulated test is evidence of live email delivery or human approval.

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
- [ ] 9 Rules gate.
- [ ] 10 Local Ollama minimization gate and complete pipeline.
- [ ] 11 Auto-merge rule, notification, revoke.
- [ ] 12 MCP polish.
- [ ] 13 Local Inbox/dashboard with human approval controls.
- [ ] 14 Acme demo and vendor configuration.
- [ ] 15 Three-question local benchmark with honest provenance.
- [ ] 16 Restart hardening and runbook.

External/physical checklist: organizer confirmation, hackathon submission, other team devices, Bob's phone, backup video and three human rehearsals cannot be confirmed from local tests. Paid services remain disabled. No invented token metrics, video, human approvals or model results.
