# Nanobite: current handoff

Updated October 17, 2026. Working repository: `jjang-07/goat-yc-hackathon`, branch `main`. This document summarizes the current implementation and this workstation's verification. `DEMO.md` contains the rehearsal instructions; `HANDOVER.md` and `PLAN.md` retain earlier specifications and build history.

## What the product does

An agent requests narrowly scoped technical context from another company's agent. The request returns pending immediately. A worker finds supporting excerpts, removes protected information, drafts an answer, and requests human approval by email. The requesting agent later retrieves the approved answer through MCP.

The processing stages are:

1. **Protect sensitive information.** Deterministic rules redact protected text before drafting and check the draft afterward.
2. **Draft a focused answer.** The configured model writes from cleaned excerpts, with supporting evidence and review flags. Drafting does not authorize delivery.
3. **Get your approval.** A reviewer approves, edits, or denies through email. An explicitly configured rule for an exact requester and topic can authorize future requests without a fresh review; protection and drafting still run.

The local demo uses Claude (`claude-opus-5-5`) for drafting and Primitive for real email. Ollama remains a supported alternative and is a local configuration default; it is not the configured provider for the running email demo.

## Changes in this update

### Request UI and status language

- The top timeline is Asked → Received → Approval → Delivery. The nested “Three gates” display was removed.
- Reviewer wording now says “Waiting for your approval,” “Approved by you,” “Edited by you,” and “Denied by you.” User-facing references to a named reviewer were replaced with neutral language.
- Completed requests display **Delivered**, **Delivered (edited)**, or **Delivered (denied)** consistently across the inbox, request detail, timeline, and activity. A denied delivery means the denial was returned; no answer was shared.
- The processing stages are explained in expandable sections on request details and the Rules page.
- Empty Outcome and Outcome note fields are hidden. The inbox shows outcome information only when a real report exists. The backend outcome tool remains available; the current live demonstration ends at delivery unless an agent explicitly reports a result.

### Email decisions and optional reasons

Approve, Deny, and Edit buttons open a reply in the user's email client. The user must press **Send**.

Each new button reply includes a separate `Decision reason (optional):` section. Edit replies also include an `Answer to share:` section. The parser separates the internal reason from the replacement answer, accepts an empty reason, and refuses an empty edited answer. Long drafts open an empty answer field instead of a sendable placeholder. Older manual command replies remain supported.

Approval and edit reasons remain in the review record rather than being appended to the shared answer. A denial reason is returned to the requester. Existing emails retain their original button templates; newly generated emails use the improved template.

### Manual rules

The dashboard now has Inbox / Rules navigation and a `/rules` page with two kinds of controls:

- **Protection rules:** add literal replacements or remove whole sentences containing specified text; edit, enable, or disable custom rules; enable or disable built-in rules. A local preview shows redactions without sending the sample to a model or email provider and without storing it in the database.
- **Automatic approval rules:** explicitly authorize an exact requester email and exact topic, inspect current scopes, and revoke them. Creating a rule requires a separate confirmation checkbox. Wildcards are rejected.

Protection rules apply to new drafts. New automatic approval scopes do not retroactively approve requests already waiting for review. Database migration preserves existing installations; reseeding retains custom rules and disabled built-in preferences. Rule mutations use the dashboard's existing Host, Origin, and form protections.

## Architecture and code map

| Area | Location |
|---|---|
| Worker and request processing | `src/pipeline` |
| Drafting, redaction, email approval | `src/gates` |
| Decision reply formatting/parsing | `src/gates/decision-reply.ts`, `src/gates/approval.ts` |
| Custom protection persistence | `src/gates/protection-store.ts`, `src/gates/rules.ts` |
| Approval scopes | `src/approval/rules-store.ts` |
| Dashboard, timelines, rule forms | `src/dashboard` |
| SQLite schema and migrations | `src/db` |
| MCP tools | `src/mcp` |
| Agent connection helpers and preflight | `scripts/connect-agent.ts`, `scripts/preflight.ts` |
| Demo instructions | `DEMO.md` |
| Product/design reference | `PRODUCT.md`, `DESIGN.md` |

## Run and configure

Use Node 24 and the repository lockfile:

```sh
npm ci
cp .env.example .env  # only on a new checkout; preserve an existing local configuration
npm run preflight
npm start
```

The dashboard runs at `http://127.0.0.1:8787`; MCP HTTP runs at port 8788. `npm run demo:acme` starts the mock Acme service in another terminal. See `.env.example` for Claude, Primitive, sender/approver identities, model selection, database location, and MCP token settings.

Keys, actual reviewer configuration, SQLite demo data, dependencies, and runtime files stay local and are ignored by Git. The live email demo uses a separate SQLite database so earlier local testing is preserved. A new checkout must configure its own credentials and seed its own data. Follow `DEMO.md` for setup; do not reset an active demo database merely to restart the worker.

## What was verified on this workstation

- **153 automated tests pass**, including decision parsing/templates, rendered statuses, legacy migration, protection rule persistence, exact-scope grants and revocation, HTTP form validation/security, and a fake-transport pipeline covering automatic approval and return to human review after revocation.
- TypeScript typecheck and `git diff --check` pass.
- The live application uses Claude and Primitive. Real approval emails were delivered, and actual human replies exercised approve, edit, and deny paths through to delivery.
- A fresh email with all three improved button templates was delivered; its mailto reply bodies include the optional reason section and the edit answer field. End-to-end human use of the new reason field has not yet been verified.
- The Rules page and redaction preview were exercised locally; preview redacted protected customer text while preserving unrelated instructions.
- The mock Acme test reproduces the intended duplicate-charge failure. A complete agent-applies-fix → green-test → outcome-report sequence was not rerun on this workstation. Earlier build notes describe separate historical verification.
- Full Claude Desktop, ChatGPT, and Codex MCP client onboarding was not newly verified on this workstation.

## Suggested demo

Use `DEMO.md` for the full sequence:

1. Show the failing concurrent-retry test against the synthetic Acme SDK.
2. Have an agent request help through MCP; show the pending request in the dashboard.
3. Show the cleaned draft and the real approval email on a phone.
4. Tap Edit, enter an optional reason and replacement answer, then send. Show **Delivered (edited)** and retrieve the delivered answer.
5. Have the agent apply the fix and run the test. Only report an outcome after observing the actual test result.
6. Rehearse separate approve and deny requests. Optionally show a protection preview and an exact automatic approval scope, then revoke that scope after demonstration.

## Remaining limits and follow-ups

- The transcript and Acme SDK are synthetic fixtures. One local worker represents both companies in the demo.
- The dashboard has no login and is intended for a trusted local operator.
- Email buttons compose replies; they do not submit a decision until the user sends the message. Email provider recipient permissions must be satisfied for the configured approver.
- Automatic approval applies only to an explicitly authorized exact requester/topic scope. Already queued reviews remain manual.
- Outcome reporting exists in the backend but is not automatically inferred from delivery.
- The notification polling window currently excludes notifications older than 24 hours; old email-based revocation replies may be missed. Revoke active scopes directly on the Rules page when needed.
- Request polling currently reads a bounded list before filtering; more than 1,000 newer records could leave older work outside that batch. Address pagination before larger deployments.
- Public tunnel uptime and external client onboarding need a fresh rehearsal before relying on them for a presentation.
