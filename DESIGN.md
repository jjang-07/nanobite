---
name: Nanobite
description: A focused engineering context review interface.
colors:
  background: "#ffffff"
  text: "#181818"
  muted: "#626262"
  separator: "#e5e5e5"
  state: "#185cba"
  control-border: "#8f8f8f"
  button-border: "#777777"
  primary-hover: "#333333"
typography:
  heading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.22
    letterSpacing: "-0.03em"
  heading-compact:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.22
    letterSpacing: "-0.03em"
  brand:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "20px"
    fontWeight: 650
    letterSpacing: "-0.03em"
  section:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 500
  metadata:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  dense-label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: "0px"
spacing:
  small: "8px"
  medium: "16px"
  field-gap: "24px"
  section-gap: "32px"
  page-gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
---

# Nanobite design system

## Overview

Nanobite is a focused working interface for engineering questions and human review. Its incumbent visual identity is plain, precise, and restrained: white space, strong text hierarchy, and horizontal rules organize the work. This document records the implemented interface in `src/dashboard/render.ts`; it does not introduce a separate brand concept.

The question, current state, exact answer, and next action take precedence over request IDs and transport details. Technical evidence remains available through native disclosures.

## Colors

White is the page and control background. Near-black carries content and primary actions. Muted gray is for supporting text, dates, and labels; it is also the placeholder color. Hairline separators divide rows and sections.

Blue is reserved for request state, which always also has a text label. Buttons, links, flags, and diffs use the neutral palette. Focus outlines use near-black so they remain visible outside both light and dark controls.

## Typography

Use one system sans-serif stack throughout, including exact answer text. Do not introduce a display face, external font download, decorative uppercase heading, or an eyebrow that repeats the heading below it.

The main heading is 2rem, dropping to 1.625rem on screens 760px or narrower. Section headings are 1.375rem. The brand stays 20px across viewports. Body and question text use 16px, notes and labels use 14px, metadata uses 13px, and dense table labels use 12px. The 26px compact main heading is an intentional responsive step; there is no text below 12px. Empty-state and evidence headings use the same 22px section step. Use fixed type sizes for this operational interface rather than fluid display typography.

Main questions have a maximum width of 36 characters. Prose is limited to roughly 72 characters; exact answer text can use up to 78 characters and retains whitespace. Long identities, IDs, and unbroken content wrap within their container.

## Layout

The shell is centered at a maximum width of 1320px with 40px side gutters. Gutters become 28px below 1000px and 20px below 760px. Sections use a top separator, about 28px of internal space, and a 32px preceding gap.

The desktop inbox is a compact nine-column table. The question and request link lead each row; state and operational metadata follow. Below 760px, each row becomes a vertical series of labeled fields. Keep all data available and avoid a horizontally scrolling page. Native table headers remain accessible.

Forms use two columns where space allows and one column on small screens. The question and supporting context occupy the full width. Detail pages place the question and state first, then draft and review, three-gate summary, decision, request context, timeline, and collapsed technical evidence.

## Elevation & Depth

The interface is flat. Separate content with space and hairline rules. Do not use shadows, gradients, raised panels, or repeated card containers. Do not add motion to routine state or navigation changes. The one exception is the tracker's current step: a thin ring pulses to show the request is live and waiting, and it stops under reduced motion.

## Shapes

Controls have square corners and a clear one-pixel boundary. Use simple rectangular primary and secondary buttons. Primary actions use near-black fill and white text. Secondary actions stay white with dark text. Text links retain an underline where needed for recognition.

## Components

- **Header:** Nanobite links to the inbox. The configured mail mode and model provider stay visible without displaying secrets.
- **Inbox:** Show useful questions rather than a list dominated by identifiers. An empty inbox explains the first request and offers a direct path to the form. A caption gives actual request and pending-review counts.
- **State:** Pair a textual state with a plain-language explanation. Accent color never carries meaning alone.
- **Review:** The draft remains selectable and preserves its exact text. Approve draft is the immediate action. Editing, scoped future approval, and denial use clearly named disclosures. Their submit values remain distinct.
- **Forms:** Associate every field with a visible label. Explain optional inputs and non-obvious constraints. Use at least 44px-tall targets, 16px text in textareas, and a two-pixel visible focus outline offset by four pixels.
- **Live updates:** The Inbox table and the request detail update in place about once a second while the page is visible. They poll a version endpoint, swap only the live region, and never reload the page. Updates pause while a form has focus or unsaved edits. A small "Live" stamp in the heading shows the last update time; the manual Refresh link remains.
- **Tracker:** Each request shows a delivery-style track of seven stages: Asked, Received, Gate 1 Rules, Gate 2 Minimize, Gate 3 Human, Delivered, Outcome. The three gates are grouped under one label. Done stages are filled blue with a time; the current stage is a blue ring with its waiting text (for example "Waiting for TK"); a stop is near-black with its reason; skipped stages are dashed and read "Not shared". Every status is also written in words. Below 760px the track is vertical. Inbox rows show the same stages as a seven-segment bar under the state text.
- **Approval email:** The same language in email: system sans, white page, hairline rules, muted labels, square tags, no images or icons. The exact draft comes first with a near-black left rule, then masked items, flags, sources, requester and topic as labeled rows, then the four reply commands. Inline styles and table layout only, a plain-text part always included, and it fits a 390px phone without horizontal scrolling.
- **Submission:** Unsaved changes block refresh and offer an explicit discard action. Submit feedback marks the form busy and blocks a duplicate submission while preserving the selected action value.
- **Evidence:** Use native details/summary controls for transport IDs, source IDs, raw event details, and line changes. Keep changes readable through text addition/removal marks, not color alone.
- **Errors:** Use the same shell and typography, a specific explanation, and a safe return link. Do not substitute a bare server string for a recovery page.

## Do's and Don'ts

Do foreground the question, exact answer, current state, and next step. Do preserve the three-gate flow and every explicit human action. Do check keyboard navigation, long content, narrow layouts, and form preservation.

Do not add decorative icons, imagery, cards, shadows, gradients, repeated kicker labels, invented metrics, or simulated activity. Do not imply that a local message was emailed or that a configured model has produced a verified result. Do not hide model flags or turn an approval into an automatic action.
