# Changelog

## 0.4.13 - 2026-11-27
Hardening of the task claim after an automated security review (`docs/ISSUES.md`, KI-031):
- A damaged claim file keeps the task taken and only the user's approval clears it; before, the word `unknown` released it.
- Tool names are limited, and text read from a claim file cannot add lines to the output.
- The script and the core rules say the claim is an agreement between sessions, not a lock on files.

## 0.4.12 - 2026-11-27
Fix for two sessions writing the same task at the same time (`docs/ISSUES.md`, KI-029), not yet confirmed in real use:
- `kit-status/scripts/claim-task.mjs` gives a task to one session only, across worktrees, and marks it with a tag that tells two sessions of the same tool apart.
- The core rules require the claim before any change to a planned task; `kit-deliver` releases it after the commit.

## 0.4.11 - 2026-11-26
Fix for a wrong report line seen in real use (`docs/ISSUES.md`, KI-028):
- `delivery-facts.mjs` accepts a commit hash for work without a task ID, and says `unknown` instead of `none` when it cannot tell which commit is the delivery.

## 0.4.10 - 2026-11-26
Rules that text alone did not enforce now come from scripts (`docs/ISSUES.md`, KI-018 and KI-025), not yet confirmed in real use:
- The full secret scan (`--all`) also checks unstaged edits and new files that are not ignored. Existing projects get it with `setup-project.mjs --update`.
- `kit-deliver` prints the report's `Commit` and `Pushed` lines from git with `scripts/delivery-facts.mjs`, and the core rules require it.

## 0.4.9 - 2026-11-26
Fixes from the same trial's later design stages (`docs/ISSUES.md`, KI-011, KI-012, KI-016, KI-019 and KI-022 to KI-025), not yet confirmed by a later design:
- The delivery report's `Commit` line is a hash from `git log`, or `none` with the reason.
- The proposal and the report sent with a design are fixed blocks with every line, like the delivery report; images are shown, not named.
- Design approval is asked on its own; building or applying it is a separate question.
- Differences from the approved look go in the reply, and shared style fixes rerun every state they touch.
- Project documents never carry the taste library's images, notes or reasons.
- `kit-deliver` and `kit-review` point to the right `kit-design` step again.

## 0.4.8 - 2026-11-26
Fixes from a trial redesign that used too much time and usage limit (`docs/ISSUES.md`, KI-019), not yet confirmed by a later design:
- A design starts with a short written proposal, then one key screen refined on feedback; more directions only when the user asks.
- A sketch gets a light check; the full self-review runs on the approved look, before final approval.
- A sketch may be an image when the tool generates images itself; no paid service without approval.

## 0.4.7 - 2026-11-26
Fixes from the user's review of a trial design that looked dated (`docs/ISSUES.md`, KI-017), not yet confirmed by a later design:
- Taste examples are required before new directions are drawn, unless the user says to go ahead without them.
- A quality bar for color, type, shape and finish; the three directions differ in shape language too.
- A side-by-side visual comparison with the strongest examples before a design is shown.
- Soft corners and shadows are allowed when they serve the design.

## 0.4.6 - 2026-11-26
Fixes from a trial design task (`docs/ISSUES.md`, KI-012 and KI-016), not yet confirmed by a later task:
- `kit-design` sends a numbered checklist with every design: taste, references opened, directions, design check states, and the nine judge questions.
- The design check claims only the states it ran, including busy error states.
- Every verification adds a row to the project's visual verification table, adding a missing column first.

## 0.4.5 - 2026-11-26
Fixes from a trial review (`docs/ISSUES.md`, KI-006 and KI-011), not yet confirmed by a later task:
- The core rules require the full delivery report, also for fixes after a review.
- The core rules require approval for anything that differs from an approved mockup, including new elements and states, before a screen task is done.

## 0.4.4 - 2026-11-26
A fix from a trial review (`docs/ISSUES.md`, KI-011), not yet confirmed by a later task:
- `kit-deliver` requires the mockup comparison before a screen is done, and the report has a line for the differences left and their approval.

## 0.4.3 - 2026-11-26
Fixes from the trial reviews (`docs/ISSUES.md`), not yet confirmed by a later task:
- Installed rules name the kit version, and `kit-deliver` records it in the progress entry and the report.
- `kit-deliver` evidence must be repeatable, or be reported as a manual or temporary check; `kit-review` reports evidence that is not saved.

## 0.4.2 - 2026-11-25
Fixes from the trial reviews (`docs/ISSUES.md`), not yet confirmed by a later task:
- `kit-design` compares built screens with the approved mockup state by state and lists every difference; `kit-review` repeats it.
- `kit-design` adds the color-token check to the project's own checks; `design-check.mjs` no longer breaks a project's lint when copied.
- The `DESIGN.md` template has a tablet column.
- `kit-deliver` reports every line, including the next task's level.
- `kit-review` ends with a message for the writer and leaves the project unchanged.
- `kit-status` skips the fetch in read-only checks.

## 0.4.1 - 2026-11-25
Fixes from reviewing one trial task (`docs/ISSUES.md`), not yet confirmed by a later task:
- "Done" needs evidence for every part of a task's "done when", and an approved "done when" changes only with the user's approval.
- `kit-deliver` (Medium and Large changes): tests must fail when the rule they cover is broken, including changed assertions.
- `kit-deliver` updates the project's `AGENTS.md` and `README.md` when commands or run steps change.
- `kit-review` checks that tests catch breakage, compares old and new versions of changed tests, and reports a reworded "done when".

## 0.4.0 - 2026-11-25
Fixes from two outside reviews, each reproduced first:
- Setup verifies that git really ignores secret files, repairs an earlier negation rule, and reports secret files that are already tracked.
- `--update` replaces only unchanged released versions of the scanner and hooks, so custom hooks are kept.
- Taste setup stops when the kit already tracks files in `taste/`.
- `kit-status` stops inside a parent repository unless `--allow-parent` is given; it only corrects the plan on clear evidence.
- The `env(NAME)` exception now requires text that looks like a variable name.
- Design check: wider color detection (named, modern and Tailwind colors, token file must exist), tablet size, JavaScript errors, failed requests and broken images.
- Rules: one writer per task, reviewed staged changes only, checks before an automatic push, unverified designs labeled as drafts, selective reading.
- `kit-design`: asset plan, component reuse, hierarchy/typography/composition questions, check depth per stage.

## 0.3.0 - 2026-11-25
Fixes from a full review and the first trial plans:
- Rules: small changes in unfamiliar projects need no plan; merge only with explicit approval; no automatic push that deploys; never commit into a parent repository.
- `kit-deliver`: branch flow for new repositories and plan phases.
- `kit-new-project`: user actions coverage, prerequisites, abuse cases, required tasks, hook verification.
- `kit-status` warns when a folder belongs to a parent repository.
- Project setup has `--update` for the scanner and hooks.
- New `kit-taste` skill and a private taste library (`taste/`, ignored by the kit's repository).
- New `design-check.mjs`: measures common design mistakes at phone and desktop size and saves screenshots.
- `kit-design` has a required self-review before any design is shown.
- Fixed design-check screenshots of right-to-left pages being shifted and cut off (found in real use).
- Secret scan no longer flags a whole `env(NAME)` variable reference, as in Supabase config (found in real use).
- `kit-design` requires visual mockups of the three directions, and local, other-field and same-language references. Found in a trial design task.
- Project docs keep their template structure (task status, current position), and new checks go into `checks.sh`. Found by reviewing the first real task.
- From the trial project: mockup states are checked against the scope; local services must not be exposed to the network; downloads need approval; setup stops asking to fill configured checks.

## 0.2.2 - 2026-11-25
`kit-new-project` plans must now state the styling approach, class naming, tokens and text direction, and split large tasks.

## 0.2.1 - 2026-11-25
Secret scan fixes:
- Files treated as binary (NUL bytes, `.gitattributes`, UTF-16) are now scanned.
- The allow marker counts only inside a comment, and placeholder exceptions look only at the matched value.
- Pre-push skips only commits already on the destination remote, not on any remote.

Added an MIT license and public setup notes.

## 0.2.0 - 2026-11-25
- Scripts rewritten in Node so macOS, Windows and Linux share one implementation (replaces the PowerShell scripts).
- Project setup stores hooks as executable and can be rerun on another machine.
- Secret scan uses byte-wise matching.
- Instruction files that are not UTF-8 are left untouched.
- Tests cover the CI workflow commands; added a macOS/Linux/Windows test workflow.

## 0.1.0 - 2026-11-25
- Core rules, 9 skills, project templates.
- Secret scan, git hooks and CI template.
- Installer for Claude Code, Codex, Gemini CLI / Antigravity and GitHub Copilot.
- Compliance scenarios and script tests.
