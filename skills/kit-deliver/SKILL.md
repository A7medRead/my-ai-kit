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
- Keep the evidence repeatable: commit the test and run it from `.ai-kit/checks.sh`. A manual check or temporary script is not a saved test: say so in the records and the report. Do not link files in build or temporary folders.
- A screen that has an approved mockup: do the comparison in `kit-design` step 8 before marking the task done. A new element or state the mockup does not show is a difference too. Ask before committing: a difference the user has not approved means the task is not done, and writing it in `docs/DESIGN.md` or `docs/PROGRESS.md` is not approval.

If the task added a new kind of check (first tests, a new tool), add its command to `.ai-kit/checks.sh`.

## 3. Record, in the same commit
If the project has no kit docs, do not create them just to deliver; offer to set them up. Follow each file's format.
- `docs/PLAN.md`: update the task's `Status` and every "Current position" field (including the next step), and clear your "In progress" mark. Restore the fields or column if they are missing.
- After that commit, release your claim: `node <kit-status skill>/scripts/claim-task.mjs release <project> <task-id> <tag>`, with the tag in your mark. Keep it while the task waits for the user; release it too when you hand the task to someone else.
- `docs/PROGRESS.md`: new entry at the top - date, task ID, what changed, what was tested, what was not, and the kit version. No commit hash; the task ID in the commit message links them.
- The kit version is the `Kit version` line in the global rules this session loaded, not the kit's `VERSION` file, which may be newer. If there is no such line, write `unknown`.
- `docs/DECISIONS.md`: only if a real decision was made.
- `docs/LESSONS.md`: only if something should not be repeated.
- `docs/ARCHITECTURE.md` / `docs/RUNBOOK.md`: only if structure or operation changed.
- `docs/DESIGN.md`, for a task with a mockup or screen: a new row in the "Visual verification" table with Mobile, Tablet, Desktop and Gaps; add a missing column first.
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
Commit:      <hash from git log> on <branch> / none (why)
Pushed:      yes / no (why)
Tested:      ...
Not tested:  ...
Design:      <differences left from the approved mockup and who approved them, none, or no mockup>
Next:        <next task and its level>
Kit:         <kit version, as in step 3>
```
Send every line, in the user's language. Write `none` instead of dropping a line, and always give the next task's level.
**`Commit` and `Pushed` come from git, not from memory,** in this report and in any other that has them. After committing and pushing, run `node scripts/delivery-facts.mjs <project> <task-id>` from this skill's folder and copy its two lines; translate only the words, never the hash, branch, `none` or `unknown`. Work without a task ID: give the new commit's hash from `git log -1` instead. `unknown` means run it again with the hash; it is never the final answer. Without Node, read them from `git log` and `git branch -r --contains <hash>`. Files saved on disk are not a commit.
A fix after a review is a delivery too: send the same full report. Before sending, check that all eight lines are there.
