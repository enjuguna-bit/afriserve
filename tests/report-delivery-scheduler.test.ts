import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startServer } from "./integration-helpers.js";
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(checkFn, timeoutMs = 5000, intervalMs = 100) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (checkFn()) {
      return;
    }
    await wait(intervalMs);
  }
  throw new Error("Condition not met before timeout");
}

async function createWebhookServer() {
  const deliveries = [];
  const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        deliveries.push(JSON.parse(body));
      } catch (_error) {
        deliveries.push({ parseError: true, rawBody: body });
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? Number(address.port) : 0;
  if (!port) {
    throw new Error("Failed to determine webhook port");
  }

  return {
    deliveries,
    webhookUrl: `http://127.0.0.1:${port}/deliver`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test("scheduled report delivery posts daily portfolio digest payload to webhook", async () => {
  const webhook = await createWebhookServer();
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      REPORT_DELIVERY_ENABLED: "true",
      REPORT_DELIVERY_INTERVAL_MS: "150",
      REPORT_DELIVERY_RECIPIENT_EMAIL: "ceo@example.com",
      REPORT_DELIVERY_WEBHOOK_URL: webhook.webhookUrl,
      REPORT_DELIVERY_WEBHOOK_TIMEOUT_MS: "2000",
    },
  });

  try {
    await waitFor(() => webhook.deliveries.length > 0, 6000, 120);
    const firstDelivery = webhook.deliveries[0];
    assert.equal(firstDelivery.event, "daily_portfolio_digest");
    assert.equal(firstDelivery.recipientEmail, "ceo@example.com");
    assert.ok(typeof firstDelivery.generatedAt === "string" && firstDelivery.generatedAt.length > 0);
    assert.ok(firstDelivery.summary && typeof firstDelivery.summary === "object");
    assert.ok(firstDelivery.attachment && typeof firstDelivery.attachment === "object");
    assert.equal(firstDelivery.attachment.filename, "daily-portfolio-digest.csv");
    assert.ok(
      typeof firstDelivery.attachment.contentBase64 === "string"
      && firstDelivery.attachment.contentBase64.length > 0,
    );

    const health = await fetch(`${baseUrl}/health/details`);
    assert.equal(health.status, 200);
  } finally {
    await stop();
    await webhook.close();
  }
});

