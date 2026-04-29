/**
 * tests/payment-failure-metrics.test.ts
 *
 * Verifies the end-to-end pipeline:
 *   B2C callback_failed event
 *   → mobileMoneyService calls metrics.observePaymentFailure("b2c.callback_failed")
 *   → metricsService.observePaymentFailure delegates to recordPaymentFailure() in registry
 *   → getPaymentFailureSnapshot() included in metrics snapshot
 *   → /metrics Prometheus scrape emits microfinance_payment_failure_total{reason="b2c.callback_failed"}
 *   → /api/system/metrics JSON snapshot includes paymentFailures map
 *
 * Also verifies that the zero-baseline metric family is always emitted even
 * before any failure occurs, so alert rules never see a "no data" gap.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";

function signWebhookPayload(payload: Record<string, any>, webhookToken: string): string {
  return crypto.createHmac("sha256", webhookToken).update(JSON.stringify(payload)).digest("hex");
}

function callbackHeaders(payload: Record<string, any>, webhookToken: string): Record<string, string> {
  return {
    "x-mobile-money-signature": signWebhookPayload(payload, webhookToken),
    "x-mobile-money-timestamp": new Date().toISOString(),
  };
}

test("payment failure counter is always emitted at /metrics even before any failure occurs", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      MOBILE_MONEY_B2C_ENABLED: "true",
      MOBILE_MONEY_PROVIDER: "mock",
      MOBILE_MONEY_WEBHOOK_TOKEN: "pf-baseline-token",
      MOBILE_MONEY_CALLBACK_IP_WHITELIST: "",
    },
  });

  try {
    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 200);
    const body = await res.text();

    assert.ok(
      body.includes("microfinance_payment_failure_total"),
      "Expected microfinance_payment_failure_total to be emitted even before any failures",
    );
    assert.ok(
      body.includes('reason="b2c.core_failed"'),
      "Expected b2c.core_failed baseline line in /metrics",
    );
    assert.ok(
      body.includes('reason="b2c.callback_failed"'),
      "Expected b2c.callback_failed baseline line in /metrics",
    );
  } finally {
    await stop();
  }
});

test("B2C callback_failed increments microfinance_payment_failure_total in Prometheus output", async () => {
  const webhookToken = "pf-callback-token";
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      MOBILE_MONEY_B2C_ENABLED: "true",
      MOBILE_MONEY_PROVIDER: "mock",
      MOBILE_MONEY_WEBHOOK_TOKEN: webhookToken,
      MOBILE_MONEY_CALLBACK_IP_WHITELIST: "",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    // Read baseline counter before inducing a failure
    const baselineRes = await fetch(`${baseUrl}/metrics`);
    const baselineBody = await baselineRes.text();
    const baselineCount = extractPaymentFailureCount(baselineBody, "b2c.callback_failed");

    // Create and disburse a loan to get a valid providerRequestId
    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: { fullName: "PF Metrics Client", phone: "+254700008801" },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: { clientId: Number(createClient.data.id), principal: 1000, termWeeks: 6 },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const approve = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST", token: adminToken,
      body: { notes: "pf metrics test approve" },
    });
    assert.equal(approve.status, 200);

    const disburse = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST", token: adminToken,
      body: {
        notes: "pf metrics test disburse",
        mobileMoney: {
          enabled: true,
          phoneNumber: "+254700008801",
          accountReference: `LOAN-${loanId}`,
        },
      },
    });
    assert.equal(disburse.status, 200);
    const providerRequestId = String(disburse.data.mobileMoney?.providerRequestId || "");
    assert.ok(providerRequestId.length > 0, "Expected a providerRequestId from the B2C disburse");

    // Send a callback_failed event
    const failPayload = {
      providerRequestId,
      status: "failed",
      failureReason: "Insufficient B2C float balance",
    };
    const callbackRes = await api(baseUrl, "/api/mobile-money/b2c/callback", {
      method: "POST",
      headers: callbackHeaders(failPayload, webhookToken),
      body: failPayload,
    });
    assert.equal(callbackRes.status, 200);
    assert.equal(String(callbackRes.data.status), "failed");
    assert.equal(Boolean(callbackRes.data.reversalRequired), true);

    // Verify the counter incremented in /metrics
    const afterRes = await fetch(`${baseUrl}/metrics`);
    assert.equal(afterRes.status, 200);
    const afterBody = await afterRes.text();
    const afterCount = extractPaymentFailureCount(afterBody, "b2c.callback_failed");

    assert.ok(
      afterCount > baselineCount,
      `Expected b2c.callback_failed count to increase. Before: ${baselineCount}, after: ${afterCount}`,
    );
  } finally {
    await stop();
  }
});

test("payment failures appear in /api/system/metrics JSON snapshot with reason keys", async () => {
  const webhookToken = "pf-json-token";
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      MOBILE_MONEY_B2C_ENABLED: "true",
      MOBILE_MONEY_PROVIDER: "mock",
      MOBILE_MONEY_WEBHOOK_TOKEN: webhookToken,
      MOBILE_MONEY_CALLBACK_IP_WHITELIST: "",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    // Disburse a loan and trigger a failed B2C callback
    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: { fullName: "PF JSON Metrics Client", phone: "+254700008802" },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: { clientId: Number(createClient.data.id), principal: 1000, termWeeks: 6 },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST", token: adminToken, body: { notes: "pf json test" },
    });
    const disburse = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST", token: adminToken,
      body: {
        mobileMoney: { enabled: true, phoneNumber: "+254700008802", accountReference: `LOAN-${loanId}` },
      },
    });
    assert.equal(disburse.status, 200);
    const providerRequestId = String(disburse.data.mobileMoney?.providerRequestId || "");

    const failPayload = { providerRequestId, status: "failed", failureReason: "Network timeout" };
    await api(baseUrl, "/api/mobile-money/b2c/callback", {
      method: "POST",
      headers: callbackHeaders(failPayload, webhookToken),
      body: failPayload,
    });

    // Check /api/system/metrics JSON
    const metricsRes = await api(baseUrl, "/api/system/metrics", { token: adminToken });
    assert.equal(metricsRes.status, 200);

    const paymentFailures = metricsRes.data?.paymentFailures;
    assert.ok(
      paymentFailures && typeof paymentFailures === "object",
      "Expected paymentFailures object in system metrics snapshot",
    );
    assert.ok(
      Number(paymentFailures["b2c.callback_failed"] || 0) >= 1,
      `Expected b2c.callback_failed >= 1 in paymentFailures snapshot, got: ${JSON.stringify(paymentFailures)}`,
    );
  } finally {
    await stop();
  }
});

/**
 * Parse the numeric value of microfinance_payment_failure_total{reason="<reason>"} from
 * a Prometheus text scrape payload. Returns 0 if the line is not found.
 */
function extractPaymentFailureCount(prometheusText: string, reason: string): number {
  const escapedReason = reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `microfinance_payment_failure_total\\{[^}]*reason="${escapedReason}"[^}]*\\}\\s+(\\S+)`,
  );
  const match = prometheusText.match(pattern);
  if (!match) {
    return 0;
  }
  const parsed = parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}
