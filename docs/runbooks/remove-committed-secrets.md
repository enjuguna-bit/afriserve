# Runbook: Remove committed secrets and dev artefacts from git history

## Summary

The following files were tracked in git and must be removed. All three steps
are **destructive git operations** — run them in order, then force-push and
rotate all secrets.

---

## Step 1 — Stop tracking sensitive / dev files

Run from the repository root:

```bash
# Remove .env (contains JWT_SECRET placeholder — must never be in git)
git rm --cached .env

# Remove dev SQLite database (may contain real client data)
git rm --cached dev.db 2>/dev/null || true

# Remove Azure publish profile (contains deployment credentials)
git rm --cached publishProfile.xml 2>/dev/null || true

# Commit the removal
git commit -m "security: stop tracking .env, dev.db, publishProfile.xml

These files are sensitive or environment-specific and must not be
in version control. They are already listed in .gitignore."
```

---

## Step 2 — Purge from history (optional but recommended if repo is shared)

If the repository has been pushed to a remote that other developers or CI/CD
systems have cloned, the placeholder JWT_SECRET and any data in dev.db may be
in the git history. Purge with `git-filter-repo`:

```bash
pip install git-filter-repo

git filter-repo --path .env --invert-paths
git filter-repo --path dev.db --invert-paths
git filter-repo --path publishProfile.xml --invert-paths

# Force-push all branches
git push origin --force --all
git push origin --force --tags
```

All collaborators must then run:
```bash
git fetch origin
git reset --hard origin/main  # or your default branch
```

---

## Step 3 — Rotate all secrets

After removing the files, rotate everything that was ever in them:

| Secret | Action |
|---|---|
| `JWT_SECRET` | Generate new: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `RABBITMQ_PASS` | Change in RabbitMQ management console and update all services |
| `MOBILE_MONEY_DARAJA_CONSUMER_KEY/SECRET` | Regenerate in Safaricom developer portal |
| `MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL` | Regenerate in Safaricom portal |
| Azure publish profile | Download fresh from Azure portal |

---

## Step 4 — Verify

```bash
# .env must not appear in git
git ls-files .env
# Expected: no output

# dev.db must not appear in git
git ls-files dev.db
# Expected: no output

# Check .gitignore is working
git check-ignore -v .env dev.db publishProfile.xml
# Expected: each file listed with the .gitignore rule that covers it
```
