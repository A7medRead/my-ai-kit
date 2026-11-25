---
name: kit-deliver
description: "Use when a task is finished - verify at the right level, comment, update project docs, scan for secrets, commit and push safely. Arabic triggers: سلم المهمة، خلصت، اعمل commit، اعمل push."
---

# Deliver a finished task

## 1. Review your own diff
- `git status` and `git diff`. Identify which changes are yours; leave other people's changes alone and never stage them blindly (`git add -A` is only safe when every change is yours).
- Remove debug output and dead code you added. Confirm no unrequested changes.
- Comments explain why. Do not narrate the code.

## 2. Verify
Pick the level (Simple / Medium / Large or sensitive) from the core rules; risk beats size. Run those checks and read the output. A failing check means the task is not done: fix the cause (`kit-debug`) or report it. Never weaken a check.

## 3. Record, in the same commit
- `docs/PLAN.md`: update the task status and the "Current position" block (including the next step).
- `docs/PROGRESS.md`: new entry at the top - date, task ID, what changed, what was tested, what was not. No commit hash; the task ID in the commit message links them.
- `docs/DECISIONS.md`: only if a real decision was made.
- `docs/LESSONS.md`: only if something should not be repeated.
- `docs/ARCHITECTURE.md` / `docs/RUNBOOK.md`: only if structure or operation changed.

## 4. Secret scan
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

## 6. Push
Push automatically only if all are true:
- The checks for this level passed.
- The current branch is not `main` or `master` (if it is, create a task branch before committing).
- The secret scan passed.
- A remote exists.

No force push, no `--no-verify`, no merge. If a push is rejected, fetch and show the user the situation.

## 7. Report
```
Done:        ...
Commit:      <hash> on <branch>
Pushed:      yes / no (why)
Tested:      ...
Not tested:  ...
Next:        <next task and its level>
```
