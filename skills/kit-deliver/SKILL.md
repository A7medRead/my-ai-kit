---
name: kit-deliver
description: "Use when a task is finished - verify at the right level, comment, update project docs, scan for secrets, commit and push safely. Arabic triggers: سلم المهمة، خلصت، اعمل commit، اعمل push."
---

# Deliver a finished task

## 1. Review your own diff
- `git rev-parse --show-toplevel` must be this project's folder. If it is a parent folder, stop and tell the user.
- `git status`, `git diff` and `git diff --cached`: plain `git diff` does not show what is already staged.
- Identify which changes are yours; leave other people's changes alone and never stage them blindly (`git add -A` is only safe when every change is yours).
- If something was staged before you started and is not part of this task, do not commit it and do not unstage it without asking.
- Remove debug output and dead code you added. Confirm no unrequested changes.
- Comments explain why. Do not narrate the code.

## 2. Verify
Pick the level (Simple / Medium / Large or sensitive) from the core rules; risk beats size. Run those checks and read the output. A failing check means the task is not done: fix the cause (`kit-debug`) or report it. Never weaken a check.

For Medium and Large changes:
- Name the evidence for each part of the task's "done when". A part without evidence means the task is not done.
- When the evidence is a test, break the rule it covers for a moment, confirm the test fails, then restore and rerun. Do this locally with test data only and leave no change behind.
- If you changed an existing test or assertion, confirm the same way that it still catches what it caught before.

If the task added a new kind of check (first tests, a new tool), add its command to `.ai-kit/checks.sh`.

## 3. Record, in the same commit
If the project has no kit docs, do not create them just to deliver; offer to set them up. Follow each file's format.
- `docs/PLAN.md`: update the task's `Status` and every "Current position" field (including the next step), and clear your "In progress" mark. Restore the fields or column if they are missing.
- `docs/PROGRESS.md`: new entry at the top - date, task ID, what changed, what was tested, what was not. No commit hash; the task ID in the commit message links them.
- `docs/DECISIONS.md`: only if a real decision was made.
- `docs/LESSONS.md`: only if something should not be repeated.
- `docs/ARCHITECTURE.md` / `docs/RUNBOOK.md`: only if structure or operation changed.
- `AGENTS.md` and `README.md`: when commands, prerequisites or the way to run the project changed.

## 4. Branch, then secret scan
Pick the branch before committing:
- A brand new repository: the first setup commit goes on `main`, locally. Task work starts on a branch after it.
- Otherwise never commit task work on `main` or `master`.
- Use one branch per plan phase, with one commit per task.
- Never start from `main` while earlier work it depends on is unmerged: continue on that branch.
- When a phase is complete, say so and ask whether to merge it.

Stage your files, then run `sh .ai-kit/scan-secrets.sh --staged`.
If the project has no scanner, run the copy in the `kit-new-project` skill under `assets/project/.ai-kit/`.
If `sh` is unavailable, use the one bundled with Git. If no scan can run, do not push.
A finding blocks delivery. Remove the secret; if it was ever pushed, tell the user to rotate it. Only the user may approve an `ai-kit:allow-secret` marker or an allow-list entry.

## 5. Commit
```
<type>(<area>): <what changed> [T-001]

Why: <reason>
Tested: <checks run>
```

Before committing, read `git diff --cached --stat` again: every staged file belongs to this task.

## 6. Push
Look first:
- `git remote -v` and the branch's upstream: is this the intended repository, and is it public?
- Every commit that will be sent (`git log --oneline <upstream>..HEAD`, or `git log --oneline HEAD --not --remotes` for a new branch), including older ones you did not write.
- What a push starts: workflow files, hosting integrations, preview or production deployments, paid CI.

Push automatically only if all are true:
- The checks for this level passed.
- The current branch is not `main` or `master`.
- The secret scan passed.
- A remote exists. If none, say so; creating one is the user's decision.
- The remote and every outgoing commit are expected.
- Nothing the push starts deploys to production or costs money. If it might, ask first.

No force push, no `--no-verify`. Merge only with the user's explicit approval for that merge, after the full checks. If a push is rejected, fetch and show the user the situation.

## 7. Report
```
Done:        ...
Commit:      <hash> on <branch>
Pushed:      yes / no (why)
Tested:      ...
Not tested:  ...
Next:        <next task and its level>
```
