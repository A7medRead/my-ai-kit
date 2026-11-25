# Changelog

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
