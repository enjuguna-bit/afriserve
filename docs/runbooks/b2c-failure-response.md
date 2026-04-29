# B2C payment failure response

**Audience:** Finance ops, on-call engineer  
**Trigger:** `microfinance_payment_failure_total{reason="b2c.core_failed"} > 0` alert fires, or manual report from ops team of a stuck disbursement.

---

## What the failure means

A B2C disbursement goes through two steps:

1. **Provider step** — M-Pesa Daraja accepts the transfer request and returns a `providerRequestId`. Money may leave the B2C float account at this point.
2. **Core step** — Afriserve marks the loan as `disbursed` in the database.

A `core_failed` event means step 1 succeeded (or was accepted) but step 2 threw. The loan is still in `approved` status. The disbursement row in `mobile_money_b2c_disbursements` is in `core_failed` status.

A `callback_failed` event means M-Pesa's async callback reported the provider-side transfer itself failed.

---

## Immediate triage (both failure types)

```sql
-- Find all core_failed and callback_failed disbursements
SELECT id, loan_id, request_id, provider_request_id,
       status, failure_reason, reversal_attempts,
       created_at, updated_at
FROM mobile_money_b2c_disbursements
WHERE status IN ('core_failed', 'failed')
ORDER BY updated_at DESC
LIMIT 50;
```

Check the audit log for context:

```sql
SELECT action, details, created_at
FROM audit_logs
WHERE action IN (
  'mobile_money.b2c.core_failed_needs_reconciliation',
  'mobile_money.b2c.failed'
)
ORDER BY created_at DESC
LIMIT 20;
```

---

## Resolution paths

### Path A — Core retry (most common for `core_failed`)

The provider transfer completed. The loan just needs to be marked disbursed.

Use the admin API:

```
POST /api/admin/mobile-money/b2c/:disbursementId/retry-core
Authorization: Bearer <admin-token>
```

The job also retries automatically every 60 seconds via `b2cCoreDisbursement` background job. If the loan is genuinely stuck after 5+ minutes, the auto-retry is blocked — check the job status at `GET /api/status` under `b2cCoreDisbursementJob`.

### Path B — Provider transfer genuinely failed (`callback_failed` or `failed`)

The transfer never left the float account. No money moved.

1. Confirm with Safaricom portal or B2C inquiry API using `provider_request_id`.
2. If confirmed not sent: no financial action needed. Update the loan status manually if required, or re-initiate disbursement.
3. If status is ambiguous: use the reversal-retry endpoint to record the investigation and flag for follow-up:

```
POST /api/admin/mobile-money/b2c/:disbursementId/retry-reversal
Authorization: Bearer <admin-token>
```

This does **not** trigger an automated reversal — it records the request and flags `reversal_attempts` for manual provider follow-up.

### Path C — core_failed but provider confirms transfer completed

Money left the float account but the loan was never marked disbursed. This is the critical case.

1. Run Path A (retry-core) immediately.
2. If retry-core also fails (e.g. loan in unexpected state), force-disburse via the loan lifecycle endpoint:

```
POST /api/loans/:loanId/disburse
Authorization: Bearer <admin-token>
Body: { "notes": "Force-disburse after B2C core_failed — disbursementId=<id> requestId=<requestId>" }
```

3. Record the outcome in the audit trail with a manual note.

---

## Prometheus alert rule (recommended)

```yaml
- alert: B2CPaymentCoreFailed
  expr: increase(microfinance_payment_failure_total{reason="b2c.core_failed"}[5m]) > 0
  for: 0m
  labels:
    severity: critical
  annotations:
    summary: "B2C core disbursement failure"
    description: "A B2C transfer was accepted by M-Pesa but core loan disbursement failed. Manual review required."
    runbook: "docs/runbooks/b2c-failure-response.md"

- alert: B2CCallbackFailed
  expr: increase(microfinance_payment_failure_total{reason="b2c.callback_failed"}[5m]) > 0
  for: 0m
  labels:
    severity: high
  annotations:
    summary: "M-Pesa B2C callback reported failure"
    description: "M-Pesa reported a B2C disbursement failure via callback. Verify with provider."
    runbook: "docs/runbooks/b2c-failure-response.md"
```

---

## Escalation

| Condition | Action |
|---|---|
| `core_failed`, auto-retry not resolving after 10 min | Page on-call engineer |
| Provider confirms transfer sent, loan not disbursed | Immediate manual force-disburse + notify finance |
| `reversal_attempts >= 3` | Escalate to Safaricom account manager |
| Float account balance unexpectedly low | Halt new disbursements, notify finance director |

---

## Related endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/mobile-money/b2c` | List all disbursements with status filter |
| `GET /api/admin/mobile-money/b2c/summary` | Counts by status including `core_failed_count` |
| `POST /api/admin/mobile-money/b2c/:id/retry-core` | Retry core disbursement for accepted/core_failed row |
| `POST /api/admin/mobile-money/b2c/:id/retry-reversal` | Record reversal request for failed row |
| `GET /api/metrics` | Prometheus scrape endpoint — check `microfinance_payment_failure_total` |
| `GET /api/status` | Runtime job health including `b2cCoreDisbursementJob` state |
