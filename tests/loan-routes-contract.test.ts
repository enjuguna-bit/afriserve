import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("loan routes barrel contract", () => {
  it("registerLoanRoutes is exported from loanRoutes", async () => {
    const module = await import("../src/routes/loanRoutes.js");
    assert.ok(
      typeof module.registerLoanRoutes === "function",
      "registerLoanRoutes must be a function",
    );
  });

  it("registerLoanRoutes and registerLoanServiceRoutes resolve to the same function", async () => {
    const [routesModule, serviceModule] = await Promise.all([
      import("../src/routes/loanRoutes.js"),
      import("../src/routes/services/loanRouteService.js"),
    ]);
    assert.strictEqual(
      routesModule.registerLoanRoutes,
      serviceModule.registerLoanServiceRoutes,
      "loanRoutes barrel must re-export registerLoanServiceRoutes directly, not wrap it",
    );
  });

  it("validators barrel exports all expected loan schemas", async () => {
    const validators = await import("../src/validators.js");
    const expectedExports = [
      "createLoanSchema",
      "approveLoanSchema",
      "disburseLoanSchema",
      "rejectLoanSchema",
      "createRepaymentSchema",
      "createGuarantorSchema",
      "createCollateralAssetSchema",
      "updateCollateralAssetSchema",
      "linkLoanGuarantorSchema",
      "linkLoanCollateralSchema",
      "loanLifecycleActionSchema",
      "restructureLoanSchema",
      "topUpLoanSchema",
      "refinanceLoanSchema",
      "extendLoanTermSchema",
      "updateLoanDetailsSchema",
      "createLoanProductSchema",
      "updateLoanProductSchema",
    ];

    for (const name of expectedExports) {
      assert.ok(
        name in validators,
        `validators.ts barrel must export ${name}`,
      );
      assert.ok(
        typeof (validators as Record<string, unknown>)[name] === "object" ||
        typeof (validators as Record<string, unknown>)[name] === "function",
        `${name} must be a Zod schema object`,
      );
    }
  });

  it("validators barrel exports all expected auth schemas", async () => {
    const validators = await import("../src/validators.js");
    const expectedExports = [
      "loginSchema",
      "refreshTokenSchema",
      "createUserSchema",
      "changePasswordSchema",
      "resetPasswordRequestSchema",
      "resetPasswordConfirmSchema",
    ];

    for (const name of expectedExports) {
      assert.ok(
        name in validators,
        `validators.ts barrel must export ${name}`,
      );
    }
  });

  it("validators barrel exports shared primitives", async () => {
    const validators = await import("../src/validators.js");
    assert.ok("latitudeSchema" in validators, "shared latitudeSchema must be exported");
    assert.ok("longitudeSchema" in validators, "shared longitudeSchema must be exported");
    assert.ok("passwordSchema" in validators, "shared passwordSchema must be exported");
    assert.ok("assetTypeSchema" in validators, "shared assetTypeSchema must be exported");
    assert.ok("branchCodeSchema" in validators, "shared branchCodeSchema must be exported");
  });
});
