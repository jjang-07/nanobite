# ContextPR

Pull the missing context, not the whole workspace. ContextPR lets a coding agent ask another company for a narrow answer drawn from session transcripts. Rules and minimization prepare the draft; a human approves the exact words by email before delivery.

Requires Node 24 or newer. Run `npm install`, copy `.env.example` to `.env` and configure it, then `npm run seed` and `npm start`. Unit checks: `npm test` and `npm run typecheck`. The remaining commands are implemented in handover order.

## Integration verification

2026-10-17: Primitive's credential-free synthetic send/inbox endpoints returned HTTP 200 and `demo:true`; these establish schema compatibility only. The real `npm run smoke:primitive` probe is blocked because `.env` and credentials are absent. Actual delivery, sender entitlements, human approval and live cursor behavior remain unverified. Cursor mapping prefers server `meta.cursor`; error logging omits raw response bodies to avoid exposing credentials or message content. See https://api.primitive.dev/v1/openapi and https://www.primitive.dev/docs/sandbox.

Dependency correction: MCP server 2.3.1 requires the newer Standard Schema JSON interface, so the direct Zod dependency is 4.2+ instead of the handover's 3.25.76. Both integrations import `zod/v4`. The specified older Zod failed type checking against the installed MCP SDK.
