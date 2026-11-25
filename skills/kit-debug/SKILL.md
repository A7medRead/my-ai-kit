---
name: kit-debug
description: "Use when something is broken, a test or build fails, or behavior is unexpected. Finds and fixes the root cause instead of patching symptoms. Arabic triggers: مشكلة، خطأ، مش شغال، باظ، صلح."
---

# Debug

1. **State the problem:** expected, actual, since when, how to trigger. Read the full error.
2. **Reproduce** it. If you cannot, say so and gather evidence (logs, inputs, versions) before changing code.
3. **Check what changed:** recent commits, dependencies, configuration, environment. Read `docs/LESSONS.md`.
4. **One hypothesis at a time:** say what you suspect, test it with the smallest experiment, keep or discard it.
5. **Fix the cause**, with the smallest change. Revert experiments that did not help; never revert other people's work.
6. **Prove it:** the reproduction now passes; add a regression test when practical; check callers and related features.
7. **Record** cause and prevention in `docs/LESSONS.md`.

## Stop rule
After 2-3 failed attempts, stop. Report what you tried, the evidence, remaining suspects, and what you need (information, access, a stronger model).

## Never
Swallow errors, skip tests, add blind retries or delays, or hard-code the expected output.
