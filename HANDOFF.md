# Nanobite: handoff and next steps

Written 2026-10-17 evening, before Sunday 10:00 AM submissions. Read this first; `DEMO.md` is the stage script, `PLAN.md` is the full build log, `HANDOVER.md` is the original spec.

## What Nanobite is

A coding agent hits a bug that an engineer at another company already solved, in a session that never became docs. Nanobite lets the agent ask the other company's agent for exactly that answer. The answer passes three gates before anything leaves: rules mask names, tickets and secrets; Claude drafts the smallest answer; a human approves the exact words from an email on their phone. The asking agent never blocks: it gets `pending`, keeps working, and picks up the answer later.

Tracks: **Primitive** (agents with email identities, asking and replying asynchronously) and **Manufact** (an MCP server built for agents as the primary user).

## How it fits together

```
Yunha's agent  (Claude Desktop, Claude Code, Codex, or ChatGPT)
   │ 1. calls request_context  (MCP tool)
   ▼
Nanobite MCP server ── saves the request ──▶ shared database ──▶ dashboard (live tracker)
                                                   │
                                          Nanobite worker
   2. emails the question:  yunha-agent@fair-fly ──▶ sdk-help@fair-fly      (Primitive)
   3. Gate 1 masks names, tickets, secrets · Gate 2: Claude drafts the smallest answer
   4. Gate 3: approval email ──▶ TK's phone · TK taps Approve ──▶ email back
   5. answer emailed back:  sdk-help@fair-fly ──▶ yunha-agent@fair-fly
   ▲
   │ 6. agent calls get_context_request and receives the approved answer
Yunha's agent
```

For the demo both companies' sides run in one worker on one laptop and talk only through real email. In production each company runs its own.

## What works and is verified

| Piece | Status |
|---|---|
| Live email through Primitive (`fair-fly.primitive.email`) | Verified end to end, including a real phone reply from Outlook |
| Approval email with Approve / Deny / Edit buttons | Verified live: the Approve button's email was accepted and delivered on the next poll |
| Claude drafting (`claude-opus-5-5`) with plain-language summary | Verified; benchmark 3 of 3 |
| Dashboard: live updates, four-point tracker, completion animation, Activity log | Verified in Chrome |
| MCP over HTTP (`127.0.0.1:8788/mcp`) | Verified with Claude Code (Connected) and a real agent run |
| Claude Code as Yunha's agent | Verified: red test, request, approval, fix, green, outcome reported |
| Claude Desktop | Configured and launch command verified; **not yet tried inside the app** |
| ChatGPT | Tunnel verified from the public internet (tools list, wrong token refused); **connector not yet created in ChatGPT** |
| Codex | Config printed by `npm run connect -- codex`; **not tested** (not installed here) |

134 automated tests pass; typecheck is clean.

Measured numbers you can quote (in characters, not tokens): a median real Claude Code session on our laptops is **52,403 characters** (61 sessions, `npm run stats:sessions`); the approved answer is about **500 to 660**. Request to approval email takes about 5 to 10 seconds; TK's reply to delivered answer takes about 1 second.

## Run it

From `/Users/yunhalee/dev/goat-yc-hackathon-contextpr` (branch `claude/contextpr-continue`):

```sh
npm ci                                   # first time on a machine
npm run reset && npm run seed            # clean demo data
npm run preflight                        # must end with "Ready for the demo."
npm start                                # worker + dashboard http://127.0.0.1:8787 + MCP over HTTP :8788
npm run demo:acme                        # mock Acme API for the red-to-green test (second terminal)
```

The `.env` file holds the Claude key, Primitive key, MCP token and identities. It is git-ignored and exists only on Yunha's laptop. Another laptop needs its own `.env` (see `.env.example`). **Rotate the Claude and Primitive keys after the hackathon**: both were pasted into a chat.

The approver is TK's Stanford address. Primitive only emails addresses that have written to it first; TK already did. A different approver must email `sdk-help@fair-fly.primitive.email` once first (`npm run preflight` checks this).

## Next step 1: test each connector

Do these in order; each takes about five minutes. Run `npm run reset && npm run seed` afterwards so the demo starts clean.

**Claude Desktop (most important: this is the showcase client)**
1. `npm start` running. Quit Claude Desktop fully (Cmd+Q) and reopen it; it was set up with `npm run connect -- desktop`.
2. In a new chat, check that Nanobite appears in the tools menu.
3. Paste: *"Our concurrent-retry test fails: expected 1 charge, got 2, with Acme SDK 2.3. Use Nanobite's request_context to ask sdk-help@fair-fly.primitive.email why concurrent retries create duplicate charges and how to keep one idempotency key. Topic acme-sdk/retries, on behalf of Yunha. Don't wait for the answer."*
4. Approve the tool prompt (choose "always allow" so it won't ask on stage).
5. Expected: Claude says `pending`; within a second the request appears at http://127.0.0.1:8787 and the tracker starts; TK's phone gets the email in about 10 seconds.
6. After TK approves, ask Claude: *"Check the request and show me the answer."*
7. If Nanobite does not appear: open `~/Library/Logs/Claude/mcp-server-nanobite.log`. The previous config is saved as `claude_desktop_config.json.before-nanobite`.

**ChatGPT**
1. `npm start` running, then `npm run chatgpt` in another terminal. It prints a secret connector URL. The URL changes every run, and anyone with it can file requests, so keep it private.
2. In ChatGPT: Settings › Apps & Connectors › Advanced › Developer mode on, then Create a connector: name Nanobite, the printed URL, Authentication: No authentication.
3. Developer mode may require a paid or business plan; sources disagree. If the menu is missing, skip ChatGPT; it is not needed for the tracks.
4. In a chat, enable Nanobite and send the same prompt as above. ChatGPT asks to confirm write tools; confirm.

**Claude Code (backup client, and the only one that runs the red-to-green test)**
1. `claude --allowedTools "Bash(npm run demo:test)" "mcp__nanobite" "Read" "Edit"` in the repo. Registered with `npm run connect -- claude`.
2. Follow `DEMO.md` on-stage steps 2 to 5.

**Codex (optional)**
1. Install Codex, run `npm run connect -- codex`, paste the printed block into `~/.codex/config.toml`, and `export CONTEXTPR_MCP_TOKEN=<MCP_HTTP_TOKEN from .env>`.
2. Same prompt as Claude Code.

## Next step 2: record the demo video (backup for stage, and the submission)

Target 2 minutes. Record the laptop screen with the dashboard and the agent side by side, and TK's phone with a second camera or screen recording.

| Time | Shot | Say |
|---|---|---|
| 0:00 | Agent window: the failing test or the prompt | "Yunha's coding agent is stuck on a bug that TK at Acme already fixed for another customer. That fix only exists in TK's session." |
| 0:15 | Agent sends `request_context`, gets `pending`; dashboard shows the new request | "It doesn't block. The request goes out as email to Acme's agent." |
| 0:30 | Dashboard tracker: Asked, Received, then Three gates moving | "Gate 1 masks the other customer's name. Gate 2, Claude drafts the smallest answer." |
| 0:45 | TK's phone: the email, summary on top, exact answer, flagged v2.5 | "TK reads a plain-English summary, then the exact words that would leave Acme." |
| 1:00 | TK taps Approve, then Send | "A human approves every word, with one tap." |
| 1:05 | Dashboard: Gate 3 and Delivered pop to done | (let the animation play) |
| 1:15 | Agent receives the answer; Claude Code applies the fix; test turns green | "The fix lands in Yunha's session." |
| 1:35 | Activity log at the bottom of the request page | "Everything that left is logged." |
| 1:45 | Closing line | "A typical session is 52,000 characters. What left Acme was 500, and a human read every word." |

Before recording: `npm run reset && npm run seed`, `git checkout demo/yunha-app/charge.ts`, `npm run preflight`, and dismiss every tool permission prompt once.

## Next step 3: pitch deck (6 slides)

1. **Problem.** Coding agents rediscover fixes that already exist in someone else's session, at another company, that never became docs. Asking today means a support ticket (a day) or interrupting an engineer (ten minutes of writing).
2. **Nanobite.** One MCP tool: your agent asks the other company's agent. It never blocks. The answer comes back by email after three gates.
3. **The three gates.** Rules mask names, tickets and secrets. Claude drafts the smallest answer. A human approves the exact words from a phone. Show the email screenshot and the tracker.
4. **Why it is different.** Shared-memory tools pool the whole workspace; MCP gateways filter but never ask a human; clean rooms do this for tables, not answers. We could not find a product that does all three gates between two companies' agents. (Never say "nobody does this".)
5. **Built for agents (Manufact).** Pending plus `poll_after_seconds`, `next_action` on every response, recovery hints on errors, answers labeled as external data, not instructions. Works in Claude Desktop, Claude Code, Codex and ChatGPT, over stdio or HTTP.
6. **Built on email (Primitive).** Every agent has an address; the human's approval is an email reply; button emails work on any phone; trust comes from DMARC and the sender. Numbers: 52,403 characters to about 500; about 1 second from TK's tap to delivery.

Prepared judge answers are in `HANDOVER.md` sections 3 and 7.

## Known limits

- The demo transcript and the Acme SDK are synthetic fixtures.
- Collapsing "Details" in the email works in Apple Mail; Gmail and Outlook keep it hidden.
- One-tap approval without pressing Send would need a public web page; buttons open a ready-to-send email instead.
- The dashboard has no login; it binds to `127.0.0.1` and is for one operator.
- The ChatGPT tunnel is a free Cloudflare quick tunnel with no uptime guarantee.

## Where things are

| Thing | Location |
|---|---|
| Stage script | `DEMO.md` |
| Build log with every verification | `PLAN.md` |
| Design rules | `DESIGN.md` |
| Worker, gates, email, MCP | `src/pipeline`, `src/gates`, `src/mcp` |
| Dashboard and tracker | `src/dashboard` |
| Agent setup, preflight, ChatGPT tunnel | `scripts/connect-agent.ts`, `scripts/preflight.ts`, `scripts/chatgpt-tunnel.ts` |
| Code | GitHub `jjang-07/goat-yc-hackathon`, branch `claude/contextpr-continue` (`main` still holds only the original handover) |
