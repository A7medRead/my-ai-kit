---
name: kit-new-project
description: "Use before writing code when starting a new project or major feature, or entering an unfamiliar existing project. Covers understanding, tool selection, cost, roadmap, task levels and project setup. Arabic triggers: ابدأ مشروع، مشروع جديد، افهم المشروع."
---

# New project or major feature

Output of this skill is an approved plan. No feature code before approval.

## 1. Understand
- Goal, target users, platforms, languages (Arabic/RTL?), must-have features, what is explicitly out of scope.
- Constraints: budget, hosting, deadline, existing accounts or services.
- Sensitive areas: accounts, payments, personal data.
- Expected growth.

Ask only questions whose answers change the plan, grouped in one message.

**Existing project:** first read `AGENTS.md`, `README`, the `docs/` files, dependency manifests, folder structure and recent `git log`. Run `kit-status`. Respect the current stack and conventions; propose changes, do not impose them.

## 2. Choose tools
For each major choice (framework, database, auth, hosting, key libraries):
- The requirement it serves, the choice, why, at least one alternative, and why not the alternative.
- Current stable version checked in official docs. If you cannot check, say so.
- Cost now and at higher usage; free-tier limits.

Include automation, animation or 3D when they help this project, with benefit and cost.

## 3. Plan
Present briefly in the chat:
1. Understanding, in a few lines.
2. Tool choices and costs.
3. Structure: folders by feature; UI, business logic and data access separated; config outside code; migrations.
4. Conventions (see below).
5. Security needs.
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

Level guide: `High` = architecture, security, hard bugs; `Medium` = normal features; `Low` = text, styling, repetitive work.

**Wait for approval.**

## 4. Set up (after approval)
- Run `node scripts/setup-project.mjs <project>` from this skill's folder (macOS, Windows, Linux). Add `--include design` for projects with a UI, and `architecture`, `runbook` when needed. It never overwrites existing files.
- Without Node: copy the files from `assets/project/` without overwriting anything, make `.githooks/*` executable (`git update-index --add --chmod=+x`), and set `git config core.hooksPath .githooks`.
- Run the setup again after cloning the project on another machine; the hook setting is local to each clone.
- Fill the placeholders in the project `AGENTS.md` and `docs/PLAN.md`; record tool choices in `docs/DECISIONS.md`.
- Merge by hand any file that already existed.
- Put the real lint, type check, test, build and dependency audit commands in `.ai-kit/checks.sh`, and add the toolchain setup steps to `.github/workflows/ai-kit-checks.yml`.
- If the setup reports existing git hooks, add the secret scan to them instead of replacing them.
- CI minutes on private repositories can be limited or billed; tell the user.

## 5. Projects with a UI
Continue with `kit-design` before building screens.
