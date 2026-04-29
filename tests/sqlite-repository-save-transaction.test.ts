import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SqliteLoanRepository } from "../src/infrastructure/repositories/SqliteLoanRepository.js";
import { SqliteClientRepository } from "../src/infrastructure/repositories/SqliteClientRepository.js";

describe("SQLite repository save transaction wiring", () => {
  it("wraps loan save in executeTransaction when available", async () => {
    let executeTransactionCalls = 0;
    let txGetCalls = 0;
    let txRunCalls = 0;

    const repository = new SqliteLoanRepository({
      get: async () => {
        throw new Error("root get should not be used when executeTransaction is available");
      },
      all: async () => [],
      run: async () => {
        throw new Error("root run should not be used when executeTransaction is available");
      },
      executeTransaction: async (callback) => {
        executeTransactionCalls += 1;
        return callback({
          get: async () => {
            txGetCalls += 1;
            return null;
          },
          run: async () => {
            txRunCalls += 1;
            return {};
          },
        });
      },
    });

    await repository.save({
      toPersistence: () => ({
        id: 101,
        client_id: 202,
        product_id: 5,
        branch_id: 7,
        purpose: "Working capital",
        created_by_user_id: 11,
        officer_id: 12,
        principal: 1500,
        interest_rate: 12,
        term_weeks: 8,
        term_months: 2,
        registration_fee: 10,
        processing_fee: 20,
        expected_total: 1700,
        balance: 1700,
        repaid_total: 0,
        status: "pending_approval",
        approved_by_user_id: null,
        approved_at: null,
        disbursed_by_user_id: null,
        disbursed_at: null,
        disbursement_note: null,
        external_reference: null,
        rejected_by_user_id: null,
        rejected_at: null,
        rejection_reason: null,
        archived_at: null,
        created_at: "2026-04-06T00:00:00.000Z",
      }),
    } as unknown as Parameters<SqliteLoanRepository["save"]>[0]);

    assert.equal(executeTransactionCalls, 1);
    assert.equal(txGetCalls, 1);
    assert.equal(txRunCalls, 1);
  });

  it("wraps client save in executeTransaction when available", async () => {
    let executeTransactionCalls = 0;
    let txGetCalls = 0;
    let txRunCalls = 0;

    const repository = new SqliteClientRepository({
      get: async () => {
        throw new Error("root get should not be used when executeTransaction is available");
      },
      all: async () => [],
      run: async () => {
        throw new Error("root run should not be used when executeTransaction is available");
      },
      executeTransaction: async (callback) => {
        executeTransactionCalls += 1;
        return callback({
          get: async () => {
            txGetCalls += 1;
            return null;
          },
          run: async () => {
            txRunCalls += 1;
            return {};
          },
        });
      },
    });

    await repository.save({
      toPersistence: () => ({
        tenant_id: "default",
        id: 303,
        full_name: "Transaction Test Client",
        phone: "+254700000000",
        national_id: "12345678",
        branch_id: 7,
        officer_id: 12,
        created_by_user_id: 11,
        kyc_status: "verified",
        onboarding_status: "ready_for_loan",
        fee_payment_status: "paid",
        fees_paid_at: "2026-04-06T00:00:00.000Z",
        kra_pin: null,
        photo_url: null,
        id_document_url: null,
        next_of_kin_name: null,
        next_of_kin_phone: null,
        next_of_kin_relation: null,
        business_type: null,
        business_years: null,
        business_location: null,
        residential_address: null,
        latitude: null,
        longitude: null,
        location_accuracy_meters: null,
        location_captured_at: null,
        is_active: 1,
        deleted_at: null,
        created_at: "2026-04-06T00:00:00.000Z",
        updated_at: "2026-04-06T00:00:00.000Z",
      }),
    } as unknown as Parameters<SqliteClientRepository["save"]>[0]);

    assert.equal(executeTransactionCalls, 1);
    assert.equal(txGetCalls, 1);
    assert.equal(txRunCalls, 1);
  });
});
