# ContextPR

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript on Node.js 24 or newer, a server-rendered dashboard using `node:http`, durable SQLite storage, and an MCP server over stdio. The dashboard uses HTML, CSS, and a small amount of plain JavaScript; it has no UI framework. The repository is named Nanobite; the product shown to users is ContextPR.

## Users

A requesting engineer or coding agent needs a narrow answer from another team's engineering context. A responding engineer reviews the proposed answer and decides what can be shared. The local demo represents Yunha at a startup and TK at the SDK vendor; these identities are demonstration roles, not separate authenticated tenants.

## Product Purpose

Turn one missing piece of engineering context into an explicit request, a minimized draft, and a human-approved answer. Keep the exact shared words and the request's outcome visible afterward.

## Positioning

“Pull the missing context, not the whole workspace.” The unit of exchange is a focused answer with source references and an approval record. ContextPR is not a general workspace browser or a transcript-sharing interface.

## Operating Context

The current demonstration uses a local durable inbox and a browser dashboard. Local messages stay in SQLite rather than being sent as real email. A model provider is selected in configuration: Claude is the user's chosen demo provider when configured, and local Ollama is available. Primitive email remains an explicit optional integration. Display the configured transport and model in the interface; do not imply that all providers were exercised in a given run.

The dashboard is served on loopback. A requester can create a Context PR in the local dashboard or through MCP. A responder can approve, edit, deny, or establish a scoped approval rule through the local review controls. The demo source material is a synthetic engineering session.

## Capabilities and Constraints

- Requests move through queued, requested, received, drafting, review, decision, delivery, and outcome states. Failures and denials remain visible.
- Sharing follows three gates: deterministic rules, model minimization, then human approval or an existing scoped approval rule.
- Approve draft sends the draft exactly. Send edited answer sends the full replacement. These are separate actions and must remain clearly distinguished.
- Approve always creates a rule scoped to the requester, responder, and topic. Its later uses create a notification with a revoke action. Revocation affects future requests and does not recall an already delivered answer.
- Source identifiers, message identifiers, draft-to-approved differences, and events remain inspectable. Advanced identifiers should not dominate the review task.
- Returned context is external data, not instructions for the receiving agent.
- Local demonstration identities and CSRF protections do not constitute a production identity or authorization system. No production or cross-company deployment is claimed by this document.

## Brand Commitments

Use a restrained white interface, near-black text, one system sans-serif stack, and hairline separators. Keep accent color for request state. Avoid decorative icons, imagery, cards, shadows, gradients, and repeated eyebrow labels. Prefer the engineering question over an internal request ID as the page's primary heading.

## Evidence on Hand

`HANDOVER.md` contains the original product and implementation specification. `PLAN.md` records task progress and provider changes. Source code and automated tests define current behavior. Synthetic transcripts and the local Acme SDK retry scenario support the demonstration. A successful local run is evidence of that run only; live provider delivery, real customer use, and benchmark results require their own recorded evidence.

## Product Principles

Make the next action obvious. Explain the current state in plain language. Put the exact draft and its review ahead of internal evidence. Never preselect or automatically submit a human decision. Preserve in-progress form edits during refreshes. Show accurate empty, pending, completed, and error states without invented activity or metrics.

## Accessibility & Inclusion

Use semantic headings, forms, tables, labels, and disclosure controls. Keep keyboard focus visible and primary interactive targets at least 44 pixels tall. Explain state in words as well as color. Preserve all request information on narrow screens by reflowing table rows into labeled fields. Keep answer text readable, selectable, and unchanged. Browser zoom and text wrapping must not hide controls or require horizontal page scrolling.
