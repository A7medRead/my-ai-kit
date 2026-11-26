---
name: kit-review
description: "Use to review code changes before merge, or to check work done by another model or session. Read-only unless the user asks for fixes. Arabic triggers: راجع، مراجعة الكود."
---

# Review

Do not edit code unless asked. Judge the code, not the author's description of it.

1. Define the scope: the branch diff against `main`, a commit range, or uncommitted changes. Read the task and its "done when" line.
2. Check, in order:
   - **Correctness:** does it do what was asked? Edge cases, error paths, concurrency.
   - **Breakage:** callers, APIs, data and existing behavior.
   - **Security:** use `kit-security` for sensitive areas.
   - **Honesty:** skipped or weakened tests, swallowed errors, hard-coded results, claims without evidence.
   - **Maintainability:** duplication, unneeded complexity or dependencies, naming, project conventions.
   - **Tests:** each part of "done when" has evidence, and its test fails when that rule is broken. Run the old and new versions of a changed test against the same breakage. Use a temporary copy or a rolled-back transaction, never real data. Report evidence that is not saved in the project.
   - **Docs:** commands and run instructions match the change. A reworded "done when" is a finding unless the user approved it.
   - **UI:** when an approved mockup exists, repeat the side-by-side comparison from `kit-design` step 8.
3. Run the relevant checks yourself when possible.
4. Verify each finding against the code before reporting it; drop what you cannot support.

## Report
Verdict: ready / ready after fixes / not ready. Findings by severity with file and line, a concrete failure scenario, and a suggested fix. Then what you did not review. If there are no real problems, say so; do not invent any.

When another session or tool wrote the work, end with a short message the user can paste to it: the findings, the required fixes and what not to start. Do not change the project or its task status; the writer fixes, and marks the task `unverified` if its "done when" is not met.

For large or sensitive changes, suggest a review by a different model or a fresh session.
