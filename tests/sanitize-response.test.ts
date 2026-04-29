import assert from "node:assert";
import { describe, it } from "node:test";

import { sanitizeResponsePayload } from "../src/middleware/sanitizeResponse.js";

describe("sanitizeResponsePayload", () => {
  it("preserves Date values as ISO strings", () => {
    const createdAt = new Date("2026-04-26T09:15:00.000Z");

    const sanitized = sanitizeResponsePayload({
      created_at: createdAt,
      nested: {
        updated_at: createdAt,
      },
    }) as {
      created_at: string;
      nested: { updated_at: string };
    };

    assert.strictEqual(sanitized.created_at, createdAt.toISOString());
    assert.strictEqual(sanitized.nested.updated_at, createdAt.toISOString());
  });

  it("removes sensitive keys while keeping safe payload values", () => {
    const sanitized = sanitizeResponsePayload({
      full_name: "Test Customer",
      password: "super-secret",
      nested: {
        secret: "hidden",
        status: "active",
      },
    }) as {
      full_name: string;
      nested: { status: string };
      password?: string;
    };

    assert.strictEqual(sanitized.full_name, "Test Customer");
    assert.strictEqual(sanitized.nested.status, "active");
    assert.ok(!("password" in sanitized));
    assert.ok(!("secret" in sanitized.nested));
  });
});
