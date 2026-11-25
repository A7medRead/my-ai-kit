---
name: kit-status
description: "Use when asked where the project stands, when resuming work, or when taking over from another session or AI. Verifies against git and the code, never memory. Arabic triggers: وصلنا لفين، وقفنا فين، كمل، اللي فاضل."
---

# Where are we

Do not answer from conversation memory, a summary, or a docs file alone.

## 1. Collect facts
Run `node scripts/project-status.mjs <project>` from this skill's folder (macOS, Windows, Linux).
Without Node, run: `git fetch --all --prune`, `git status -sb`, `git log --oneline --date=short -15`, `git for-each-ref --sort=-committerdate refs/heads refs/remotes`, `git stash list`.
If fetch fails, say the remote state is unverified.

## 2. Compare
- Read the "Current position" block and task list in `docs/PLAN.md`, and the latest `docs/PROGRESS.md` entry.
- Check the commits made after `PLAN.md` was last updated.
- Check recent work on other branches and uncommitted changes.
- When docs and reality disagree or something is unclear, inspect the code and run the relevant tests.

## 3. Reality wins
Correct `docs/PLAN.md` to match what you verified and tell the user what was stale. A task is "done" only with evidence (code present and checks passing); otherwise mark it unverified.

## 4. Answer
```
Last finished:      ... (date + commit hash)
In progress:        ...
Next:               ... (level)
Uncommitted:        ...
Not pushed/pulled:  ...
Docs were stale:    ...
Could not verify:   ...
```
Keep it short, in the user's language.
