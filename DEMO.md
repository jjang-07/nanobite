# Nanobite demo (local server, 3 minutes)

**Cast.** Yunha: startup engineer, laptop with Claude Desktop (or Claude Code). TK: Acme engineer, phone with the inbox set as `APPROVER_EMAIL` in `.env`. Requests come only from the agent; the dashboard just watches.

## Before going on stage

1. **Once ever:** TK emails `sdk-help@fair-fly.primitive.email` (any text). Primitive refuses to email TK until TK writes first.
2. Terminal 1, in the repo:
   ```sh
   git checkout demo/yunha-app/charge.ts && npm run reset && npm run seed && npm run preflight
   npm start
   ```
   Preflight must end with `Ready for the demo.`
3. Terminal 2: `npm run demo:acme`
4. Browser: http://127.0.0.1:8787
5. **Agent, pick one.** Claude Desktop: run `npm run connect -- desktop` once, quit and reopen Claude Desktop, and check that Nanobite appears under its tools. Claude Code: in Terminal 3, in the repo, run `claude --allowedTools "Bash(npm run demo:test)" "mcp__nanobite" "Read" "Edit"`. Either way, approve the first tool prompt now, not on stage.

## On stage

1. **Say:** "Yunha's coding agent is stuck on a bug that TK at Acme already fixed for another customer. That fix only exists in TK's session."
2. **Ask the agent.** In Claude Code, paste:
   > Run npm run demo:test. If it fails, ask Acme's agent sdk-help@fair-fly.primitive.email with request_context, topic acme-sdk/retries, on behalf of Yunha. Don't wait for the answer.

   In Claude Desktop, which cannot run the test, paste:
   > Our concurrent-retry test fails: expected 1 charge, got 2, with Acme SDK 2.3. Use Nanobite's request_context to ask sdk-help@fair-fly.primitive.email why concurrent retries create duplicate charges and how to keep one idempotency key. Topic acme-sdk/retries, on behalf of Yunha. Don't wait for the answer.

   The agent gets `pending` and moves on, and the request appears in the Inbox within a second. **Say:** "It doesn't block. A human at Acme decides what leaves."
3. **TK's phone buzzes** about 10 seconds later. **Say while TK reads:** "TK reads a plain-English summary first, then the exact words. The customer name is already masked, and the model flagged the unreleased v2.5."
4. **TK taps Approve, then Send.** The button writes the reply for TK. The tracker on the Inbox page fills Gate 3, then Delivered, without a refresh.
5. **Ask the agent:**
   > Check the request. Apply the fix from the capsule, rerun npm run demo:test, and report the outcome.

   Green, 1 charge. (In Claude Desktop, ask it to check the request and show the answer.)
6. **Browser:** open the request. The tracker shows the three gates in vivid blue; the Activity log at the bottom shows what was masked, TK's decision, and the outcome.
7. **Close:** "A typical session on our laptops is 52,000 characters. What left Acme was 500, and a human read every word. Connected agents decide what to share. Nanobite lets the human decide, with one tap."

## If something breaks

- **No email to TK:** run `npm run preflight` and follow its fix line.
- **Live run fails:** play the backup video.
- **No network:** set `MAIL_PROVIDER=local` in `.env`, restart, and approve in the browser instead.
