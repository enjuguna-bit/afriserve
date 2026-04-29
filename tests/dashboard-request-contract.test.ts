import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");

function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

test("dashboard pending approvals uses authenticated loan service access", () => {
  const dashboardSource = readRepoFile("frontend-next", "src", "features", "dashboard", "pages", "DashboardPage.tsx");

  assert.match(dashboardSource, /listPendingApprovalLoans/);
  assert.doesNotMatch(dashboardSource, /fetch\('\/api\/loans\?status=pending_approval/);
});

test("query warmup is gated behind an authenticated session and skips the login page", () => {
  const appProvidersSource = readRepoFile("frontend-next", "src", "app", "providers", "AppProviders.tsx");

  assert.match(appProvidersSource, /const isWarmupEnabled = Boolean\(token && user\)/);
  assert.match(appProvidersSource, /if \(!isWarmupEnabled\)/);
  assert.match(appProvidersSource, /pathname === '\/login'/);
});

test("dashboard shortcuts use the shared destinationRoute and filterParams card API", () => {
  const metricCardSource = readRepoFile("frontend-next", "src", "features", "dashboard", "components", "DashboardMetricCard.tsx");
  const dashboardSource = readRepoFile("frontend-next", "src", "features", "dashboard", "pages", "DashboardPage.tsx");
  const scaffoldSource = readRepoFile("frontend-next", "src", "features", "dashboard", "components", "DashboardScaffoldPanels.tsx");

  assert.match(metricCardSource, /destinationRoute\?: string/);
  assert.match(metricCardSource, /filterParams\?: DashboardFilterParams/);
  assert.match(metricCardSource, /buildDashboardDestinationHref/);
  assert.match(dashboardSource, /<DashboardMetricCard/);
  assert.match(scaffoldSource, /<DashboardMetricCard/);
  assert.match(scaffoldSource, /shortcutTargets:/);
});

test("dashboard unpaid dues card deep-links into the filtered dues report generator", () => {
  const dashboardSource = readRepoFile("frontend-next", "src", "features", "dashboard", "pages", "DashboardPage.tsx");
  const reportsPageSource = readRepoFile("frontend-next", "src", "features", "reports", "pages", "ReportsPage.tsx");

  assert.match(dashboardSource, /reportId: 'collections-dues'/);
  assert.match(dashboardSource, /collectionsDueTodayReportFilterParams/);
  assert.match(reportsPageSource, /useSearchParams/);
  assert.match(reportsPageSource, /autoloadRequested/);
  assert.match(reportsPageSource, /extractReportPassThroughParams/);
});

test("dashboard arrears collected shortcut deep-links into the arrears-only collections report", () => {
  const dashboardSource = readRepoFile("frontend-next", "src", "features", "dashboard", "pages", "DashboardPage.tsx");
  const collectionsReportSource = readRepoFile("src", "routes", "reports", "collectionReports.ts");

  assert.match(dashboardSource, /const arrearsCollectedTodayReportFilterParams/);
  assert.match(dashboardSource, /collectionFocus: 'arrears_only'/);
  assert.match(dashboardSource, /Arrears collected/);
  assert.match(collectionsReportSource, /collectionFocus === "arrears_only"/);
  assert.match(collectionsReportSource, /payments: filteredPayments/);
});

test("dashboard total arrears and PAR shortcuts deep-link into filtered arrears report buckets", () => {
  const dashboardSource = readRepoFile("frontend-next", "src", "features", "dashboard", "pages", "DashboardPage.tsx");
  const portfolioReportsSource = readRepoFile("src", "routes", "reports", "portfolioReports.ts");

  assert.match(dashboardSource, /reportId: 'operations-red-flag'/);
  assert.match(dashboardSource, /agingBucket: '1_30'/);
  assert.match(dashboardSource, /agingBucket: '31_60'/);
  assert.match(dashboardSource, /agingBucket: '61_90'/);
  assert.match(dashboardSource, /agingBucket: '91_plus'/);
  assert.match(portfolioReportsSource, /resolveAgingBucketFilter\(req\.query\.agingBucket, res\)/);
  assert.match(portfolioReportsSource, /buildAgingBucketWhereSql\("days_overdue", agingBucketFilter\)/);
  assert.match(portfolioReportsSource, /agingBucket: agingBucketFilter \|\| null/);
});

test("client and loan destination pages hydrate dashboard shortcut filters from URL search params", () => {
  const clientsPageSource = readRepoFile("frontend-next", "src", "features", "clients", "pages", "ClientsPage.tsx");
  const loansPageSource = readRepoFile("frontend-next", "src", "features", "loans", "pages", "LoansPage.tsx");

  assert.match(clientsPageSource, /useSearchParams/);
  assert.match(clientsPageSource, /searchParams\.get\('branchId'\)/);
  assert.match(clientsPageSource, /searchParams\.get\('officerId'\)/);
  assert.match(clientsPageSource, /searchParams\.get\('minLoans'\)/);
  assert.match(clientsPageSource, /searchParams\.get\('isActive'\)/);
  assert.match(loansPageSource, /useSearchParams/);
  assert.match(loansPageSource, /searchParams\.get\('statusGroup'\)/);
  assert.match(loansPageSource, /searchParams\.get\('workflowStage'\)/);
});

test("dashboard consumes backend PAR ratio fields from the arrears summary when available", () => {
  const dashboardSource = readRepoFile("frontend-next", "src", "features", "dashboard", "pages", "DashboardPage.tsx");

  assert.match(dashboardSource, /arrearsSummary\.par30_ratio/);
  assert.match(dashboardSource, /arrearsSummary\.par60_ratio/);
  assert.match(dashboardSource, /arrearsSummary\.par90_ratio/);
  assert.match(dashboardSource, /arrearsSummary\.npl_ratio/);
  assert.match(dashboardSource, /arrearsSummary\.at_risk_ratio/);
});

test("dashboard lending snapshot reads monthly and daily origination metrics from report APIs", () => {
  const dashboardSource = readRepoFile("frontend-next", "src", "features", "dashboard", "pages", "DashboardPage.tsx");
  const portfolioReportsSource = readRepoFile("src", "routes", "reports", "portfolioReports.ts");

  assert.match(dashboardSource, /getClientSummaryReport/);
  assert.match(dashboardSource, /getDisbursementsReport/);
  assert.match(dashboardSource, /reportId: 'operations-customers'/);
  assert.match(dashboardSource, /reportId: 'operations-disbursement'/);
  assert.match(dashboardSource, /Declined loans/);
  assert.match(dashboardSource, /Disbursed today/);
  assert.match(portfolioReportsSource, /declined_loans/);
});
