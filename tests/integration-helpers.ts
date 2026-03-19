import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.basename(path.dirname(currentDir)) === "dist"
  ? path.resolve(currentDir, "..", "..")
  : path.resolve(currentDir, "..");

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address !== "object") {
          reject(new Error("Could not resolve free port"));
          return;
        }
        resolve(address.port);
      });
    });
    server.on("error", reject);
  });
}

async function waitForServer(baseUrl: string, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Server may still be starting up.
    }
    await wait(100);
  }

  throw new Error("Server failed to become healthy within timeout");
}

export async function startServer({ envOverrides = {} as any } = {}) {
  const port = await findFreePort();
  const cwd = repoRoot;
  const requestedDbClient = String(
    envOverrides.DB_CLIENT
      || process.env.TEST_DB_CLIENT
      || process.env.DB_CLIENT
      || "sqlite",
  ).toLowerCase();
  const usePostgres = requestedDbClient === "postgres";

  let dbFilePath: string | null = null;
  let databaseUrl: string | undefined;
  let shouldCleanupDbFile = false;

  if (usePostgres) {
    databaseUrl = String(
      envOverrides.DATABASE_URL
      || process.env.TEST_DATABASE_URL
      || process.env.DATABASE_URL
      || "",
    ).trim();

    if (!databaseUrl) {
      throw new Error(
        "PostgreSQL test mode requires DATABASE_URL or TEST_DATABASE_URL to be set.",
      );
    }
  } else {
    const requestedDatabaseUrl = String(envOverrides.DATABASE_URL || "").trim();
    const requestedDbPath = String(envOverrides.DB_PATH || "").trim();

    if (requestedDatabaseUrl) {
      databaseUrl = requestedDatabaseUrl;
    } else if (requestedDbPath) {
      dbFilePath = path.resolve(cwd, requestedDbPath);
      await fs.mkdir(path.dirname(dbFilePath), { recursive: true });
      databaseUrl = `file:${dbFilePath.replace(/\\/g, "/")}`;
    } else {
      const dbDir = path.join(cwd, ".runtime", "test-dbs");
      await fs.mkdir(dbDir, { recursive: true });
      dbFilePath = path.join(dbDir, `integration-${Date.now()}-${port}.sqlite`);
      databaseUrl = `file:${dbFilePath.replace(/\\/g, "/")}`;
      shouldCleanupDbFile = true;
    }
  }

  const env: any = {
    ...process.env,
    PORT: String(port),
    JWT_SECRET: "integration-test-secret",
    NODE_ENV: "test",
    DB_CLIENT: usePostgres ? "postgres" : "sqlite",
    DB_PATH: dbFilePath || process.env.DB_PATH || "",
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: `http://localhost:${port},http://127.0.0.1:${port}`,
    ALLOW_CONSOLE_RESET_TOKENS: "false",
    ...envOverrides,
  };

  // FIX #3: Use stdio:"pipe" so we capture output, and throw on failure so
  // the test fails loudly with a meaningful message rather than silently
  // proceeding with an un-migrated DB and returning 500 on every route.
  try {
    execSync("npx prisma db push --accept-data-loss", { env, stdio: "pipe", cwd });
  } catch (err: any) {
    const output = [
      err?.stdout?.toString?.() || "",
      err?.stderr?.toString?.() || "",
    ].join("\n").trim();
    throw new Error(
      `Prisma db push failed during test setup — cannot start server.\n${output}`,
    );
  }

  const child = spawn(process.execPath, ["dist/src/server.js"], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let startupLogs = "";
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    startupLogs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    console.error(chunk.toString());
    startupLogs += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(baseUrl);
  } catch (error: any) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
    throw new Error(`${error.message}\nStartup logs:\n${startupLogs}`);
  }

  async function stop() {
    if (child.exitCode !== null) {
      return;
    }

    child.kill("SIGTERM");
    const exited = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });

    if (!exited && child.exitCode === null) {
      child.kill("SIGKILL");
    }

    if (shouldCleanupDbFile && dbFilePath) {
      await Promise.all([
        fs.rm(dbFilePath, { force: true }),
        fs.rm(`${dbFilePath}-wal`, { force: true }),
        fs.rm(`${dbFilePath}-shm`, { force: true }),
      ]);
    }
  }

  return { baseUrl, stop, dbFilePath, databaseUrl };
}

// FIX #3b: Run onboarding steps sequentially so each one completes before
// the next begins. The original Promise.allSettled ran them in parallel,
// which could cause race conditions on the fresh test DB (e.g. KYC not
// committed before the guarantor request reads the client row).
export async function ensureClientLoanOnboarding(baseUrl: string, clientId: number, token: string) {
  const suffix = `${clientId}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const adminToken = await loginAsAdmin(baseUrl);
  const headers: any = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const adminHeaders: any = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  };

  // Step 1: verify KYC first — everything downstream depends on this.
  await fetch(`${baseUrl}/api/clients/${clientId}/kyc`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      status: "verified",
      note: "Integration test auto KYC verification",
    }),
  }).catch(() => {/* best-effort */});

  // Step 2: add guarantor to client profile.
  await fetch(`${baseUrl}/api/clients/${clientId}/guarantors`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fullName: `Integration Guarantor ${suffix}`,
      phone: `+2547${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
      nationalId: `INTG-${suffix}`,
      monthlyIncome: 35000,
      guaranteeAmount: 25000,
    }),
  }).catch(() => {/* best-effort */});

  // Step 3: add collateral to client profile.
  await fetch(`${baseUrl}/api/clients/${clientId}/collaterals`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      assetType: "vehicle",
      description: `Integration collateral ${suffix}`,
      estimatedValue: 250000,
      registrationNumber: `INT-${suffix}`.slice(0, 24),
      logbookNumber: `LOG-${suffix}`.slice(0, 24),
    }),
  }).catch(() => {/* best-effort */});

  // Step 4: mark onboarding fees as paid.
  await fetch(`${baseUrl}/api/clients/${clientId}/fees`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      note: "Integration test auto fee payment",
    }),
  }).catch(() => {/* best-effort */});
}

export async function api(
  baseUrl: string,
  route: string,
  options: {
    method?: string;
    token?: string;
    body?: any;
    headers?: Record<string, string>;
    skipLoanOnboardingAutomation?: boolean;
  } = {},
) {
  const {
    method = "GET",
    token,
    body,
    headers: customHeaders = {},
    skipLoanOnboardingAutomation = false,
  } = options;
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedRoute = String(route || "").split("?")[0];

  if (
    !skipLoanOnboardingAutomation
    && normalizedMethod === "POST"
    && normalizedRoute === "/api/loans"
    && token
    && body
    && typeof body === "object"
  ) {
    const clientIdCandidate = Number(body.clientId || body.client_id || 0);
    if (Number.isInteger(clientIdCandidate) && clientIdCandidate > 0) {
      await ensureClientLoanOnboarding(baseUrl, clientIdCandidate, token);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${route}`, {
    method: normalizedMethod,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  return {
    status: response.status,
    data,
  };
}

export async function loginAsAdmin(baseUrl: string) {
  const login = await api(baseUrl, "/api/auth/login", {
    method: "POST",
    body: {
      email: "admin@afriserve.local",
      password: "Admin@123",
    },
  });
  if (login.status !== 200) {
    throw new Error(`Admin login failed with status ${login.status}`);
  }
  return login.data.token;
}

export async function createHighRiskReviewerToken(baseUrl: string, adminToken: string, options: any = {}) {
  const role = String(options.role || "finance").trim() || "finance";
  const password = String(options.password || "Password@123");
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = String(options.email || `highrisk.${role}.${suffix}@example.com`);
  const fullName = String(options.fullName || `High Risk Reviewer ${suffix}`);
  const branchId = Number(options.branchId || 0) || null;

  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: {
      fullName,
      email,
      password,
      role,
      ...(branchId ? { branchId } : {}),
    },
  });

  if (createUser.status !== 201) {
    throw new Error(`Failed to create high-risk reviewer user. Status ${createUser.status}`);
  }

  const login = await api(baseUrl, "/api/auth/login", {
    method: "POST",
    body: {
      email,
      password,
    },
  });
  if (login.status !== 200) {
    throw new Error(`High-risk reviewer login failed with status ${login.status}`);
  }
  return login.data.token;
}

export async function approveLoan(baseUrl: string, loanId: number, token: string, { notes }: any = {}) {
  const body: any = {};
  if (typeof notes === "string" && notes.trim()) {
    body.notes = notes.trim();
  }

  const approval = await api(baseUrl, `/api/loans/${loanId}/approve`, {
    method: "POST",
    token,
    body,
  });
  if (approval.status !== 200) {
    return approval;
  }

  if (String(approval.data?.status || "").toLowerCase() === "active") {
    return approval;
  }

  const disbursement = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
    method: "POST",
    token,
    body,
  });
  if (disbursement.status !== 200) {
    return disbursement;
  }

  return {
    status: disbursement.status,
    data: disbursement.data?.loan || disbursement.data,
  };
}

export async function submitAndReviewHighRiskRequest(
  baseUrl: string,
  {
    loanId,
    action,
    requestToken,
    reviewToken,
    requestBody = {},
    decision = "approve",
    reviewNote = "",
  }: any,
) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  const actionMap: Record<string, { path: string; requestType: string }> = {
    write_off: { path: "write-off", requestType: "loan_write_off" },
    "write-off": { path: "write-off", requestType: "loan_write_off" },
    top_up: { path: "top-up", requestType: "loan_top_up" },
    "top-up": { path: "top-up", requestType: "loan_top_up" },
    topup: { path: "top-up", requestType: "loan_top_up" },
    refinance: { path: "refinance", requestType: "loan_refinance" },
    term_extension: { path: "extend-term", requestType: "loan_term_extension" },
    "term-extension": { path: "extend-term", requestType: "loan_term_extension" },
    "extend-term": { path: "extend-term", requestType: "loan_term_extension" },
    extend_term: { path: "extend-term", requestType: "loan_term_extension" },
    restructure: { path: "restructure", requestType: "loan_restructure" },
  };
  const resolvedAction = actionMap[normalizedAction] || actionMap.restructure;
  const actionPath = resolvedAction.path;
  const expectedRequestType = resolvedAction.requestType;

  const request = await api(baseUrl, `/api/loans/${loanId}/${actionPath}`, {
    method: "POST",
    token: requestToken,
    body: requestBody,
  });

  const pendingToken = reviewToken || requestToken;
  let approvalRequest = request.data?.approvalRequest || null;
  if (!approvalRequest || !Number(approvalRequest.id)) {
    const pending = await api(baseUrl, `/api/approval-requests?status=pending&loanId=${loanId}`, {
      token: pendingToken,
    });
    if (pending.status === 200 && Array.isArray(pending.data?.rows)) {
      approvalRequest = pending.data.rows.find(
        (row: any) => String(row.request_type || "").toLowerCase() === expectedRequestType,
      ) || null;
    }
  }

  if (!approvalRequest || !Number(approvalRequest.id)) {
    return {
      request,
      approvalRequest: null,
      review: null,
    };
  }

  const reviewBody = {
    decision,
    ...(typeof reviewNote === "string" && reviewNote.trim() ? { note: reviewNote.trim() } : {}),
  };

  const review = await api(baseUrl, `/api/approval-requests/${Number(approvalRequest.id)}/review`, {
    method: "POST",
    token: pendingToken,
    body: reviewBody,
  });

  return {
    request,
    approvalRequest,
    review,
  };
}
