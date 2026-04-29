import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");

test("auth and general API limiters use scoped request keys instead of raw shared IP buckets", () => {
  const securitySource = fs.readFileSync(
    path.join(repoRoot, "src", "config", "security.ts"),
    "utf8",
  );
  const userRateLimitSource = fs.readFileSync(
    path.join(repoRoot, "src", "middleware", "userRateLimit.ts"),
    "utf8",
  );

  assert.match(securitySource, /getAuthRateLimitRequesterKey/);
  assert.match(securitySource, /getApiRateLimitRequesterKey/);
  assert.match(securitySource, /keyGenerator: \(req: RequestLike\) => getAuthRateLimitRequesterKey\(req\)/);
  assert.match(securitySource, /keyGenerator: \(req: RequestLike\) => getApiRateLimitRequesterKey\(req\)/);
  assert.match(userRateLimitSource, /bucket === "login"/);
  assert.match(userRateLimitSource, /getAuthRateLimitRequesterKey\(req\)/);
});
