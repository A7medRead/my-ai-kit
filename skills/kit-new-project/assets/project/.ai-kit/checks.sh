#!/bin/sh
# Project quality checks. Usage: checks.sh medium|full
# Fill in the real commands for this project, then remove the "not configured" block.
# Do not remove a check to make this pass.
set -eu

level="${1:-full}"

echo "checks.sh is not configured yet: add lint, type check, tests, build and dependency audit." >&2
exit 1

# Example for a Node project (adapt to the project):
# npm run lint
# npm run typecheck
# npm test
# if [ "$level" = "full" ]; then
#     npm run build
#     npm audit --audit-level=high
# fi
