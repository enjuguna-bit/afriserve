import test from "node:test";
import assert from "node:assert/strict";
import { createMobileMoneyProvider } from "../src/services/mobileMoneyProvider.js";

function mockJsonResponse(status: number, payload: Record<string, any>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test("Daraja provider requests OAuth token and sends B2C payment request", async () => {
  let oauthCalls = 0;
  let b2cCalls = 0;

  const provider = createMobileMoneyProvider({
    env: {
      MOBILE_MONEY_PROVIDER: "daraja",
      MOBILE_MONEY_DARAJA_BASE_URL: "https://sandbox.safaricom.co.ke",
      MOBILE_MONEY_DARAJA_CONSUMER_KEY: "consumer-key",
      MOBILE_MONEY_DARAJA_CONSUMER_SECRET: "consumer-secret",
      MOBILE_MONEY_DARAJA_B2C_INITIATOR_NAME: "sandbox-initiator",
      MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL: "security-credential",
      MOBILE_MONEY_DARAJA_B2C_SHORTCODE: "600123",
      MOBILE_MONEY_DARAJA_B2C_RESULT_URL: "https://example.com/mobile-money/b2c/result",
      MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL: "https://example.com/mobile-money/b2c/timeout",
    },
    fetchImpl: async (url, init) => {
      if (url.includes("/oauth/v1/generate")) {
        oauthCalls += 1;
        assert.equal(String(init?.method || "GET").toUpperCase(), "GET");
        assert.match(String(init?.headers?.Authorization || ""), /^Basic\s+/i);
        return mockJsonResponse(200, {
          access_token: "daraja-access-token",
          expires_in: "3600",
        });
      }

      if (url.includes("/mpesa/b2c/v1/paymentrequest")) {
        b2cCalls += 1;
        const payload = JSON.parse(String(init?.body || "{}"));
        assert.equal(payload.InitiatorName, "sandbox-initiator");
        assert.equal(payload.PartyA, "600123");
        assert.equal(payload.PartyB, "254700003001");
        assert.equal(payload.Amount, b2cCalls === 1 ? 1200 : 800);
        assert.equal(payload.CommandID, "BusinessPayment");
        assert.equal(payload.ResultURL, "https://example.com/mobile-money/b2c/result");
        assert.equal(payload.QueueTimeOutURL, "https://example.com/mobile-money/b2c/timeout");
        assert.equal(String(init?.headers?.Authorization || ""), "Bearer daraja-access-token");
        return mockJsonResponse(200, {
          ResponseCode: "0",
          ResponseDescription: "Accept the service request successfully.",
          ConversationID: "AG_20260305_ABC123",
          OriginatorConversationID: "12345-67890",
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const first = await provider.initiateB2CDisbursement({
    amount: 1200.4,
    phoneNumber: "254700003001",
    accountReference: "LOAN-99",
    narration: "Loan disbursement",
  });
  assert.equal(first.status, "accepted");
  assert.equal(first.providerRequestId, "AG_20260305_ABC123");

  const second = await provider.initiateB2CDisbursement({
    amount: 800,
    phoneNumber: "254700003001",
    accountReference: "LOAN-100",
    narration: "Second transfer",
  });
  assert.equal(second.status, "accepted");

  assert.equal(oauthCalls, 1);
  assert.equal(b2cCalls, 2);
});

test("Daraja provider fails fast when required B2C settings are missing", async () => {
  const provider = createMobileMoneyProvider({
    env: {
      MOBILE_MONEY_PROVIDER: "daraja",
      MOBILE_MONEY_DARAJA_CONSUMER_KEY: "consumer-key",
      MOBILE_MONEY_DARAJA_CONSUMER_SECRET: "consumer-secret",
    },
    fetchImpl: async () => mockJsonResponse(200, {}),
  });

  await assert.rejects(
    provider.initiateB2CDisbursement({
      amount: 100,
      phoneNumber: "254700000001",
      accountReference: "LOAN-1",
      narration: "test",
    }),
    /Missing required Daraja B2C configuration/i,
  );
});

test("Daraja provider throws when API returns non-success response code", async () => {
  const provider = createMobileMoneyProvider({
    env: {
      MOBILE_MONEY_PROVIDER: "daraja",
      MOBILE_MONEY_DARAJA_BASE_URL: "https://sandbox.safaricom.co.ke",
      MOBILE_MONEY_DARAJA_CONSUMER_KEY: "consumer-key",
      MOBILE_MONEY_DARAJA_CONSUMER_SECRET: "consumer-secret",
      MOBILE_MONEY_DARAJA_B2C_INITIATOR_NAME: "sandbox-initiator",
      MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL: "security-credential",
      MOBILE_MONEY_DARAJA_B2C_SHORTCODE: "600123",
      MOBILE_MONEY_DARAJA_B2C_RESULT_URL: "https://example.com/mobile-money/b2c/result",
      MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL: "https://example.com/mobile-money/b2c/timeout",
    },
    fetchImpl: async (url) => {
      if (url.includes("/oauth/v1/generate")) {
        return mockJsonResponse(200, {
          access_token: "daraja-access-token",
          expires_in: "3600",
        });
      }
      return mockJsonResponse(200, {
        ResponseCode: "2001",
        ResponseDescription: "Balance insufficient for transaction.",
      });
    },
  });

  await assert.rejects(
    provider.initiateB2CDisbursement({
      amount: 500,
      phoneNumber: "254700000222",
      accountReference: "LOAN-2",
      narration: "test",
    }),
    /balance insufficient/i,
  );
});

test("Daraja provider initiates STK push with OAuth token", async () => {
  const provider = createMobileMoneyProvider({
    env: {
      MOBILE_MONEY_PROVIDER: "daraja",
      MOBILE_MONEY_DARAJA_BASE_URL: "https://sandbox.safaricom.co.ke",
      MOBILE_MONEY_DARAJA_CONSUMER_KEY: "consumer-key",
      MOBILE_MONEY_DARAJA_CONSUMER_SECRET: "consumer-secret",
      MOBILE_MONEY_DARAJA_STK_SHORTCODE: "174379",
      MOBILE_MONEY_DARAJA_STK_PASSKEY: "sandbox-passkey",
      MOBILE_MONEY_DARAJA_STK_CALLBACK_URL: "https://example.com/mobile-money/stk/callback",
      MOBILE_MONEY_DARAJA_STK_TRANSACTION_TYPE: "CustomerPayBillOnline",
    },
    fetchImpl: async (url, init) => {
      if (url.includes("/oauth/v1/generate")) {
        return mockJsonResponse(200, {
          access_token: "daraja-access-token",
          expires_in: "3600",
        });
      }
      if (url.includes("/mpesa/stkpush/v1/processrequest")) {
        const payload = JSON.parse(String(init?.body || "{}"));
        assert.equal(payload.BusinessShortCode, "174379");
        assert.equal(payload.TransactionType, "CustomerPayBillOnline");
        assert.equal(payload.Amount, 1);
        assert.equal(payload.PhoneNumber, "254700003001");
        assert.equal(payload.CallBackURL, "https://example.com/mobile-money/stk/callback");
        const decodedPassword = Buffer.from(String(payload.Password || ""), "base64").toString("utf8");
        assert.match(decodedPassword, /^174379sandbox-passkey\d{14}$/);
        return mockJsonResponse(200, {
          ResponseCode: "0",
          ResponseDescription: "Success. Request accepted for processing",
          MerchantRequestID: "29115-34620561-1",
          CheckoutRequestID: "ws_CO_191220191020363925",
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const result = await provider.initiateSTKPush({
    amount: 1,
    phoneNumber: "254700003001",
    accountReference: "AFRISERVE",
    transactionDesc: "Test payment",
  });

  assert.equal(result.status, "accepted");
  assert.equal(result.providerRequestId, "ws_CO_191220191020363925");
  assert.equal(result.checkoutRequestId, "ws_CO_191220191020363925");
  assert.equal(result.merchantRequestId, "29115-34620561-1");
});

test("Daraja provider parses STK callback payload", () => {
  const provider = createMobileMoneyProvider({
    env: {
      MOBILE_MONEY_PROVIDER: "daraja",
    },
  });

  const parsed = provider.parseSTKCallback({
    body: {
      Body: {
        stkCallback: {
          MerchantRequestID: "29115-34620561-1",
          CheckoutRequestID: "ws_CO_191220191020363925",
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 1.0 },
              { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
              { Name: "TransactionDate", Value: 20260305131011 },
              { Name: "PhoneNumber", Value: 254700003001 },
            ],
          },
        },
      },
    },
  });

  assert.equal(parsed.status, "completed");
  assert.equal(parsed.resultCode, 0);
  assert.equal(parsed.checkoutRequestId, "ws_CO_191220191020363925");
  assert.equal(parsed.externalReceipt, "NLJ7RT61SV");
  assert.equal(parsed.phoneNumber, "254700003001");
  assert.equal(parsed.amount, 1);
});
