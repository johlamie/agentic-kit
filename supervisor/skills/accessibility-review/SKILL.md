---
name: accessibility-review
description: Review accessibility requirements, implementation evidence, and rendered interaction behavior for web products. Use for design review, component review, keyboard and screen-reader flow analysis, responsive UI audits, release readiness, or any finding involving semantics, focus, contrast, labels, errors, motion, zoom, or assistive technology.
---

# Accessibility Review

Assess accessibility as part of product quality and task completion, not as a cosmetic checklist.

## Workflow

1. Read `../../../shared/protocols/ui-ux-audit.md`.
2. Establish applicable targets and product-critical tasks. Prefer current official accessibility standards when external verification is needed.
3. Inspect semantic structure, names and descriptions, keyboard order, focus visibility and restoration, dialogs, status announcements, form instructions and errors, tables, media alternatives, contrast, non-color cues, touch targets, motion controls, zoom/reflow, and orientation behavior.
4. For a rendered audit, test the critical path using keyboard-only interaction at every required viewport. Use automated checks as evidence, not as proof of conformance.
5. Describe each issue with the affected user, task impact, reproducible evidence, likely standard criterion, and smallest durable correction. Do not claim screen-reader coverage unless it was actually executed.
6. Escalate a defect that prevents a critical task, exposes the wrong content, traps focus, or creates serious safety risk. Return the standard Supervisor decision vocabulary.

Keep infrastructure failures separate from accessibility findings and never lower the outcome merely because most automated checks pass.
