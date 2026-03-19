import test from "node:test";
import assert from "node:assert/strict";
import { CircuitBreakerOpenError, CircuitBreakerTimeoutError, createCircuitBreaker } from "../src/services/circuitBreaker.js";

test("circuit breaker opens after repeated failures and recovers after reset timeout", async () => {
  const breaker = createCircuitBreaker({
    name: "mobile_money.b2c",
    failureThreshold: 2,
    resetTimeoutMs: 40,
    timeoutMs: 25,
  });

  await assert.rejects(
    breaker.execute(async () => {
      throw new Error("first failure");
    }),
    /first failure/,
  );

  await assert.rejects(
    breaker.execute(async () => {
      throw new Error("second failure");
    }),
    /second failure/,
  );

  await assert.rejects(
    breaker.execute(async () => "unexpected"),
    (error: unknown) => error instanceof CircuitBreakerOpenError,
  );
  assert.equal(breaker.getState().state, "open");

  await new Promise((resolve) => setTimeout(resolve, 60));

  const recovered = await breaker.execute(async () => "recovered");
  assert.equal(recovered, "recovered");
  assert.equal(breaker.getState().state, "closed");
});

test("circuit breaker times out slow upstream work", async () => {
  const breaker = createCircuitBreaker({
    name: "mobile_money.stk",
    failureThreshold: 3,
    resetTimeoutMs: 50,
    timeoutMs: 10,
  });

  await assert.rejects(
    breaker.execute(async () => new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 40);
    })),
    (error: unknown) => error instanceof CircuitBreakerTimeoutError && error.timeoutMs === 10,
  );
});
