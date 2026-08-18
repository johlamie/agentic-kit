---
name: visual-quality-audit
description: Audit a real rendered web interface with browser evidence across mobile, tablet, desktop, and large desktop. Use after UI implementation, before release, or when a technically working frontend may have weak hierarchy, interaction quality, responsive behavior, accessibility, visual consistency, trust, or perceived product quality.
---

# Visual Quality Audit

Inspect the rendered product rather than inferring quality from source code.

## Preconditions

1. Read `../../../shared/protocols/ui-ux-audit.md`.
2. Require an explicit local or approved staging URL and a working browser capability. If either is missing, report an infrastructure error; do not invent screenshots or a UI score.
3. Do not enter credentials, bypass authentication, accept terms, mutate production data, or visit unapproved external targets.

## Browser Audit

1. Open each representative route at 390x844, 768x1024, 1440x900, and 1920x1080 unless the audit contract specifies other viewports.
2. Exercise critical navigation and interactions. Inspect initial, loading, empty, populated, validation, failure, destructive-confirmation, and recovery states where available.
3. Check clipping, overflow, reflow, touch targets, keyboard access, visible focus, heading/landmark structure, labels, error association, contrast evidence, zoom resilience, and motion behavior.
4. Assess hierarchy, scanability, information architecture, consistency, density, brand distinction, trust, and whether generic dashboard or AI-generated patterns harm the product's jobs.
5. Record route, viewport, action, expected behavior, observed behavior, and artifact reference for every material finding. Separate application defects from browser/MCP/setup failures.
6. Score only when evidence covers the required routes and viewports. Critical accessibility, task-completion, data-integrity, or deceptive-interface defects override an average score.

## Decision and Proposal

Return `PASS`, `CHALLENGE`, `BLOCK`, or `HUMAN_REQUIRED`. If a stronger direction is justified, write only an isolated proposal artifact with scope and attribution; never edit Claude's active frontend.
