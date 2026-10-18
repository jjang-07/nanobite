# Nanobite demo: one approved answer, one fixed test

Show a coding agent obtaining a narrow answer from a vendor's synthetic engineering transcript, with a real human reviewing what leaves. Both sides run on this laptop for the demo. Primitive carries real email; the Acme SDK, charge records, and source transcript are synthetic.

## Configure the live demo

Keep credentials in the ignored `.env`. The Claude key handles drafting. A separate Primitive key handles agent mail and your approval reply. Use your own Primitive managed subdomain and real reviewer inbox:

```dotenv
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=<your Claude key>
ANTHROPIC_MODEL=<a model available to your account>
MAIL_PROVIDER=primitive
PRIMITIVE_API_KEY=<your Primitive API key>
REQUESTER_IDENTITY=requester@<your-subdomain>.primitive.email
RESPONDER_IDENTITY=sdk-help@<your-subdomain>.primitive.email
APPROVER_EMAIL=<your real email address>
POLL_WAIT_SECONDS=3
CONTEXTPR_DB=./data/email-demo.db
```

Keep the existing dashboard URL and port. For an HTTP MCP client, also set a random `MCP_HTTP_TOKEN`; stdio works without one. Only expose the MCP endpoint if a remote client requires it. The dashboard stays local.

Before starting, send an email from `APPROVER_EMAIL` to `RESPONDER_IDENTITY`. Primitive uses authenticated inbound mail to recognize external recipients; exact outbound permissions depend on the account. Check them with preflight rather than assuming the account can email anyone. See https://docs.primitive.dev/docs/quickstart.

Stop the existing worker, then run from the repo (Node 24+ and npm required):

```sh
npm run seed
npm run preflight
npm start
```

The separate database preserves the local-inbox rehearsal. Seed must run after changing the responder identity so its transcript and rules belong to the configured responder. Preflight must report no problems. In a second terminal:

```sh
npm run demo:acme
```

Connect the coding agent using `npm run connect -- claude` (HTTP), `npm run connect -- claude stdio`, or the documented Codex setup. Confirm its four Nanobite tools appear before presenting. Open http://127.0.0.1:8787 alongside the agent. Ensure `demo/yunha-app/charge.ts` still has the original buggy call and no saved approval rule exists for this test scope. Use a fresh demo database for a fresh rehearsal rather than deleting unrelated work.

## Main demo: about three minutes

1. **Show the failure.** Run `npm run demo:test`. It must fail with `expected 1 charge, got 2`. Explain: a retry generates a new payment key; the first request may already have succeeded.
2. **Ask the agent.** Prompt: “Use request_context to ask the configured responder why SDK 2.3 retry timeouts create duplicate charges and how to preserve one idempotency key. Topic acme-sdk/retries. Include the failing test output. Continue other work while approval is pending.” Replace the responder with your configured address. Show `pending` and the dashboard's Asked → Received → Approval → Delivery tracker.
3. **Review on your phone.** Open the actual approval email. Show its plain-language summary, exact answer, and any flags. Explain that rules mask protected details and the model proposes a narrow answer; you decide what leaves.
4. **Edit and send.** Tap Edit, keep `edit` on the first line, optionally fill in Decision reason, and replace only the Answer to share section with the complete answer you approve. If the draft contains an unreleased version, remove it. If it does not, make a small useful clarification. Preserve the supported fix. Press Send. The button composes an email; it does not submit a decision by itself.
5. **Show delivery.** The dashboard should show Delivered (edited) / Edited by you. Ask the agent to call get_context_request, apply the approved answer, rerun `npm run demo:test`, and report_outcome using the actual test result. Show green: one charge.
6. **Show the record.** Open the exact approved text, the changes from the draft, and the Activity log. Close with: “The agent got the missing fix. You controlled the exact words that left.”

For the included SDK, the supported one-line fix is:

```ts
return withRetry(() => client.charge({ amount: 4200, currency: 'usd', customer: 'cus_123' }), { preserveIdempotencyKey: true });
```

Claude Desktop can show the request and answer, but the red-to-green portion needs a coding agent or terminal that can edit and run the test.

## Exercise the other decisions before presenting

Create a separate fresh request for each decision. A finished request cannot be changed by a later reply.

| Path | Your action in email | Expected result |
|---|---|---|
| Approve | Tap Approve, then Send; or reply `approve` | Delivered; Approved by you |
| Edit | Tap Edit, optionally add a decision reason, and change the Answer to share section; then Send | Delivered (edited); Edited by you |
| Deny | Reply `deny` plus a reason | Delivered (denied) / Denied by you; requester receives a denial |

Every button includes a Decision reason (optional) field. Leaving it blank is valid. Approval and edit reasons remain in the review record; only the Answer to share text is released. Denial reasons are included in the denial sent to the requester. Old replies such as `approve`, `deny <reason>`, and `edit` followed by the replacement still work.

Avoid Approve always during these checks: it creates a scoped rule that skips fresh review on later matching requests. Denial is a useful short second example after the main demo; there is no need to repeat the full test-fix sequence three times on stage.

## Recovery

- **No approval email:** run preflight, check Primitive permissions, and confirm the real inbox wrote to the responder address first.
- **No draft:** check the selected Claude model, key, and source seeding for the configured responder.
- **Reply ignored:** send from the configured approval address, keep the request ID in the subject, and put only the decision command on the first line. Edited content follows it.
- **Email service unavailable:** use a separate local-inbox database with `MAIL_PROVIDER=local` and approve in the dashboard. Label this as the local fallback.
- **No network:** live email and Claude both need connectivity. A recording or an already configured local model is a separate fallback; local mail alone does not make Claude work offline.
