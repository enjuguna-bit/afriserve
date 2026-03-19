#!/usr/bin/env bash
# scripts/clean-tracked-debug-files.sh
#
# Removes root-level debug/scratch files from git's index so they stop
# appearing in diffs and stop being pushed to remote.
#
# SAFE: this does NOT delete the files from disk — it only stops git from
# tracking them. Run it once per developer machine after pulling.
#
# Usage:
#   bash scripts/clean-tracked-debug-files.sh
#
# After running:
#   git status   → should show the files as "untracked" (not staged)
#   git push     → will no longer push them
#
# To also delete them from disk (optional cleanup):
#   bash scripts/clean-tracked-debug-files.sh --delete

set -euo pipefail

DELETE_FROM_DISK=false
if [[ "${1:-}" == "--delete" ]]; then
  DELETE_FROM_DISK=true
fi

echo "Removing debug/scratch files from git index..."

# Patterns to untrack (mirrors .gitignore additions from Phase 3)
PATTERNS=(
  "build_*.txt"
  "build_*.log"
  "tsc*.txt"
  "tsc*.log"
  "server*.txt"
  "server*.log"
  "server-runtime*.log"
  "server-runtime*.err"
  "test_*.txt"
  "test_*.log"
  "test_*.js"
  "test-results.json"
  "fresh_test_*.txt"
  "final_test*.txt"
  "final_verification.txt"
  "eval_test.txt"
  "tap*.txt"
  "tap*.log"
  "gap*.txt"
  "gap*.log"
  "err*.txt"
  "strict_errors*.txt"
  "postgres-err.txt"
  "plan-err.txt"
  "mobile*.txt"
  "mobile*.log"
  "topup_debug*.log"
  "loan*.txt"
  "loan*.log"
  "hierarchy*.txt"
  "hierarchy*.log"
  "reporting_test_out.txt"
  "diagnostic_*.txt"
  "migration_log.txt"
  "recent_*.txt"
  "generate.txt"
  "generate.log"
  "dev-login-debug.*"
  "params.json"
  "policies.json"
  "dev.db"
  "publishProfile.xml"
  "deploy-built*.zip"
  "deploy-src.zip"
  "deploy.zip"
  "webapp-logs-latest*.zip"
  "webapp-logs.zip"
)

REMOVED=0
for pattern in "${PATTERNS[@]}"; do
  # Use git ls-files to get actually tracked files matching the pattern
  while IFS= read -r file; do
    if [[ -n "$file" ]]; then
      git rm --cached --quiet -- "$file" 2>/dev/null && echo "  untracked: $file" && ((REMOVED++)) || true
      if [[ "$DELETE_FROM_DISK" == "true" && -f "$file" ]]; then
        rm -f -- "$file" && echo "  deleted:   $file" || true
      fi
    fi
  done < <(git ls-files "$pattern" 2>/dev/null)
done

if [[ $REMOVED -eq 0 ]]; then
  echo "Nothing to untrack — all matching files are already untracked."
else
  echo ""
  echo "$REMOVED file(s) removed from index."
  echo "Run 'git commit -m \"chore: untrack root debug files\"' to record the change."
fi
