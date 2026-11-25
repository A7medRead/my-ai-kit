---
name: kit-deploy
description: "Use to release or publish a project, set up hosting, backups, rollback or recovery. Every production action needs explicit approval. Arabic triggers: انشر، ارفع الموقع، backup، رجع النسخة."
---

# Deploy

Production actions are RED: ask for approval for each one.

## Before
- Full checks pass on the exact commit being released; `kit-security` done.
- Environment variables set in the host (never in git).
- Costs and limits confirmed with the user.
- Database: migrations tested on a copy; backup taken **and a restore verified**.
- Rollback steps written, including what cannot be rolled back (data changes, sent messages).
- Error logging and basic monitoring ready.

## Release
1. Deploy to preview/staging and test the main user flows on mobile and desktop.
2. Show the user the result and the exact production action. Wait for approval.
3. Deploy the same commit.

## After
- Check health, main flows and error logs.
- If it fails, tell the user and propose rollback; run it once approved.
- Record version, commit and date in `docs/PROGRESS.md`.
- Keep `docs/RUNBOOK.md` current: run, deploy, backup, restore, rollback, common problems.
