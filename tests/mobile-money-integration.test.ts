import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";

function toMpesaTimestamp(date: Date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}${second}`;
}

function signWebhookPayload(payload: Record<string, any>, webhookToken: string): string {
  return crypto.createHmac("sha256", webhookToken).update(JSON.stringify(payload)).digest("hex");
}

function createWebhookHeaders(
  payload: Record<string, any>,
  webhookToken: string,
  options: { includeToken?: boolean; timestamp?: string } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-mobile-money-signature": signWebhookPayload(payload, webhookToken),
    "x-mobile-money-timestamp": options.timestamp || new Date().toISOString(),
  };
  if (options.includeToken) {
    headers["x-mobile-money-webhook-token"] = webhookToken;
  }
  return headers;
}
test("C2B webhook reconciles M-Pesa payment to loan repayment and is idempotent", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      MOBILE_MONEY_C2B_ENABLED: "true",
      MOBILE_MONEY_WEBHOOK_TOKEN: "test-webhook-token",
      MOBILE_MONEY_PROVIDER: "mock",
      MOBILE_MONEY_CALLBACK_IP_WHITELIST: "",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "C2B Webhook Client",
        phone: "+254700003001",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1500,
        termWeeks: 6,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const approveLoan = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST",
      token: adminToken,
      body: { notes: "approve for c2b reconciliation" },
    });
    assert.equal(approveLoan.status, 200);

    const disburseLoan = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: { notes: "disburse for c2b reconciliation" },
    });
    assert.equal(disburseLoan.status, 200);

    const webhookPayload = {
      TransID: "QX12345ABC",
      TransTime: toMpesaTimestamp(),
      TransAmount: "300",
      BillRefNumber: String(loanId),
      MSISDN: "254700003001",
    };

    const webhook = await api(baseUrl, "/api/mobile-money/c2b/webhook", {
      method: "POST",
      headers: createWebhookHeaders(webhookPayload, "test-webhook-token", { includeToken: true }),
      body: webhookPayload,
    });
    if (webhook.status !== 200) console.log("C2B Webhook 500 Error Body:", webhook.data);
    assert.equal(webhook.status, 200);
    assert.equal(webhook.data.status, "reconciled");
    assert.equal(Number(webhook.data.loanId), loanId);

    const duplicateWebhook = await api(baseUrl, "/api/mobile-money/c2b/webhook", {
      method: "POST",
      headers: createWebhookHeaders(webhookPayload, "test-webhook-token", { includeToken: true }),
      body: webhookPayload,
    });
    assert.equal(duplicateWebhook.status, 200);
    assert.equal(duplicateWebhook.data.status, "duplicate");

    const repayments = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      token: adminToken,
    });
    assert.equal(repayments.status, 200);
    assert.ok(repayments.data.some((row) => String(row.note || "").includes("QX12345ABC")));
  } finally {
    await stop();
  }
});

test("unmatched C2B receipts can be manually reconciled from the workbench", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      MOBILE_MONEY_C2B_ENABLED: "true",
      MOBILE_MONEY_WEBHOOK_TOKEN: "test-webhook-token",
      MOBILE_MONEY_PROVIDER: "mock",
      MOBILE_MONEY_CALLBACK_IP_WHITELIST: "",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "C2B Manual Reconciliation Client",
        phone: "+254700003009",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1800,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const approveLoan = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST",
      token: adminToken,
      body: { notes: "approve for manual c2b reconciliation" },
    });
    assert.equal(approveLoan.status, 200);

    const disburseLoan = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: { notes: "disburse before manual c2b reconciliation" },
    });
    assert.equal(disburseLoan.status, 200);

    const unmatchedWebhookPayload = {
      TransID: "QX54321MAN",
      TransTime: toMpesaTimestamp(),
      TransAmount: "450",
      BillRefNumber: "UNKNOWN-LOAN-REF",
      MSISDN: "254700003009",
    };

    const webhook = await api(baseUrl, "/api/mobile-money/c2b/webhook", {
      method: "POST",
      headers: createWebhookHeaders(unmatchedWebhookPayload, "test-webhook-token", { includeToken: true }),
      body: unmatchedWebhookPayload,
    });
    assert.equal(webhook.status, 200);
    assert.equal(webhook.data.status, "unmatched");

    const unmatchedEvents = await api(baseUrl, "/api/mobile-money/c2b/events?status=unmatched", {
      token: adminToken,
    });
    assert.equal(unmatchedEvents.status, 200);
    assert.ok(Array.isArray(unmatchedEvents.data));
    const unmatchedEvent = unmatchedEvents.data.find((row) => String(row.external_receipt) === "QX54321MAN");
    assert.ok(unmatchedEvent, "Expected unmatched event to be visible in the workbench queue");
    assert.equal(String(unmatchedEvent.status), "unmatched");

    const lookupLoans = await api(baseUrl, `/api/loans?search=${loanId}&limit=5&offset=0`, {
      token: adminToken,
    });
    assert.equal(lookupLoans.status, 200);
    assert.ok(Array.isArray(lookupLoans.data.data));
    assert.ok(
      lookupLoans.data.data.some((row) => Number(row.id) === loanId),
      "Expected textual numeric loan search to support reconciliation lookup",
    );

    const manualReconcile = await api(
      baseUrl,
      `/api/mobile-money/c2b/events/${Number(unmatchedEvent.id)}/reconcile`,
      {
        method: "POST",
        token: adminToken,
        body: {
          loanId,
          note: "Finance matched receipt after customer account-reference review",
        },
      },
    );
    assert.equal(manualReconcile.status, 200);
    assert.equal(String(manualReconcile.data.status), "reconciled");
    assert.equal(Number(manualReconcile.data.loanId), loanId);
    assert.ok(Number(manualReconcile.data.repaymentId || 0) > 0);
    assert.equal(String(manualReconcile.data.event?.status || ""), "reconciled");

    const repayments = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      token: adminToken,
    });
    assert.equal(repayments.status, 200);
    const matchedRepayment = repayments.data.find(
      (row) => String(row.external_receipt || "") === "QX54321MAN",
    );
    assert.ok(matchedRepayment, "Expected manual reconciliation to create a repayment record");

    const reconciledEvents = await api(baseUrl, "/api/mobile-money/c2b/events?status=reconciled", {
      token: adminToken,
    });
    assert.equal(reconciledEvents.status, 200);
    const reconciledEvent = reconciledEvents.data.find(
      (row) => String(row.external_receipt) === "QX54321MAN",
    );
    assert.ok(reconciledEvent, "Expected reconciled event to move out of unmatched queue");
    assert.equal(Number(reconciledEvent.loan_id), loanId);
    assert.match(String(reconciledEvent.reconciliation_note || ""), /matched receipt/i);
  } finally {
    await stop();
  }
});

test("C2B webhook rejects stale callback timestamps older than five minutes", async () => {
  const webhookToken = "stale-webhook-token";
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      MOBILE_MONEY_C2B_ENABLED: "true",
      MOBILE_MONEY_WEBHOOK_TOKEN: webhookToken,
      MOBILE_MONEY_PROVIDER: "mock",
      MOBILE_MONEY_CALLBACK_IP_WHITELIST: "",
    },
  });

  try {
    const staleDate = new Date(Date.now() - 10 * 60 * 1000);
    const stalePayload = {
      TransID: "QXSTALE001",
      TransTime: toMpesaTimestamp(staleDate),
      TransAmount: "150",
      BillRefNumber: "STALE-REF",
      MSISDN: "254700003099",
    };

    const webhook = await api(baseUrl, "/api/mobile-money/c2b/webhook", {
      method: "POST",
      headers: createWebhookHeaders(stalePayload, webhookToken, {
        includeToken: true,
        timestamp: staleDate.toISOString(),
      }),
      body: stalePayload,
    });
    assert.equal(webhook.status, 401);
    assert.match(String(webhook.data.message || ""), /5 minute window/i);
  } finally {
    await stop();
  }
});

test("B2C mobile money disbursement runs when disburse is clicked with mobileMoney.enabled", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      MOBILE_MONEY_B2C_ENABLED: "true",
      MOBILE_MONEY_PROVIDER: "mock",
      MOBILE_MONEY_CALLBACK_IP_WHITELIST: "",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "B2C Disbursement Client",
        phone: "+254700003002",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 2000,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const approveLoan = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST",
      token: adminToken,
      body: { notes: "approve for b2c disbursement" },
    });
    assert.equal(approveLoan.status, 200);
    assert.equal(String(approveLoan.data.status), "approved");

    const disburseLoan = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: {
        notes: "B2C disbursement",
        mobileMoney: {
          enabled: true,
          phoneNumber: "+254700003002",
          accountReference: `LOAN-${loanId}`,
          narration: "Loan disbursement to wallet",
        },
      },
    });
    assert.equal(disburseLoan.status, 200);
    assert.equal(String(disburseLoan.data.loan.status), "active");
    assert.equal(String(disburseLoan.data.mobileMoney.status), "core_disbursed");
    assert.ok(String(disburseLoan.data.mobileMoney.requestId).length > 10);
  } finally {
    await stop();
  }
});

test("B2C callback validates signature and reconciles completed/failed outcomes", async () => {
  const webhookToken = "b2c-callback-token";

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

    const createClientSuccess = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "B2C Callback Success Client",
        phone: "+254700003012",
      },
    });
    assert.equal(createClientSuccess.status, 201);

    const createLoanSuccess = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClientSuccess.data.id),
        principal: 1200,
        termWeeks: 8,
      },
    });
    assert.equal(createLoanSuccess.status, 201);
    const loanSuccessId = Number(createLoanSuccess.data.id);

    const approveSuccessLoan = await api(baseUrl, `/api/loans/${loanSuccessId}/approve`, {
      method: "POST",
      token: adminToken,
      body: { notes: "approve for b2c callback success" },
    });
    assert.equal(approveSuccessLoan.status, 200);

    const disburseSuccessLoan = await api(baseUrl, `/api/loans/${loanSuccessId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: {
        notes: "B2C callback success seed",
        mobileMoney: {
          enabled: true,
          phoneNumber: "+254700003012",
          accountReference: `LOAN-${loanSuccessId}`,
          narration: "Callback success test",
        },
      },
    });
    assert.equal(disburseSuccessLoan.status, 200);
    const successProviderRequestId = String(disburseSuccessLoan.data.mobileMoney.providerRequestId || "");
    assert.ok(successProviderRequestId.length > 0);

    const invalidSignatureCallback = await api(baseUrl, "/api/mobile-money/b2c/callback", {
      method: "POST",
      headers: {
        "x-mobile-money-signature": "invalid-signature",
        "x-mobile-money-timestamp": new Date().toISOString(),
      },
      body: {
        providerRequestId: successProviderRequestId,
        status: "completed",
      },
    });
    assert.equal(invalidSignatureCallback.status, 401);

    const successCallbackPayload = {
      providerRequestId: successProviderRequestId,
      status: "completed",
      resultDesc: "The service request is processed successfully.",
    };
    const successCallback = await api(baseUrl, "/api/mobile-money/b2c/callback", {
      method: "POST",
      headers: createWebhookHeaders(successCallbackPayload, webhookToken),
      body: successCallbackPayload,
    });
    assert.equal(successCallback.status, 200);
    assert.equal(String(successCallback.data.status), "completed");
    assert.equal(Boolean(successCallback.data.reversalRequired), false);
    assert.equal(Number(successCallback.data.loanId), loanSuccessId);

    const createClientFailure = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "B2C Callback Failure Client",
        phone: "+254700003013",
      },
    });
    assert.equal(createClientFailure.status, 201);

    const createLoanFailure = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClientFailure.data.id),
        principal: 1350,
        termWeeks: 8,
      },
    });
    assert.equal(createLoanFailure.status, 201);
    const loanFailureId = Number(createLoanFailure.data.id);

    const approveFailureLoan = await api(baseUrl, `/api/loans/${loanFailureId}/approve`, {
      method: "POST",
      token: adminToken,
      body: { notes: "approve for b2c callback failure" },
    });
    assert.equal(approveFailureLoan.status, 200);

    const disburseFailureLoan = await api(baseUrl, `/api/loans/${loanFailureId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: {
        notes: "B2C callback failure seed",
        mobileMoney: {
          enabled: true,
          phoneNumber: "+254700003013",
          accountReference: `LOAN-${loanFailureId}`,
          narration: "Callback failure test",
        },
      },
    });
    assert.equal(disburseFailureLoan.status, 200);
    const failureProviderRequestId = String(disburseFailureLoan.data.mobileMoney.providerRequestId || "");
    assert.ok(failureProviderRequestId.length > 0);

    const failureCallbackPayload = {
      providerRequestId: failureProviderRequestId,
      status: "failed",
      failureReason: "Timeout from M-Pesa switch",
    };
    const failureCallback = await api(baseUrl, "/api/mobile-money/b2c/callback", {
      method: "POST",
      headers: createWebhookHeaders(failureCallbackPayload, webhookToken),
      body: failureCallbackPayload,
    });
    assert.equal(failureCallback.status, 200);
    assert.equal(String(failureCallback.data.status), "failed");
    assert.equal(Boolean(failureCallback.data.reversalRequired), true);
    assert.match(String(failureCallback.data.failureReason || ""), /timeout/i);
    assert.equal(Number(failureCallback.data.loanId), loanFailureId);

    const b2cDisbursements = await api(baseUrl, "/api/mobile-money/b2c/disbursements?limit=20", {
      token: adminToken,
    });
    assert.equal(b2cDisbursements.status, 200);
    assert.ok(Array.isArray(b2cDisbursements.data));
    assert.ok(
      b2cDisbursements.data.some((row) => String(row.provider_request_id || "") === successProviderRequestId),
      "Expected B2C disbursement list to include completed callback row",
    );
    assert.ok(
      b2cDisbursements.data.some((row) => String(row.provider_request_id || "") === failureProviderRequestId),
      "Expected B2C disbursement list to include failed callback row",
    );

    const failedOnly = await api(
      baseUrl,
      `/api/mobile-money/b2c/disbursements?status=failed&providerRequestId=${encodeURIComponent(failureProviderRequestId)}`,
      {
        token: adminToken,
      },
    );
    assert.equal(failedOnly.status, 200);
    assert.ok(Array.isArray(failedOnly.data));
    assert.ok(failedOnly.data.length >= 1);
    assert.ok(failedOnly.data.every((row) => String(row.status) === "failed"));
    assert.ok(
      failedOnly.data.some((row) => String(row.provider_request_id || "") === failureProviderRequestId),
    );

    const failedRow = failedOnly.data.find(
      (row) => String(row.provider_request_id || "") === failureProviderRequestId,
    );
    assert.ok(failedRow, "Expected failed B2C disbursement row for reversal retry request");

    const retryReversal = await api(
      baseUrl,
      `/api/mobile-money/b2c/disbursements/${Number(failedRow.id)}/retry-reversal`,
      {
        method: "POST",
        token: adminToken,
      },
    );
    assert.equal(retryReversal.status, 200);
    assert.equal(String(retryReversal.data.status), "queued_manual_reversal");
    assert.equal(Boolean(retryReversal.data.manualActionRequired), true);
    assert.equal(Number(retryReversal.data.loanId), loanFailureId);
    assert.ok(Number(retryReversal.data.reversalAttempts || 0) >= 1);
    assert.ok(String(retryReversal.data.reversalLastRequestedAt || "").length > 0);

    const failedAfterRetry = await api(
      baseUrl,
      `/api/mobile-money/b2c/disbursements?status=failed&providerRequestId=${encodeURIComponent(failureProviderRequestId)}`,
      {
        token: adminToken,
      },
    );
    assert.equal(failedAfterRetry.status, 200);
    const retriedRow = failedAfterRetry.data.find(
      (row) => String(row.provider_request_id || "") === failureProviderRequestId,
    );
    assert.ok(retriedRow);
    assert.match(String(retriedRow.failure_reason || ""), /reversal_retry_requested_at/i);
    assert.ok(Number(retriedRow.reversal_attempts || 0) >= 1);

    const b2cSummary = await api(baseUrl, "/api/mobile-money/b2c/disbursements/summary", {
      token: adminToken,
    });
    assert.equal(b2cSummary.status, 200);
    assert.ok(Number(b2cSummary.data.total || 0) >= 2);
    assert.ok(Number(b2cSummary.data.completed_count || 0) >= 1);
    assert.ok(Number(b2cSummary.data.failed_count || 0) >= 1);
    assert.ok(Number(b2cSummary.data.reversal_required_count || 0) >= 1);
    assert.ok(Number(b2cSummary.data.total_reversal_attempts || 0) >= 1);
  } finally {
    await stop();
  }
});

test("STK push and callback endpoints work when STK is enabled", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      MOBILE_MONEY_STK_ENABLED: "true",
      MOBILE_MONEY_PROVIDER: "mock",
      MOBILE_MONEY_WEBHOOK_TOKEN: "stk-webhook-token",
      MOBILE_MONEY_CALLBACK_IP_WHITELIST: "",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const stkPush = await api(baseUrl, "/api/mobile-money/stk/push", {
      method: "POST",
      token: adminToken,
      body: {
        amount: 5,
        phoneNumber: "+254700003222",
        accountReference: "AFRISERVE-TEST",
        transactionDesc: "STK test request",
      },
    });
    assert.equal(stkPush.status, 200);
    assert.equal(String(stkPush.data.status), "accepted");
    assert.ok(String(stkPush.data.providerRequestId || "").length > 0);

    const stkCallbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: String(stkPush.data.merchantRequestId || ""),
          CheckoutRequestID: String(stkPush.data.checkoutRequestId || ""),
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 5.0 },
              { Name: "MpesaReceiptNumber", Value: "TESTSTK123" },
              { Name: "TransactionDate", Value: Number(toMpesaTimestamp()) },
              { Name: "PhoneNumber", Value: 254700003222 },
            ],
          },
        },
      },
    };

    const callback = await api(baseUrl, "/api/mobile-money/stk/callback", {
      method: "POST",
      headers: createWebhookHeaders(stkCallbackPayload, "stk-webhook-token"),
      body: stkCallbackPayload,
    });
    assert.equal(callback.status, 200);
    assert.equal(Number(callback.data.ResultCode), 0);
    assert.equal(String(callback.data.status), "completed");
  } finally {
    await stop();
  }
});

test("Callback IP whitelist blocks non-whitelisted webhook source", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      MOBILE_MONEY_PROVIDER: "mock",
      MOBILE_MONEY_C2B_ENABLED: "true",
      MOBILE_MONEY_WEBHOOK_TOKEN: "test-webhook-token",
      MOBILE_MONEY_CALLBACK_IP_WHITELIST: "196.201.214.200",
    },
  });

  try {
    const webhookPayload = {
      TransID: "QX99999ABC",
      TransTime: toMpesaTimestamp(),
      TransAmount: "300",
      BillRefNumber: "123",
      MSISDN: "254700003001",
    };

    const webhook = await api(baseUrl, "/api/mobile-money/c2b/webhook", {
      method: "POST",
      headers: createWebhookHeaders(webhookPayload, "test-webhook-token", { includeToken: true }),
      body: webhookPayload,
    });
    assert.equal(webhook.status, 403);
    assert.match(String(webhook.data.message || ""), /whitelist/i);
  } finally {
    await stop();
  }
});
