# Changelog

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
