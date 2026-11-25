---
name: kit-new-project
description: "Use before writing code when starting a new project or major feature, or entering an unfamiliar existing project. Covers understanding, tool selection, cost, roadmap, task levels and project setup. Arabic triggers: ابدأ مشروع، مشروع جديد، افهم المشروع."
---

# New project or major feature

Output of this skill is an approved plan. No feature code before approval.

## 1. Understand
- Check that the folder is its own git repository (`git rev-parse --show-toplevel`). If it is not, or it belongs to a parent repository, say so; run `git init` in it after approval.
- Goal, target users, platforms, languages (Arabic/RTL?), must-have features, what is explicitly out of scope.
- For each kind of user, list what they can create, view, change and cancel, including what an owner or admin must manage. Each item ends up in a task or is marked out of scope.
- Constraints: budget, hosting, deadline, existing accounts or services.
- Sensitive areas: accounts, payments, personal data.
- Expected growth.

Ask only questions whose answers change the plan, grouped in one message.

**Existing project:** first read `AGENTS.md`, `README`, `docs/PLAN.md`, `docs/LESSONS.md`, dependency manifests, folder structure and recent `git log`; open other documents and code only as the task needs. Run `kit-status`. Respect the current stack and conventions; propose changes, do not impose them.

## 2. Choose tools
For each major choice (framework, database, auth, hosting, key libraries):
- The requirement it serves, the choice, why, at least one alternative, and why not each alternative.
- Current stable version checked in official docs. If you cannot check, say so.
- Cost now and at higher usage; free-tier limits, including whether backups are included when data is stored.
- What must be installed or registered first (runtimes, Docker, accounts). Check what is already available.

Also name a simpler or cheaper way to meet the whole goal, and what it gives up.

Include automation, animation or 3D when they help this project, with benefit and cost.

## 3. Plan
Present briefly in the chat:
1. Understanding, in a few lines.
2. Tool choices, costs and prerequisites.
3. Structure: folders by feature; UI, business logic and data access separated; config outside code; migrations.
4. Conventions (see below).
5. Security needs, including how public actions can be abused or fail (fake or repeated submissions, simultaneous requests, unverified identity) and the defense for each.
6. Phases, each ending in something usable, split into small tasks (see below). Each task has an ID (`T-001`), a level (`Low`/`Medium`/`High`) and a "done when" line.
7. Which checks run for this stack.
8. Open questions and risks.

Before sending, confirm all eight are present. If one does not apply, say so and why.

### Conventions
- Naming for files, folders, components, variables and database objects, with an example.
- Formatter and linter.
- For projects with a UI, also state:
  - **Styling approach:** the method or library, why it fits this project, and the alternative.
  - **Class naming:** the exact rule with an example (for utility classes: when to extract a component and how custom classes are named).
  - **Design tokens:** the single file that holds colors, type and spacing.
  - **Direction and language:** LTR, RTL or both. For Arabic or other RTL: logical CSS properties, `dir` and `lang`, fonts, number and date formats, mirrored directional icons. This is decided in the first version, not added later.

Write the approved conventions into the project `AGENTS.md`.

### Task size
- One task delivers one verifiable result and fits in one session and one commit.
- Split a task that has several results in its "done when", spans several screens or features, or combines data model, business rules and UI. For example, split "booking and availability" into schema, availability rules, conflict protection and booking form.
- A `High` task is a signal to look for a further split.
- "Done when" names observable evidence (a passing test, a screen checked, an approval).

### Tasks every plan needs
- First: scaffold the project and make its checks run.
- With a UI: a design task (`kit-design`) that is done when the user approves one of three researched directions. The plan may suggest fonts and colors; they are decided there.
- Each defense from item 5, inside a feature task or as its own.
- A security review (`kit-security`) before release or trial sign-off.
- Deployment with backup and rollback (`kit-deploy`), or state that it is deferred.

Level guide: `High` = architecture, security, hard bugs; `Medium` = normal features; `Low` = text, styling, repetitive work.

**Wait for approval.** If the user asks for changes, show the revised plan and wait again.

## 4. Set up (after approval)
- Run `node scripts/setup-project.mjs <project>` from this skill's folder (macOS, Windows, Linux). Add `--include design` for projects with a UI, and `architecture`, `runbook` when needed. It never overwrites existing files.
- Without Node: copy the files from `assets/project/` without overwriting anything, make `.githooks/*` executable (`git update-index --add --chmod=+x`), and set `git config core.hooksPath .githooks`.
- Run the setup again after cloning the project on another machine; the hook setting is local to each clone.
- Fill the placeholders in the project `AGENTS.md` and `docs/PLAN.md`; record tool choices in `docs/DECISIONS.md`. Keep the structure of every template: headings, fields, table columns and entry formats. `PLAN.md` keeps all "Current position" fields and a `Status` for each task.
- Merge by hand any file that already existed.
- Put the real lint, type check, test, build and dependency audit commands in `.ai-kit/checks.sh`, and add the toolchain setup steps to `.github/workflows/ai-kit-checks.yml`.
- If the setup reports existing git hooks, add the secret scan to them instead of replacing them.
- Confirm `git config core.hooksPath` prints `.githooks` (or that the scan was added to existing hooks) and report it.
- Exit code 1 means setup is incomplete: handle every `ACTION` line (exposed or tracked secret files, customized files). Ask before removing anything from git.
- To refresh the scanner and hooks in an older project, run the setup with `--update`. It replaces only unchanged older versions; merge customized ones by hand.
- Commit the setup (`kit-deliver`) before starting the first task.
- CI minutes on private repositories can be limited or billed; tell the user.
- Before downloading tools or container images, tell the user names, sources and sizes and wait for approval. Check local services as `kit-security` describes.

## 5. Projects with a UI
Continue with `kit-design` before building screens.
