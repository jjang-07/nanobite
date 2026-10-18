# Nanobite demo (local server, 3 minutes)

**Cast.** Yunha: startup engineer, laptop with Claude Code. TK: Acme engineer, phone with the inbox set as `APPROVER_EMAIL` in `.env`.

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
5. Terminal 3, in the repo: `claude --allowedTools "Bash(npm run demo:test)" "mcp__nanobite" "Read" "Edit"`. Answer any MCP prompt now, not on stage.

## On stage

1. **Say:** "Yunha's coding agent is stuck on a bug that TK at Acme already fixed for another customer. That fix only exists in TK's session."
2. **Paste into Claude Code:**
   > Run npm run demo:test. If it fails, ask Acme's agent sdk-help@fair-fly.primitive.email with request_context, topic acme-sdk/retries, on behalf of Yunha. Don't wait for the answer.

   Red, 2 charges instead of 1. The agent gets `pending` and moves on. **Say:** "It doesn't block. A human at Acme decides what leaves."
3. **TK's phone buzzes** about 5 seconds later. **Say while TK reads:** "The customer name is already masked. The model flagged the unreleased v2.5. TK sees the exact words."
4. **TK replies `approve`.** The answer is delivered about 1 second later.
5. **Paste into Claude Code:**
   > Check the request. Apply the fix from the capsule, rerun npm run demo:test, and report the outcome.

   Green, 1 charge.
6. **Browser:** refresh the Inbox and open the request. Show what was masked, TK's decision, and the outcome `passed`.
7. **Close:** "A typical session on our laptops is 52,000 characters. What left Acme was 500, and a human read every word. Connected agents decide what to share. Nanobite lets the human decide, with one tap."

## If something breaks

- **No email to TK:** run `npm run preflight` and follow its fix line.
- **Live run fails:** play the backup video.
- **No network:** set `MAIL_PROVIDER=local` in `.env`, restart, and approve in the browser instead.
