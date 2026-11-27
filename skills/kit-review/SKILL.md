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

## Audit sessions
To check what AI sessions said against what they did, run `node scripts/session-audit.mjs <project> --since <date>` from this skill's folder. It reads the Codex and Claude Code transcripts on this machine and changes nothing.
- It looks for: long silences, `Commit` lines that git does not support, "checks passed" without a passing run, sensitive actions nobody asked for, task changes without a claim, and two sessions writing at once.
- `FAIL` is a fact from the transcript or git; `SUSPECT` needs a look. Read the session before calling a suspicion a problem.
- It cannot judge whether the user was asked about a decision, whether design differences were all shown, how a design looks, or most other statements. Say which of these you checked yourself, and ask the user about the look.
- The formats are not published interfaces and old Claude Code transcripts are deleted after a retention period, so audit soon after a phase. `UNKNOWN` means that part was not judged: a call, a result or a whole session could not be read. Never report such a session as having no problem.
- Transcripts are private: quote only what the finding needs, and keep them out of project and kit files.

## Report
Verdict: ready / ready after fixes / not ready. Findings by severity with file and line, a concrete failure scenario, and a suggested fix. Then what you did not review. If there are no real problems, say so; do not invent any.

When another session or tool wrote the work, end with a short message the user can paste to it: the findings, the required fixes and what not to start. Do not change the project or its task status; the writer fixes, and marks the task `unverified` if its "done when" is not met.

For large or sensitive changes, suggest a review by a different model or a fresh session.
