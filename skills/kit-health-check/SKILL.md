---
name: kit-health-check
description: "Use when a major phase ends, or the project grew and shows structural strain. Proposes a staged improvement without applying it. Arabic triggers: المشروع كبر، راجع الهيكل، refactor."
---

# Project health check

## Signs (indicators, not hard limits)
- Files around or above 300 lines mixing several responsibilities.
- The same code a third time.
- One feature requires edits in unrelated places.
- Fixes break other things.
- UI, business logic and data access are tangled.
- A new unplanned need: more users, roles, payments, another platform.
- Slow builds, tests or pages; outdated or abandoned dependencies.
- Missing tests around important behavior.

## Process
1. Measure with evidence: files, examples, numbers. Ignore taste-only issues.
2. Report each problem, its current cost, the proposed change, risk, effort and task level.
3. This is YELLOW: wait for approval.
4. Add approved items to `docs/PLAN.md` and the reason to `docs/DECISIONS.md`.
5. Execute in small steps: tests pass before and after; refactor commits stay separate from feature commits; behavior stays the same.
6. Update `docs/ARCHITECTURE.md`.

Never rewrite the project from scratch without explicit approval. "No change needed" is a valid result.
