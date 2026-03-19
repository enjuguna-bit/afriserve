const authCard = document.getElementById("authCard");
const dashboard = document.getElementById("dashboard");
const authMessage = document.getElementById("authMessage");
const dashboardMessage = document.getElementById("dashboardMessage");
const userMeta = document.getElementById("userMeta");
const userScopeMeta = document.getElementById("userScopeMeta");
const userRoleHint = document.getElementById("userRoleHint");
const portfolioList = document.getElementById("portfolioList");
const myPortfolioCard = document.getElementById("myPortfolioCard");
const myPortfolioList = document.getElementById("myPortfolioList");
const txRows = document.getElementById("txRows");
const collectionsList = document.getElementById("collectionsList");
const collectionsPanelTitle = document.getElementById("collectionsPanelTitle");
const myPipelineCard = document.getElementById("myPipelineCard");
const myPipelineRows = document.getElementById("myPipelineRows");
const overdueRows = document.getElementById("overdueRows");
const collectionActionRows = document.getElementById("collectionActionRows");
const officerPerformanceCard = document.getElementById("officerPerformanceCard");
const officerPerformanceForm = document.getElementById("officerPerformanceForm");
const officerPerformanceRows = document.getElementById("officerPerformanceRows");
const officerPerformanceMeta = document.getElementById("officerPerformanceMeta");
const officerPerformanceResetBtn = document.getElementById("officerPerformanceResetBtn");
const portfolioKpiForm = document.getElementById("portfolioKpiForm");
const portfolioKpiDateFromInput = document.getElementById("portfolioKpiDateFrom");
const portfolioKpiDateToInput = document.getElementById("portfolioKpiDateTo");
const portfolioKpiResetBtn = document.getElementById("portfolioKpiResetBtn");
const portfolioKpiMeta = document.getElementById("portfolioKpiMeta");
const portfolioKpiChart = document.getElementById("portfolioKpiChart");
const portfolioKpiHighlights = document.getElementById("portfolioKpiHighlights");
const clientTrendForm = document.getElementById("clientTrendForm");
const clientTrendDateFromInput = document.getElementById("clientTrendDateFrom");
const clientTrendDateToInput = document.getElementById("clientTrendDateTo");
const clientTrendResetBtn = document.getElementById("clientTrendResetBtn");
const clientTrendMeta = document.getElementById("clientTrendMeta");
const clientTrendChart = document.getElementById("clientTrendChart");
const clientTrendList = document.getElementById("clientTrendList");
const overdueAlertsForm = document.getElementById("overdueAlertsForm");
const overdueAlertsDateFromInput = document.getElementById("overdueAlertsDateFrom");
const overdueAlertsDateToInput = document.getElementById("overdueAlertsDateTo");
const overdueAlertsMinDaysInput = document.getElementById("overdueAlertsMinDays");
const overdueAlertsResetBtn = document.getElementById("overdueAlertsResetBtn");
const overdueAlertsMeta = document.getElementById("overdueAlertsMeta");
const overdueAlertsList = document.getElementById("overdueAlertsList");
const overdueAlertsRows = document.getElementById("overdueAlertsRows");
const scheduleRows = document.getElementById("scheduleRows");
const scheduleSummary = document.getElementById("scheduleSummary");
const scheduleBreakdown = document.getElementById("scheduleBreakdown");
const loanSearchRows = document.getElementById("loanSearchRows");
const loanSearchMeta = document.getElementById("loanSearchMeta");
const adminUserPanel = document.getElementById("adminUserPanel");
const adminMenuGroup = document.getElementById("adminMenuGroup");
const financeMenuGroup = document.getElementById("financeMenuGroup");
const userRows = document.getElementById("userRows");
const branchRows = document.getElementById("branchRows");
const clientManagementRows = document.getElementById("clientManagementRows");
const clientManagementMeta = document.getElementById("clientManagementMeta");
const clientDuplicateRows = document.getElementById("clientDuplicateRows");
const clientDuplicateMeta = document.getElementById("clientDuplicateMeta");
const clientDetailMeta = document.getElementById("clientDetailMeta");
const clientDetailSummary = document.getElementById("clientDetailSummary");
const clientDetailDocumentsMeta = document.getElementById("clientDetailDocumentsMeta");
const clientDetailPhotoLink = document.getElementById("clientDetailPhotoLink");
const clientDetailIdDocumentLink = document.getElementById("clientDetailIdDocumentLink");
const clientHistoryLoanRows = document.getElementById("clientHistoryLoanRows");
const clientDocumentMeta = document.getElementById("clientDocumentMeta");
const pendingApprovalRows = document.getElementById("pendingApprovalRows");
const pendingApprovalMeta = document.getElementById("pendingApprovalMeta");
const loanStatementSummary = document.getElementById("loanStatementSummary");
const loanStatementRows = document.getElementById("loanStatementRows");
const loanLifecycleMeta = document.getElementById("loanLifecycleMeta");
const loanCollateralRows = document.getElementById("loanCollateralRows");
const loanGuarantorRows = document.getElementById("loanGuarantorRows");
const loanProductRows = document.getElementById("loanProductRows");
const loanProductMeta = document.getElementById("loanProductMeta");
const glAccountsRows = document.getElementById("glAccountsRows");
const glTrialRows = document.getElementById("glTrialRows");
const glTrialMeta = document.getElementById("glTrialMeta");
const glTrialSummary = document.getElementById("glTrialSummary");
const glIncomeMeta = document.getElementById("glIncomeMeta");
const glIncomeSummary = document.getElementById("glIncomeSummary");
const glCashMeta = document.getElementById("glCashMeta");
const glCashSummary = document.getElementById("glCashSummary");
const glCashRows = document.getElementById("glCashRows");
const glStatementMeta = document.getElementById("glStatementMeta");
const glStatementSummary = document.getElementById("glStatementSummary");
const glStatementRows = document.getElementById("glStatementRows");
const auditTrailRows = document.getElementById("auditTrailRows");
const auditTrailMeta = document.getElementById("auditTrailMeta");
const auditTrailPageMeta = document.getElementById("auditTrailPageMeta");
const hierarchyEventRows = document.getElementById("hierarchyEventRows");
const hierarchyEventsMeta = document.getElementById("hierarchyEventsMeta");
const hierarchyEventsPageMeta = document.getElementById("hierarchyEventsPageMeta");
const systemPanelCard = document.getElementById("systemPanelCard");
const systemConfigStatusOutput = document.getElementById("systemConfigStatusOutput");
const systemMetricsOutput = document.getElementById("systemMetricsOutput");
const systemBackupMeta = document.getElementById("systemBackupMeta");
const systemBackupSummary = document.getElementById("systemBackupSummary");
const menuButtons = Array.from(document.querySelectorAll(".menu-btn"));
const menuSections = Array.from(document.querySelectorAll(".menu-section"));

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const resetRequestForm = document.getElementById("resetRequestForm");
const clientForm = document.getElementById("clientForm");
const loanForm = document.getElementById("loanForm");
const repaymentForm = document.getElementById("repaymentForm");
const scheduleForm = document.getElementById("scheduleForm");
const loanSearchForm = document.getElementById("loanSearchForm");
const collectionActionForm = document.getElementById("collectionActionForm");
const changePasswordForm = document.getElementById("changePasswordForm");
const resetConfirmForm = document.getElementById("resetConfirmForm");
const adminCreateUserForm = document.getElementById("adminCreateUserForm");
const clientManagementForm = document.getElementById("clientManagementForm");
const clientDuplicateForm = document.getElementById("clientDuplicateForm");
const clientEditForm = document.getElementById("clientEditForm");
const clientKycForm = document.getElementById("clientKycForm");
const clientDocumentUploadForm = document.getElementById("clientDocumentUploadForm");
const pendingApprovalForm = document.getElementById("pendingApprovalForm");
const loanLifecycleForm = document.getElementById("loanLifecycleForm");
const loanProductForm = document.getElementById("loanProductForm");
const auditTrailForm = document.getElementById("auditTrailForm");
const hierarchyEventsForm = document.getElementById("hierarchyEventsForm");
const adminRoleSelect = document.getElementById("adminUserRole");
const adminUserRoleHint = document.getElementById("adminUserRoleHint");
const adminBranchField = document.getElementById("adminBranchField");
const adminAreaBranchIdsField = document.getElementById("adminAreaBranchIdsField");
const adminAreaBranchCountField = document.getElementById("adminAreaBranchCountField");
const adminPrimaryRegionField = document.getElementById("adminPrimaryRegionField");
const branchForm = document.getElementById("branchForm");
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const refreshBranchesBtn = document.getElementById("refreshBranchesBtn");
const refreshOverdueBtn = document.getElementById("refreshOverdueBtn");
const refreshCollectionActionsBtn = document.getElementById("refreshCollectionActionsBtn");
const refreshGlAccountsBtn = document.getElementById("refreshGlAccountsBtn");
const refreshPendingApprovalBtn = document.getElementById("refreshPendingApprovalBtn");
const loadLoanStatementBtn = document.getElementById("loadLoanStatementBtn");
const downloadLoanStatementBtn = document.getElementById("downloadLoanStatementBtn");
const loadLoanCollateralBtn = document.getElementById("loadLoanCollateralBtn");
const refreshLoanProductsBtn = document.getElementById("refreshLoanProductsBtn");
const reportsHub = document.getElementById("reportsHub");
const loanSearchResetBtn = document.getElementById("loanSearchResetBtn");
const clientManagementResetBtn = document.getElementById("clientManagementResetBtn");
const clientDuplicateResetBtn = document.getElementById("clientDuplicateResetBtn");
const clientEditResetBtn = document.getElementById("clientEditResetBtn");
const pendingApprovalResetBtn = document.getElementById("pendingApprovalResetBtn");
const glTrialBalanceForm = document.getElementById("glTrialBalanceForm");
const glTrialResetBtn = document.getElementById("glTrialResetBtn");
const glIncomeStatementForm = document.getElementById("glIncomeStatementForm");
const glIncomeResetBtn = document.getElementById("glIncomeResetBtn");
const glCashFlowForm = document.getElementById("glCashFlowForm");
const glCashResetBtn = document.getElementById("glCashResetBtn");
const glAccountStatementForm = document.getElementById("glAccountStatementForm");
const glStatementResetBtn = document.getElementById("glStatementResetBtn");
const logoutBtn = document.getElementById("logoutBtn");
const auditTrailResetBtn = document.getElementById("auditTrailResetBtn");
const auditTrailPrevBtn = document.getElementById("auditTrailPrevBtn");
const auditTrailNextBtn = document.getElementById("auditTrailNextBtn");
const hierarchyEventsResetBtn = document.getElementById("hierarchyEventsResetBtn");
const hierarchyEventsPrevBtn = document.getElementById("hierarchyEventsPrevBtn");
const hierarchyEventsNextBtn = document.getElementById("hierarchyEventsNextBtn");
const systemConfigRefreshBtn = document.getElementById("systemConfigRefreshBtn");
const systemMetricsRefreshBtn = document.getElementById("systemMetricsRefreshBtn");
const systemBackupBtn = document.getElementById("systemBackupBtn");
const dataRefreshMeta = document.getElementById("dataRefreshMeta");
const dashboardMenu = document.getElementById("dashboardMenu");
const dashboardMain = document.getElementById("dashboardMain");
const mobileMenuToggleBtn = document.getElementById("mobileMenuToggleBtn");
const mobileMenuOverlay = document.getElementById("mobileMenuOverlay");
const mobileBottomNav = document.getElementById("mobileBottomNav");
const mobileNavButtons = Array.from(document.querySelectorAll(".mobile-nav-btn"));
const appLiveRegion = document.getElementById("appLiveRegion");

const currencyFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-KE", {
  maximumFractionDigits: 2,
});

let authToken = "";
let currentUser = null;
let roleCatalogByKey = new Map();
let lastCreatedClientId = null;
let lastCreatedLoanId = null;
let portfolioKpiFilters = { dateFrom: null, dateTo: null };
let clientTrendFilters = { dateFrom: null, dateTo: null };
let officerPerformanceFilters = { dateFrom: null, dateTo: null };
let overdueAlertsFilters = { dateFrom: null, dateTo: null, minDaysOverdue: 15 };
const lastLoginEmailStorageKey = "afriserve.lastLoginEmail";
const loanStatusValues = ["active", "closed", "written_off", "restructured", "pending_approval", "rejected"];
const loanOfficerRoleHintFallback = "Client onboarding, loan origination, and collections for this branch.";
const operationsManagerRoleHintFallback =
  "Branch operations leadership for onboarding, lending workflows, and collections execution for this branch.";
const areaManagerRoleHintFallback =
  "Regional oversight of assigned branches for portfolio quality and collection activity in this area.";
const defaultReportWindowDays = 30;
const defaultOverdueAlertsMinDays = 15;
const overviewAutoRefreshMs = 60_000;
const officerPerformanceViewRoles = new Set(["admin", "ceo", "finance", "operations_manager", "area_manager"]);
const financeViewRoles = new Set(["admin", "ceo", "finance"]);
const checkerRoles = new Set(["admin", "operations_manager"]);
const writeOffRoles = new Set(["admin", "finance"]);
const restructureRoles = new Set(["admin", "finance", "operations_manager"]);
const archiveRoles = new Set(["admin", "finance", "operations_manager"]);
const branchScopedUserRoles = new Set(["operations_manager", "loan_officer"]);
const hqTaggedRoles = new Set(["admin", "ceo", "finance", "it"]);
const adminWorkspaceRoles = new Set(["admin", "ceo", "operations_manager"]);
const reportHubAllowedRoles = [
  "admin",
  "ceo",
  "finance",
  "it",
  "operations_manager",
  "area_manager",
  "loan_officer",
  "cashier",
];
const reportsHubConfigs = [
  {
    endpoint: "/api/reports/disbursements",
    title: "Disbursment",
    description: "Legacy disbursment export with the exact field layout used in operations.",
    allowedRoles: reportHubAllowedRoles,
  },
  {
    endpoint: "/api/reports/arrears",
    title: "Arrears",
    description: "Legacy arrears export with borrower, balance, and maturity detail.",
    allowedRoles: reportHubAllowedRoles,
  },
  {
    endpoint: "/api/reports/dues",
    title: "Loans Due",
    description: "Legacy loans-due export with installment-level due, arrears, and officer detail.",
  },
  {
    endpoint: "/api/reports/clients",
    title: "Clients",
    description: "Active clients, borrowers, and first-time vs repeat mix.",
  },
  {
    endpoint: "/api/reports/aging",
    title: "Portfolio Aging",
    description: "Aging bucket analysis of overdue loans and balances.",
  },
  {
    endpoint: "/api/reports/income-statement",
    title: "Income Statement",
    description: "Revenue, fees, write-off expense, and net operating position.",
  },
  {
    endpoint: "/api/reports/write-offs",
    title: "Write-offs",
    description: "Write-off totals and detailed write-off journal entries.",
  },
  {
    endpoint: "/api/reports/daily-collections",
    title: "Daily Collections",
    description: "Daily repayment activity and collected amounts over time.",
  },
  {
    endpoint: "/api/reports/collections",
    title: "Collections",
    description: "Collections summary report with branch-level performance.",
  },
];
const reportExportFormats = ["csv", "pdf", "xlsx"];
const defaultAutoLoadReportEndpoints = ["/api/reports/disbursements", "/api/reports/arrears"];
const reportSummaryLabelMap = {
  summary: "Summary",
  duesInPeriod: "Dues In Period",
  alreadyOverdueBeforePeriod: "Already Overdue Before Period",
  period: "Period",
  reportRows: "Report",
};
const exactReportColumnLabels = new Set([
  "LoanId",
  "FullNames",
  "PhoneNumber",
  "InstallmentNo",
  "AMOUNT DISBURSED",
  "Amount Due",
  "Arrears",
  "AmountPaid",
  "LoanAmount",
  "LoanBalance",
  "Product Name",
  "UnitTitle",
  "FieldOfficer",
  "Due Date",
  "BorowerId",
  "AmountDisbursed",
  "Interest",
  "Arrears Amount",
  "DaysInArrears",
  "ProductName",
  "Maturity",
  "Branch",
  "Expected Clear Date",
  "Borrowdate",
  "BusinessLocation",
  "DaysToNpl",
  "GurantorNames",
  "GurantorPhone",
  "ProductName1",
  "SalesRep",
  "AccountNo",
  "MpesaRef",
  "OLB",
  "Amount Disbursed",
  "Borrow Date",
  "Loantype",
  "Product",
  "Clear Date",
]);

let reportHubBranchOptions = [];
let selectedClientId = null;
let selectedClientSnapshot = null;
let glAccountCatalog = [];
let selectedLifecycleLoanId = null;
let lastOverviewRefreshAt = null;
let overviewAutoRefreshTimerId = null;
let overviewRefreshTickerTimerId = null;
let isOverviewRefreshInFlight = false;
let tableCardObserver = null;
let isMobileMenuOpen = false;
let auditTrailFilters = {
  action: "",
  userId: null,
  targetType: "",
  targetId: null,
  dateFrom: null,
  dateTo: null,
  limit: 20,
  offset: 0,
  sortBy: "id",
  sortOrder: "desc",
};
let hierarchyEventFilters = {
  eventType: "",
  scopeLevel: "",
  regionId: null,
  branchId: null,
  actorUserId: null,
  dateFrom: null,
  dateTo: null,
  limit: 20,
  offset: 0,
  sortBy: "id",
  sortOrder: "desc",
};

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
  const numeric = parseNumber(value);
  if (numeric === null) {
    return String(value ?? "-");
  }
  return numberFormatter.format(numeric);
}

function formatCurrency(value) {
  const numeric = parseNumber(value);
  if (numeric === null) {
    return String(value ?? "-");
  }
  return currencyFormatter.format(numeric);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function formatPercent(value, options = {}) {
  const numeric = parseNumber(value);
  if (numeric === null) {
    return String(options.fallback ?? "-");
  }

  const minimumFractionDigits = Number.isInteger(options.minimumFractionDigits)
    ? options.minimumFractionDigits
    : 1;
  const maximumFractionDigits = Number.isInteger(options.maximumFractionDigits)
    ? options.maximumFractionDigits
    : 1;

  return `${(numeric * 100).toLocaleString("en-KE", { minimumFractionDigits, maximumFractionDigits })}%`;
}

function toDateInputValue(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const parsed = new Date(`${text}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function createDefaultReportDateRange(days = defaultReportWindowDays) {
  const normalizedDays = Number.isInteger(days) && days > 0 ? days : defaultReportWindowDays;
  const dateTo = new Date();
  dateTo.setHours(0, 0, 0, 0);
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateTo.getDate() - (normalizedDays - 1));
  return {
    dateFrom: toDateInputValue(dateFrom),
    dateTo: toDateInputValue(dateTo),
  };
}

function setDateRangeInputs(dateFromInput, dateToInput, range) {
  if (dateFromInput) {
    dateFromInput.value = String(range?.dateFrom || "");
  }
  if (dateToInput) {
    dateToInput.value = String(range?.dateTo || "");
  }
}

function formatDateRangeLabel(range) {
  const dateFrom = String(range?.dateFrom || "").trim();
  const dateTo = String(range?.dateTo || "").trim();
  if (!dateFrom && !dateTo) {
    return "all dates";
  }
  return `${dateFrom || "start"} to ${dateTo || "today"}`;
}

function formatDateTickLabel(value) {
  const parsed = parseDateInputValue(value);
  if (!parsed) {
    return String(value || "-");
  }
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function readDateRangeFilters(dateFromInput, dateToInput) {
  const dateFrom = String(dateFromInput?.value || "").trim();
  const dateTo = String(dateToInput?.value || "").trim();

  if (dateFrom && !parseDateInputValue(dateFrom)) {
    throwFieldValidationError(dateFromInput, "Choose a valid start date");
  }
  if (dateTo && !parseDateInputValue(dateTo)) {
    throwFieldValidationError(dateToInput, "Choose a valid end date");
  }
  if (dateFrom && dateTo && new Date(`${dateFrom}T00:00:00`) > new Date(`${dateTo}T00:00:00`)) {
    throwFieldValidationError(dateToInput, "End date must be on or after start date");
  }

  return {
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  };
}

function normalizeDateRangeFilters(range, dateFromInput, dateToInput) {
  const defaults = createDefaultReportDateRange();
  const normalized = {
    dateFrom: String(range?.dateFrom || "").trim() || defaults.dateFrom,
    dateTo: String(range?.dateTo || "").trim() || defaults.dateTo,
  };
  setDateRangeInputs(dateFromInput, dateToInput, normalized);
  return normalized;
}

function appendDateRangeQuery(query, filters = {}) {
  if (filters?.dateFrom) {
    query.set("dateFrom", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query.set("dateTo", filters.dateTo);
  }
}

function renderMiniChartFallback(container, message) {
  if (!container) {
    return;
  }

  clearElement(container);
  const emptyMessage = document.createElement("p");
  emptyMessage.className = "mini-chart-empty";
  emptyMessage.textContent = message;
  container.appendChild(emptyMessage);
}

function renderMiniBarChart(container, rows, { valueFormatter = formatNumber, emptyMessage = "No data available." } = {}) {
  if (!container) {
    return;
  }

  clearElement(container);
  const normalizedRows = Array.isArray(rows)
    ? rows
      .map((row) => ({
        label: String(row?.label || "").trim(),
        value: Number(row?.value || 0),
        tone: String(row?.tone || "").trim(),
      }))
      .filter((row) => row.label)
    : [];

  if (normalizedRows.length === 0) {
    renderMiniChartFallback(container, emptyMessage);
    return;
  }

  const maxValue = normalizedRows.reduce((max, row) => Math.max(max, row.value), 0) || 1;
  const list = document.createElement("ol");
  list.className = "mini-bar-list";

  normalizedRows.forEach((row) => {
    const item = document.createElement("li");
    item.className = "mini-bar-item";

    const rowWrap = document.createElement("div");
    rowWrap.className = "mini-bar-row";

    const label = document.createElement("span");
    label.className = "mini-bar-label";
    label.textContent = row.label;

    const track = document.createElement("span");
    track.className = "mini-bar-track";

    const fill = document.createElement("span");
    fill.className = `mini-bar-fill${row.tone ? ` ${row.tone}` : ""}`;
    if (row.value > 0) {
      fill.style.width = `${Math.max((row.value / maxValue) * 100, 3)}%`;
    } else {
      fill.style.width = "0%";
    }

    track.appendChild(fill);

    const value = document.createElement("span");
    value.className = "mini-bar-value";
    value.textContent = valueFormatter(row.value);

    rowWrap.appendChild(label);
    rowWrap.appendChild(track);
    rowWrap.appendChild(value);
    item.appendChild(rowWrap);
    list.appendChild(item);
  });

  container.appendChild(list);
}

function createLegendItem(swatchClassName, labelText) {
  const item = document.createElement("span");
  item.className = "client-trend-legend-item";

  const swatch = document.createElement("span");
  swatch.className = `client-trend-legend-swatch ${swatchClassName}`;

  const label = document.createElement("span");
  label.textContent = labelText;

  item.appendChild(swatch);
  item.appendChild(label);
  return item;
}

function renderClientTrendChart(container, buckets) {
  if (!container) {
    return;
  }

  clearElement(container);
  if (!Array.isArray(buckets) || buckets.length === 0) {
    renderMiniChartFallback(container, "No client trend data for the selected period.");
    return;
  }

  const maxValue = Math.max(
    1,
    ...buckets.flatMap((bucket) => [Number(bucket.newClients || 0), Number(bucket.firstTimeBorrowers || 0)]),
  );

  const legend = document.createElement("div");
  legend.className = "client-trend-legend";
  legend.appendChild(createLegendItem("registrations", "New clients"));
  legend.appendChild(createLegendItem("first-time", "First-time borrowers"));

  const grid = document.createElement("div");
  grid.className = "client-trend-grid";

  buckets.forEach((bucket) => {
    const newClients = Number(bucket.newClients || 0);
    const firstTimeBorrowers = Number(bucket.firstTimeBorrowers || 0);

    const column = document.createElement("div");
    column.className = "client-trend-column";

    const bars = document.createElement("div");
    bars.className = "client-trend-bars";

    const newClientsBar = document.createElement("span");
    newClientsBar.className = "client-trend-bar registrations";
    newClientsBar.style.height = newClients > 0 ? `${Math.max((newClients / maxValue) * 100, 4)}%` : "0%";
    newClientsBar.title = `${bucket.label}: ${formatNumber(newClients)} new clients`;

    const firstTimeBar = document.createElement("span");
    firstTimeBar.className = "client-trend-bar first-time";
    firstTimeBar.style.height = firstTimeBorrowers > 0 ? `${Math.max((firstTimeBorrowers / maxValue) * 100, 4)}%` : "0%";
    firstTimeBar.title = `${bucket.label}: ${formatNumber(firstTimeBorrowers)} first-time borrowers`;

    bars.appendChild(newClientsBar);
    bars.appendChild(firstTimeBar);

    const label = document.createElement("span");
    label.className = "client-trend-label";
    label.textContent = bucket.label;

    const values = document.createElement("span");
    values.className = "client-trend-values";
    values.textContent = `${formatNumber(newClients)} / ${formatNumber(firstTimeBorrowers)}`;

    column.appendChild(bars);
    column.appendChild(label);
    column.appendChild(values);
    grid.appendChild(column);
  });

  container.appendChild(legend);
  container.appendChild(grid);
}

function buildDateBuckets(dateFrom, dateTo, maxBuckets = 8) {
  const start = parseDateInputValue(dateFrom);
  const end = parseDateInputValue(dateTo);
  if (!start || !end || start > end) {
    return [];
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;
  const bucketCount = Math.max(1, Math.min(maxBuckets, totalDays));
  const bucketSize = Math.max(1, Math.ceil(totalDays / bucketCount));
  const buckets = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = new Date(start);
    bucketStart.setDate(start.getDate() + (index * bucketSize));
    if (bucketStart > end) {
      break;
    }

    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + (bucketSize - 1));
    if (bucketEnd > end) {
      bucketEnd.setTime(end.getTime());
    }

    const bucketDateFrom = toDateInputValue(bucketStart);
    const bucketDateTo = toDateInputValue(bucketEnd);
    buckets.push({
      dateFrom: bucketDateFrom,
      dateTo: bucketDateTo,
      label: bucketDateFrom === bucketDateTo
        ? formatDateTickLabel(bucketDateFrom)
        : `${formatDateTickLabel(bucketDateFrom)}-${formatDateTickLabel(bucketDateTo)}`,
    });
  }

  return buckets;
}

function resolveOverdueSeverity(daysOverdue) {
  const days = Number(daysOverdue || 0);
  if (days >= 90) {
    return { label: "Critical", className: "critical" };
  }
  if (days >= 60) {
    return { label: "High", className: "high" };
  }
  if (days >= 30) {
    return { label: "Medium", className: "medium" };
  }
  return { label: "Low", className: "low" };
}

function renderOverdueAlertsTable(rows) {
  if (!overdueAlertsRows) {
    return;
  }

  clearElement(overdueAlertsRows);
  if (!rows || rows.length === 0) {
    renderEmptyRow(overdueAlertsRows, 7, "No overdue alerts for the selected filters.");
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("tr");
    const severity = resolveOverdueSeverity(item.days_overdue ?? 0);

    const severityCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `alert-badge ${severity.className}`;
    badge.textContent = severity.label;
    severityCell.appendChild(badge);

    row.appendChild(severityCell);
    row.appendChild(createCell("td", String(item.loan_id ?? "-")));
    row.appendChild(createCell("td", String(item.client_name || "-")));
    row.appendChild(createCell("td", formatNumber(item.days_overdue ?? 0)));
    row.appendChild(createCell("td", formatCurrency(item.overdue_amount ?? 0)));
    row.appendChild(createCell("td", formatNumber(item.overdue_installments ?? 0)));
    row.appendChild(createCell("td", formatNumber(item.open_collection_actions ?? 0)));
    overdueAlertsRows.appendChild(row);
  });
}

function getStoredLastLoginEmail() {
  try {
    const storedValue = window.localStorage.getItem(lastLoginEmailStorageKey);
    return String(storedValue || "").trim();
  } catch (_error) {
    return "";
  }
}

function storeLastLoginEmail(email) {
  try {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }
    window.localStorage.setItem(lastLoginEmailStorageKey, normalizedEmail);
  } catch (_error) {
    // Ignore browser storage errors so login flows are not blocked.
  }
}

function appendMetric(listElement, label, value) {
  const item = document.createElement("li");
  const labelNode = document.createElement("span");
  labelNode.className = "metric-label";
  labelNode.textContent = label;
  const valueNode = document.createElement("span");
  valueNode.className = "metric-value";
  valueNode.textContent = value;
  item.appendChild(labelNode);
  item.appendChild(valueNode);
  listElement.appendChild(item);
}

function getCurrentRoleKey() {
  return String(currentUser?.role || "").trim().toLowerCase();
}

function canViewAdminWorkspace(user = currentUser) {
  const role = String(user?.role || "").trim().toLowerCase();
  return adminWorkspaceRoles.has(role);
}

function canViewSystemPanel(user = currentUser) {
  return String(user?.role || "").trim().toLowerCase() === "admin";
}

function canUseAdminAuditEndpoint(user = currentUser) {
  return String(user?.role || "").trim().toLowerCase() === "admin";
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 1080px)").matches;
}

function getFocusableElements(container) {
  if (!container) {
    return [];
  }
  return Array.from(
    container.querySelectorAll(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => !element.disabled && element.offsetParent !== null);
}

function setMobileMenuOpen(open, { focusMenu = false } = {}) {
  isMobileMenuOpen = Boolean(open) && isMobileViewport();
  dashboard?.classList.toggle("mobile-menu-open", isMobileMenuOpen);
  document.body.classList.toggle("mobile-menu-lock", isMobileMenuOpen);
  mobileMenuOverlay?.classList.toggle("hidden", !isMobileMenuOpen);
  dashboardMenu?.setAttribute("aria-hidden", isMobileMenuOpen ? "false" : "true");
  mobileBottomNav?.setAttribute("aria-hidden", isMobileMenuOpen ? "true" : "false");

  if (mobileMenuToggleBtn) {
    mobileMenuToggleBtn.setAttribute("aria-expanded", isMobileMenuOpen ? "true" : "false");
    mobileMenuToggleBtn.setAttribute("aria-label", isMobileMenuOpen ? "Close workspace menu" : "Open workspace menu");
  }

  if (focusMenu && isMobileMenuOpen) {
    const focusables = getFocusableElements(dashboardMenu);
    (focusables[0] || dashboardMenu)?.focus();
  }
}

function closeMobileMenu() {
  if (!isMobileMenuOpen) {
    return;
  }
  setMobileMenuOpen(false);
  mobileMenuToggleBtn?.focus();
}

function applyMenuCategory(category) {
  const canViewAdmin = canViewAdminWorkspace(currentUser);
  const isFinanceUser = financeViewRoles.has(String(currentUser?.role || "").trim().toLowerCase());

  menuButtons.forEach((button) => {
    if (button.dataset.category === "admin" && !canViewAdmin) {
      button.classList.remove("active");
      return;
    }
    if (button.dataset.category === "finance" && !isFinanceUser) {
      button.classList.remove("active");
      button.removeAttribute("aria-current");
      return;
    }
    const isActive = button.dataset.category === category;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  mobileNavButtons.forEach((button) => {
    const buttonCategory = String(button.dataset.category || "").trim();
    const isCategoryVisible = !(buttonCategory === "admin" && !canViewAdmin)
      && !(buttonCategory === "finance" && !isFinanceUser);
    const isActive = buttonCategory === category;
    button.classList.toggle("active", isActive);
    button.classList.toggle("hidden", !isCategoryVisible);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  menuSections.forEach((section) => {
    const sectionCategory = section.dataset.category;
    const requiresAdmin = sectionCategory === "admin";
    const requiresFinance = sectionCategory === "finance";
    const matchesCategory = category === "all" || sectionCategory === category;
    const isVisible = matchesCategory && (!requiresAdmin || canViewAdmin) && (!requiresFinance || isFinanceUser);
    section.classList.toggle("hidden", !isVisible);
  });

  applyResponsiveTableLabels();

  if (isMobileMenuOpen) {
    closeMobileMenu();
  }
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const message = data?.message || "Request failed";
    throw new Error(message);
  }

  return data;
}

function setMessage(target, message, isError = false) {
  if (!target) {
    return;
  }
  target.textContent = isError ? `Error: ${message}` : `Success: ${message}`;
  target.style.color = isError ? "#b91c1c" : "#0f766e";
  announceToScreenReader(target.textContent);
}

function clearMessage(target) {
  if (!target) {
    return;
  }
  target.textContent = "";
}

function announceToScreenReader(message) {
  if (!appLiveRegion) {
    return;
  }
  appLiveRegion.textContent = "";
  window.setTimeout(() => {
    appLiveRegion.textContent = String(message || "").trim();
  }, 20);
}

function clearElement(element) {
  if (!element) {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function applyResponsiveTableLabels() {
  const tables = Array.from(document.querySelectorAll(".table-wrap table"));
  tables.forEach((table) => {
    const headers = Array.from(table.querySelectorAll("thead th")).map((header) =>
      String(header.textContent || "").replace(/[↑↓↕]/g, "").trim() || "Value",
    );

    table.querySelectorAll("tbody tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      cells.forEach((cell, index) => {
        if (!cell.hasAttribute("data-label")) {
          cell.setAttribute("data-label", headers[index] || "Value");
        }
      });
    });
  });
}

function updateOverviewRefreshMeta() {
  if (!dataRefreshMeta) {
    return;
  }

  if (!lastOverviewRefreshAt) {
    dataRefreshMeta.textContent = "Last updated: not yet";
    return;
  }

  const elapsedSeconds = Math.max(Math.floor((Date.now() - lastOverviewRefreshAt.getTime()) / 1000), 0);
  dataRefreshMeta.textContent = `Last updated ${formatNumber(elapsedSeconds)} second(s) ago · Auto-refresh every 60s`;
}

function markOverviewRefreshedNow() {
  lastOverviewRefreshAt = new Date();
  updateOverviewRefreshMeta();
}

function stopOverviewAutoRefresh() {
  if (overviewAutoRefreshTimerId) {
    window.clearInterval(overviewAutoRefreshTimerId);
    overviewAutoRefreshTimerId = null;
  }
  if (overviewRefreshTickerTimerId) {
    window.clearInterval(overviewRefreshTickerTimerId);
    overviewRefreshTickerTimerId = null;
  }
}

function createCell(tag, text) {
  const cell = document.createElement(tag);
  cell.textContent = text;
  return cell;
}

function renderEmptyRow(tbody, columnCount, message) {
  clearElement(tbody);
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.textContent = message;
  cell.className = "muted";
  row.appendChild(cell);
  tbody.appendChild(row);
}

function formatReportSectionLabel(key) {
  const mappedLabel = reportSummaryLabelMap[key];
  if (mappedLabel) {
    return mappedLabel;
  }
  if (exactReportColumnLabels.has(String(key || ""))) {
    return String(key || "");
  }
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (value) => value.toUpperCase())
    .trim();
}

function normalizeReportValue(value) {
  if (value === null || typeof value === "undefined") {
    return "-";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? formatNumber(value) : numberFormatter.format(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  const text = String(value).trim();
  return text || "-";
}

function createReportTable(columns, rows, emptyMessage = "No rows available.") {
  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    headRow.appendChild(createCell("th", formatReportSectionLabel(column)));
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  if (!rows || rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = Math.max(columns.length, 1);
    cell.className = "muted";
    cell.textContent = emptyMessage;
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    rows.forEach((rowData) => {
      const row = document.createElement("tr");
      columns.forEach((column) => {
        row.appendChild(createCell("td", normalizeReportValue(rowData?.[column])));
      });
      tbody.appendChild(row);
    });
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  return tableWrap;
}

function renderReportPayload(resultContainer, payload) {
  if (!resultContainer) {
    return;
  }

  clearElement(resultContainer);

  if (!payload || typeof payload !== "object") {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No report payload available.";
    resultContainer.appendChild(empty);
    return;
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No report rows available for the selected filters.";
    resultContainer.appendChild(empty);
    return;
  }

  entries.forEach(([sectionKey, sectionValue]) => {
    const section = document.createElement("section");
    section.className = "report-output-section";

    const title = document.createElement("h5");
    title.textContent = formatReportSectionLabel(sectionKey);
    section.appendChild(title);

    if (Array.isArray(sectionValue)) {
      const normalizedRows = sectionValue.filter((row) => row && typeof row === "object");
      const columns = normalizedRows.length > 0
        ? Array.from(
          normalizedRows.reduce((set, row) => {
            Object.keys(row).forEach((key) => set.add(key));
            return set;
          }, new Set()),
        )
        : [];

      if (columns.length > 0) {
        section.appendChild(createReportTable(columns, normalizedRows));
      } else {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "No rows available.";
        section.appendChild(empty);
      }
      resultContainer.appendChild(section);
      return;
    }

    if (sectionValue && typeof sectionValue === "object") {
      const rowObject = { ...sectionValue };
      const columns = Object.keys(rowObject);
      if (columns.length > 0) {
        section.appendChild(createReportTable(columns, [rowObject], "No summary values available."));
      } else {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "No summary values available.";
        section.appendChild(empty);
      }
      resultContainer.appendChild(section);
      return;
    }

    section.appendChild(createReportTable(["value"], [{ value: sectionValue }], "No values available."));
    resultContainer.appendChild(section);
  });
}

function buildReportQueryParams({ dateFrom, dateTo, branchId, format } = {}) {
  const query = new URLSearchParams();
  if (dateFrom) {
    query.set("dateFrom", dateFrom);
  }
  if (dateTo) {
    query.set("dateTo", dateTo);
  }
  if (branchId) {
    query.set("branchId", String(branchId));
  }
  if (format) {
    query.set("format", String(format).toLowerCase());
  }
  return query;
}

function getAuthHeaders() {
  const headers = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

function extractFilenameFromDisposition(contentDisposition, fallbackName) {
  const normalized = String(contentDisposition || "");
  if (!normalized) {
    return fallbackName;
  }

  const utf8Match = normalized.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).replace(/(^[\"'])|([\"']$)/g, "");
    } catch (_error) {
      return utf8Match[1].replace(/(^[\"'])|([\"']$)/g, "");
    }
  }

  const standardMatch = normalized.match(/filename=([^;]+)/i);
  if (standardMatch?.[1]) {
    return standardMatch[1].trim().replace(/(^[\"'])|([\"']$)/g, "");
  }
  return fallbackName;
}

function populateReportsHubBranchSelectors() {
  if (!reportsHub) {
    populateGlBranchSelectors();
    return;
  }

  const selectors = reportsHub.querySelectorAll("select[data-field='branchId']");
  selectors.forEach((select) => {
    const previous = String(select.value || "").trim();
    setSelectOptions(select, reportHubBranchOptions, "All branches");
    if (previous) {
      const exists = reportHubBranchOptions.some((option) => String(option.value) === previous);
      if (exists) {
        select.value = previous;
      }
    }
  });

  populateGlBranchSelectors();
}

async function loadReportsHubBranchOptions() {
  try {
    const branchesResult = await api("/api/branches?limit=500&sortBy=name&sortOrder=asc");
    const branches = Array.isArray(branchesResult?.data) ? branchesResult.data : [];
    reportHubBranchOptions = branches.map((branch) => ({
      value: branch.id,
      label: `${branch.code || `#${branch.id}`} - ${branch.name || "Unnamed"}`,
    }));
  } catch (_error) {
    reportHubBranchOptions = [];
  }

  populateReportsHubBranchSelectors();
}

function readSingleReportFilters(formElement) {
  const dateFromInput = formElement.querySelector("input[data-field='dateFrom']");
  const dateToInput = formElement.querySelector("input[data-field='dateTo']");
  const branchInput = formElement.querySelector("select[data-field='branchId']");

  const range = readDateRangeFilters(dateFromInput, dateToInput);
  const normalizedRange = normalizeDateRangeFilters(range, dateFromInput, dateToInput);
  const branchRaw = String(branchInput?.value || "").trim();
  const branchId = branchRaw ? Number(branchRaw) : null;
  if (branchRaw && (!Number.isInteger(branchId) || branchId <= 0)) {
    throwFieldValidationError(branchInput, "Choose a valid branch");
  }

  return {
    dateFrom: normalizedRange.dateFrom,
    dateTo: normalizedRange.dateTo,
    branchId,
  };
}

async function runSingleReport(config, cardElement, { showSuccessMessage = true } = {}) {
  const formElement = cardElement.querySelector("form[data-report-endpoint]");
  const resultsElement = cardElement.querySelector(".report-card-results");
  const metaElement = cardElement.querySelector(".report-card-meta");

  const filters = readSingleReportFilters(formElement);
  const query = buildReportQueryParams(filters).toString();
  const url = `${config.endpoint}${query ? `?${query}` : ""}`;
  const payload = await api(url);

  renderReportPayload(resultsElement, payload);
  if (metaElement) {
    metaElement.textContent = `Loaded for ${formatDateRangeLabel(filters)}${filters.branchId ? `, branch #${filters.branchId}` : ""}.`;
  }
  if (showSuccessMessage) {
    setMessage(dashboardMessage, `${config.title} report loaded`);
  }
}

async function downloadSingleReport(config, cardElement, format) {
  const normalizedFormat = String(format || "").trim().toLowerCase();
  if (!reportExportFormats.includes(normalizedFormat)) {
    throw new Error("Unsupported export format");
  }

  const formElement = cardElement.querySelector("form[data-report-endpoint]");
  const filters = readSingleReportFilters(formElement);
  const query = buildReportQueryParams({ ...filters, format: normalizedFormat }).toString();
  const url = `${config.endpoint}${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    let message = "Export failed";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      message = payload?.message || message;
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const fallbackName = `${config.title.toLowerCase().replace(/\s+/g, "-")}-report.${normalizedFormat}`;
  const filename = extractFilenameFromDisposition(response.headers.get("content-disposition"), fallbackName);

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);

  setMessage(dashboardMessage, `${config.title} exported as ${normalizedFormat.toUpperCase()}`);
}

function resetReportsHubState(signedIn = false) {
  if (!reportsHub) {
    return;
  }

  const defaults = createDefaultReportDateRange();
  const forms = reportsHub.querySelectorAll("form[data-report-endpoint]");
  forms.forEach((formElement) => {
    const dateFromInput = formElement.querySelector("input[data-field='dateFrom']");
    const dateToInput = formElement.querySelector("input[data-field='dateTo']");
    const branchInput = formElement.querySelector("select[data-field='branchId']");
    setDateRangeInputs(dateFromInput, dateToInput, defaults);
    if (branchInput) {
      branchInput.value = "";
    }
  });

  const resultsContainers = reportsHub.querySelectorAll(".report-card-results");
  resultsContainers.forEach((container) => {
    clearElement(container);
    const placeholder = document.createElement("p");
    placeholder.className = "muted";
    placeholder.textContent = signedIn
      ? "Apply filters and click Load Report to view results."
      : "Sign in to view report data.";
    container.appendChild(placeholder);
  });

  const metaElements = reportsHub.querySelectorAll(".report-card-meta");
  metaElements.forEach((metaElement) => {
    metaElement.textContent = signedIn ? "Not loaded yet." : "Sign in required.";
  });

  applyReportsHubAccessState({ signedIn });
}

function createReportCardElement(config) {
  const card = document.createElement("article");
  card.className = "card report-card";

  const title = document.createElement("h4");
  title.textContent = config.title;

  const description = document.createElement("p");
  description.className = "muted";
  description.textContent = config.description;

  const form = document.createElement("form");
  form.className = "form-grid report-filter-grid report-card-form";
  form.dataset.reportEndpoint = config.endpoint;

  const dateFromLabel = document.createElement("label");
  dateFromLabel.textContent = "Date From";
  const dateFromInput = document.createElement("input");
  dateFromInput.type = "date";
  dateFromInput.dataset.field = "dateFrom";
  dateFromLabel.appendChild(dateFromInput);

  const dateToLabel = document.createElement("label");
  dateToLabel.textContent = "Date To";
  const dateToInput = document.createElement("input");
  dateToInput.type = "date";
  dateToInput.dataset.field = "dateTo";
  dateToLabel.appendChild(dateToInput);

  const branchLabel = document.createElement("label");
  branchLabel.textContent = "Branch";
  const branchSelect = document.createElement("select");
  branchSelect.dataset.field = "branchId";
  branchLabel.appendChild(branchSelect);

  const actions = document.createElement("div");
  actions.className = "inline-form report-card-actions";

  const loadButton = document.createElement("button");
  loadButton.type = "submit";
  loadButton.textContent = "Load Report";

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "secondary";
  resetButton.dataset.action = "report-reset";
  resetButton.textContent = "Reset";

  const downloads = document.createElement("div");
  downloads.className = "report-downloads";
  reportExportFormats.forEach((format) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.dataset.action = "report-export";
    button.dataset.exportFormat = format;
    button.textContent = `Download ${format.toUpperCase()}`;
    downloads.appendChild(button);
  });

  actions.appendChild(loadButton);
  actions.appendChild(resetButton);
  actions.appendChild(downloads);

  form.appendChild(dateFromLabel);
  form.appendChild(dateToLabel);
  form.appendChild(branchLabel);
  form.appendChild(actions);

  const meta = document.createElement("p");
  meta.className = "muted report-card-meta";
  meta.textContent = "Not loaded yet.";

  const results = document.createElement("div");
  results.className = "report-card-results";

  card.appendChild(title);
  card.appendChild(description);
  card.appendChild(form);
  card.appendChild(meta);
  card.appendChild(results);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(dashboardMessage);
    clearAllFieldErrors(form);
    setButtonBusy(loadButton, true, "Loading...");
    try {
      await runSingleReport(config, card);
    } catch (error) {
      setMessage(dashboardMessage, error.message, true);
    } finally {
      setButtonBusy(loadButton, false);
    }
  });

  resetButton.addEventListener("click", () => {
    clearMessage(dashboardMessage);
    clearAllFieldErrors(form);
    const defaults = createDefaultReportDateRange();
    setDateRangeInputs(dateFromInput, dateToInput, defaults);
    branchSelect.value = "";
    clearElement(results);
    const placeholder = document.createElement("p");
    placeholder.className = "muted";
    placeholder.textContent = "Apply filters and click Load Report to view results.";
    results.appendChild(placeholder);
    meta.textContent = "Not loaded yet.";
  });

  downloads.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action='report-export']");
    if (!button) {
      return;
    }

    clearMessage(dashboardMessage);
    clearAllFieldErrors(form);
    const exportFormat = String(button.dataset.exportFormat || "").trim().toLowerCase();
    setButtonBusy(button, true, "Preparing...");
    try {
      await downloadSingleReport(config, card, exportFormat);
    } catch (error) {
      setMessage(dashboardMessage, error.message, true);
    } finally {
      setButtonBusy(button, false);
    }
  });

  attachLiveValidationClear(form);
  return card;
}

function renderReportsHub() {
  if (!reportsHub) {
    return;
  }

  clearElement(reportsHub);
  reportsHubConfigs.forEach((config) => {
    const card = createReportCardElement(config);
    reportsHub.appendChild(card);
  });
  populateReportsHubBranchSelectors();
  resetReportsHubState(false);
}

function canUseReportForCurrentUser(config) {
  const role = String(currentUser?.role || "").trim().toLowerCase();
  const allowedRoles = Array.isArray(config?.allowedRoles)
    ? config.allowedRoles.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
    : [];

  if (!role) {
    return false;
  }
  if (allowedRoles.length === 0) {
    return true;
  }
  return allowedRoles.includes(role);
}

function applyReportsHubAccessState({ signedIn = Boolean(currentUser) } = {}) {
  if (!reportsHub) {
    return;
  }

  const cards = Array.from(reportsHub.querySelectorAll(".report-card"));
  cards.forEach((card) => {
    const form = card.querySelector("form[data-report-endpoint]");
    const endpoint = String(form?.dataset.reportEndpoint || "").trim();
    const config = reportsHubConfigs.find((item) => item.endpoint === endpoint);
    if (!config) {
      return;
    }

    const canUse = signedIn && canUseReportForCurrentUser(config);
    const hideForRole = signedIn && !canUse;
    card.classList.toggle("hidden", hideForRole);
    card.classList.toggle("report-card-locked", !hideForRole && !canUse);

    if (hideForRole) {
      return;
    }

    const controls = card.querySelectorAll("input, select, button");
    controls.forEach((control) => {
      control.disabled = !canUse;
    });

    const resultsElement = card.querySelector(".report-card-results");
    const metaElement = card.querySelector(".report-card-meta");
    if (!signedIn) {
      if (metaElement) {
        metaElement.textContent = "Sign in required.";
      }
      if (resultsElement) {
        clearElement(resultsElement);
        const placeholder = document.createElement("p");
        placeholder.className = "muted";
        placeholder.textContent = "Sign in to view report data.";
        resultsElement.appendChild(placeholder);
      }
      return;
    }

    if (!canUse) {
      const roleLabel = String(currentUser?.role || "unknown");
      if (metaElement) {
        metaElement.textContent = `Access restricted for role ${roleLabel}.`;
      }
      if (resultsElement) {
        clearElement(resultsElement);
        const placeholder = document.createElement("p");
        placeholder.className = "muted";
        placeholder.textContent = "You do not have access to this report.";
        resultsElement.appendChild(placeholder);
      }
      return;
    }

    if (metaElement && /^(Sign in required\.|Access restricted|Auto-load skipped)/.test(String(metaElement.textContent || ""))) {
      metaElement.textContent = "Not loaded yet.";
    }
  });
}

async function autoLoadReportsHubDefaults() {
  if (!reportsHub) {
    return;
  }

  const cards = Array.from(reportsHub.querySelectorAll(".report-card"));
  const targets = cards.filter((card) => {
    const form = card.querySelector("form[data-report-endpoint]");
    const endpoint = String(form?.dataset.reportEndpoint || "").trim();
    return defaultAutoLoadReportEndpoints.includes(endpoint);
  });

  if (targets.length === 0) {
    return;
  }

  await Promise.all(
    targets.map(async (card) => {
      const form = card.querySelector("form[data-report-endpoint]");
      const endpoint = String(form?.dataset.reportEndpoint || "").trim();
      const config = reportsHubConfigs.find((item) => item.endpoint === endpoint);
      if (!config) {
        return;
      }

      const metaElement = card.querySelector(".report-card-meta");
      if (!canUseReportForCurrentUser(config)) {
        if (metaElement) {
          metaElement.textContent = `Auto-load skipped for role ${String(currentUser?.role || "unknown")}.`;
        }
        return;
      }

      try {
        await runSingleReport(config, card, { showSuccessMessage: false });
      } catch (error) {
        if (metaElement) {
          metaElement.textContent = `Auto-load failed: ${error.message}`;
        }
      }
    }),
  );
}

function setButtonBusy(button, busy, busyText = "Loading...") {
  if (!button) {
    return;
  }

  if (busy) {
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent;
    }
    button.disabled = true;
    button.textContent = busyText;
    return;
  }

  button.disabled = false;
  if (button.dataset.defaultText) {
    button.textContent = button.dataset.defaultText;
  }
}

function clearFieldError(input) {
  if (!input) {
    return;
  }

  input.classList.remove("input-error");
  input.removeAttribute("aria-invalid");

  const describedBy = (input.getAttribute("aria-describedby") || "")
    .split(" ")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !value.endsWith("-error"));

  if (describedBy.length > 0) {
    input.setAttribute("aria-describedby", describedBy.join(" "));
  } else {
    input.removeAttribute("aria-describedby");
  }

  const hint = input.parentElement?.querySelector(".field-error");
  if (hint) {
    hint.remove();
  }
}

function setFieldError(input, message) {
  if (!input) {
    return;
  }

  clearFieldError(input);
  input.classList.add("input-error");
  input.setAttribute("aria-invalid", "true");

  const hint = document.createElement("small");
  hint.className = "field-error";
  hint.textContent = message;

  const baseFieldId = input.id || input.name;
  if (baseFieldId) {
    const errorId = `${baseFieldId}-error`;
    hint.id = errorId;
    input.setAttribute("aria-describedby", errorId);
  }

  hint.setAttribute("role", "alert");

  if (input.parentElement) {
    input.parentElement.appendChild(hint);
  }
}

function clearAllFieldErrors(form) {
  if (!form) {
    return;
  }

  const inputs = form.querySelectorAll("input, select, textarea");
  inputs.forEach((input) => clearFieldError(input));
}

function ensureFieldVisible(input) {
  if (!input || typeof input.scrollIntoView !== "function") {
    return;
  }

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  input.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
}

function throwFieldValidationError(input, message) {
  setFieldError(input, message);

  if (input && typeof input.focus === "function") {
    try {
      input.focus({ preventScroll: true });
    } catch (_error) {
      input.focus();
    }
  }

  ensureFieldVisible(input);

  const error = new Error(message);
  error.isFieldValidation = true;
  throw error;
}

function attachLiveValidationClear(form) {
  if (!form) {
    return;
  }

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (target && (target.matches("input") || target.matches("textarea") || target.matches("select"))) {
      clearFieldError(target);
    }
  });

  form.addEventListener("change", (event) => {
    const target = event.target;
    if (target && (target.matches("input") || target.matches("textarea") || target.matches("select"))) {
      clearFieldError(target);
    }
  });
}

function requireNonEmptyText(input, fieldLabel) {
  const value = String(input.value || "").trim();
  if (!value) {
    throwFieldValidationError(input, `${fieldLabel} is required`);
  }
  return value;
}

function requireStrongPassword(input, fieldLabel) {
  const value = requireNonEmptyText(input, fieldLabel);

  if (value.length < 8) {
    throwFieldValidationError(input, `${fieldLabel} must be at least 8 characters`);
  }
  if (!/[a-z]/.test(value)) {
    throwFieldValidationError(input, `${fieldLabel} must include a lowercase letter`);
  }
  if (!/[A-Z]/.test(value)) {
    throwFieldValidationError(input, `${fieldLabel} must include an uppercase letter`);
  }
  if (!/[0-9]/.test(value)) {
    throwFieldValidationError(input, `${fieldLabel} must include a number`);
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    throwFieldValidationError(input, `${fieldLabel} must include a special character`);
  }

  return value;
}

function requirePositiveNumber(input, fieldLabel) {
  const parsed = Number(input.value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throwFieldValidationError(input, `${fieldLabel} must be greater than 0`);
  }
  return parsed;
}

function requirePositiveInteger(input, fieldLabel) {
  const parsed = Number(input.value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throwFieldValidationError(input, `${fieldLabel} must be a positive whole number`);
  }
  return parsed;
}

function optionalPositiveInteger(input, fieldLabel) {
  if (!String(input.value || "").trim()) {
    return undefined;
  }
  return requirePositiveInteger(input, fieldLabel);
}

function parsePositiveIntegerList(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) {
    return [];
  }

  const ids = text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  return [...new Set(ids)];
}

function setSelectOptions(selectElement, options, placeholderLabel) {
  if (!selectElement) {
    return;
  }

  clearElement(selectElement);
  if (placeholderLabel) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = placeholderLabel;
    selectElement.appendChild(placeholder);
  }

  (options || []).forEach((option) => {
    const element = document.createElement("option");
    element.value = String(option.value);
    element.textContent = option.label;
    selectElement.appendChild(element);
  });
}

function setSelectValue(selectElement, value, fallbackLabel) {
  if (!selectElement) {
    return;
  }

  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return;
  }

  const hasOption = Array.from(selectElement.options || []).some((option) => option.value === normalizedValue);
  if (!hasOption) {
    const option = document.createElement("option");
    option.value = normalizedValue;
    option.textContent = fallbackLabel || normalizedValue;
    selectElement.appendChild(option);
  }

  selectElement.value = normalizedValue;
}

function formatClientSelectionLabel(client) {
  const clientId = Number(client?.id || 0);
  const fullName = String(client?.full_name || "").trim() || "Unnamed client";
  const phone = String(client?.phone || "").trim();
  return `#${clientId} - ${fullName}${phone ? ` | ${phone}` : ""}`;
}

function formatOfficerInitials(value) {
  const name = String(value || "").trim();
  if (!name) {
    return "-";
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "-";
  }

  return parts
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatLoanBranchCode(loan) {
  const branchCode = String(loan?.branch_code || "").trim();
  if (branchCode) {
    return branchCode;
  }

  const branchId = Number(loan?.branch_id);
  return Number.isInteger(branchId) && branchId > 0 ? `Branch #${branchId}` : "-";
}

function formatLoanOfficerContext(loan) {
  const officerName = String(loan?.officer_name || "").trim();
  if (officerName) {
    return formatOfficerInitials(officerName);
  }

  const officerId = Number(loan?.officer_id);
  return Number.isInteger(officerId) && officerId > 0 ? `User #${officerId}` : "-";
}

function formatLoanSelectionLabel(loan) {
  const loanId = Number(loan?.id || 0);
  const clientName = String(loan?.client_name || "").trim() || "Unknown client";
  const status = String(loan?.status || "unknown").trim().toLowerCase();
  const balance = formatCurrency(loan?.balance ?? 0);
  const branchCode = formatLoanBranchCode(loan);
  const officerLabel = formatLoanOfficerContext(loan);
  return `#${loanId} - ${clientName} | ${status} | ${branchCode} | ${officerLabel} | Bal ${balance}`;
}

async function loadOperationsLookups() {
  const loanClientSelect = document.getElementById("loanClientId");
  const repaymentLoanSelect = document.getElementById("repaymentLoanId");
  const scheduleLoanSelect = document.getElementById("scheduleLoanId");
  const collectionLoanSelect = document.getElementById("collectionLoanId");

  const [clientsResult, loansResult] = await Promise.all([
    api("/api/clients?limit=200&sortBy=createdAt&sortOrder=desc").catch(() => null),
    api("/api/loans?limit=200&sortBy=id&sortOrder=desc").catch(() => null),
  ]);

  const clients = Array.isArray(clientsResult?.data) ? clientsResult.data : [];
  const activeClients = clients.filter((client) => Number(client.is_active || 0) === 1);
  setSelectOptions(
    loanClientSelect,
    activeClients.map((client) => ({
      value: client.id,
      label: formatClientSelectionLabel(client),
    })),
    activeClients.length > 0 ? "Select client" : "No active clients available",
  );
  if (loanClientSelect) {
    loanClientSelect.disabled = activeClients.length === 0;
    const preferredClientExists = activeClients.some((client) => Number(client.id) === Number(lastCreatedClientId));
    if (preferredClientExists) {
      loanClientSelect.value = String(lastCreatedClientId);
    }
  }

  const loans = Array.isArray(loansResult?.data) ? loansResult.data : [];
  const repaymentLoans = loans.filter((loan) => {
    const status = String(loan.status || "").trim().toLowerCase();
    return status === "active" || status === "restructured";
  });

  const allLoanOptions = loans.map((loan) => ({
    value: loan.id,
    label: formatLoanSelectionLabel(loan),
  }));

  const repaymentLoanOptions = repaymentLoans.map((loan) => ({
    value: loan.id,
    label: formatLoanSelectionLabel(loan),
  }));

  setSelectOptions(
    repaymentLoanSelect,
    repaymentLoanOptions,
    repaymentLoanOptions.length > 0 ? "Select active loan" : "No active loans available",
  );
  if (repaymentLoanSelect) {
    repaymentLoanSelect.disabled = repaymentLoanOptions.length === 0;
  }

  setSelectOptions(scheduleLoanSelect, allLoanOptions, allLoanOptions.length > 0 ? "Select loan" : "No loans available");
  if (scheduleLoanSelect) {
    scheduleLoanSelect.disabled = allLoanOptions.length === 0;
  }

  setSelectOptions(
    collectionLoanSelect,
    allLoanOptions,
    allLoanOptions.length > 0 ? "Select loan" : "No loans available",
  );
  if (collectionLoanSelect) {
    collectionLoanSelect.disabled = allLoanOptions.length === 0;
  }

  const preferredLoanExistsInAll = loans.some((loan) => Number(loan.id) === Number(lastCreatedLoanId));
  if (preferredLoanExistsInAll) {
    if (scheduleLoanSelect) {
      scheduleLoanSelect.value = String(lastCreatedLoanId);
    }
    if (collectionLoanSelect) {
      collectionLoanSelect.value = String(lastCreatedLoanId);
    }
  }

  const preferredLoanExistsInRepayment = repaymentLoans.some((loan) => Number(loan.id) === Number(lastCreatedLoanId));
  if (preferredLoanExistsInRepayment && repaymentLoanSelect) {
    repaymentLoanSelect.value = String(lastCreatedLoanId);
  }
}

function resetRoleFieldValue(fieldElement) {
  if (!fieldElement) {
    return;
  }
  const inputs = fieldElement.querySelectorAll("input, select, textarea");
  inputs.forEach((input) => {
    if (input.tagName === "SELECT") {
      input.value = "";
    } else if (input.type === "checkbox" || input.type === "radio") {
      input.checked = false;
    } else {
      input.value = "";
    }
    clearFieldError(input);
  });
}

function setAdminRoleFieldState(fieldElement, visible) {
  if (!fieldElement) {
    return;
  }
  fieldElement.classList.toggle("is-hidden", !visible);
  const inputs = fieldElement.querySelectorAll("input, select, textarea");
  inputs.forEach((input) => {
    input.disabled = !visible;
  });
  if (!visible) {
    resetRoleFieldValue(fieldElement);
  }
}

function applyAdminRoleFieldVisibility(roleValue) {
  const role = String(roleValue || "").trim().toLowerCase();
  const isBranchScopedRole = role === "operations_manager" || role === "loan_officer";
  const isAreaManagerRole = role === "area_manager";

  setAdminRoleFieldState(adminBranchField, isBranchScopedRole || isAreaManagerRole);
  setAdminRoleFieldState(adminAreaBranchIdsField, isAreaManagerRole);
  setAdminRoleFieldState(adminAreaBranchCountField, isAreaManagerRole);
  setAdminRoleFieldState(adminPrimaryRegionField, isAreaManagerRole);
}

function formatCapabilityPreview(capabilities) {
  const capabilityList = Array.isArray(capabilities)
    ? capabilities
      .map((item) => String(item || "").trim())
      .filter(Boolean)
    : [];
  if (capabilityList.length === 0) {
    return "";
  }

  const preview = capabilityList
    .slice(0, 5)
    .map((item) => item.replace(/[:_]+/g, " "));
  const suffix = capabilityList.length > preview.length ? ", ..." : "";
  return `${preview.join(", ")}${suffix}`;
}

function formatRoleDisplay(roleValue) {
  const roleKey = String(roleValue || "").trim().toLowerCase();
  if (!roleKey) {
    return "";
  }

  const roleLabel = String(roleCatalogByKey.get(roleKey)?.label || "").trim();
  if (roleLabel) {
    return roleLabel;
  }

  return roleKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function updateAdminRoleHint(roleKey) {
  if (!adminUserRoleHint) {
    return;
  }

  const selectedRole = String(roleKey || adminRoleSelect?.value || "").trim().toLowerCase();
  applyAdminRoleFieldVisibility(selectedRole);
  if (!selectedRole) {
    adminUserRoleHint.textContent = "Select a role to view scope guidance.";
    return;
  }

  const metadata = roleCatalogByKey.get(selectedRole);
  if (!metadata) {
    if (selectedRole === "area_manager") {
      adminUserRoleHint.textContent = "Area Manager: assign one region and one or more branches in that region.";
      return;
    }
    adminUserRoleHint.textContent = `Role ${selectedRole} selected.`;
    return;
  }

  const parts = [];
  const label = String(metadata.label || selectedRole);
  const description = String(metadata.description || "").trim();
  const scopeRule = String(metadata.scopeRule || "").trim();
  const capabilityPreview = formatCapabilityPreview(metadata.capabilities);

  parts.push(description ? `${label}: ${description}` : label);
  if (scopeRule) {
    parts.push(`Scope rule: ${scopeRule}`);
  }
  if (capabilityPreview) {
    parts.push(`Key capabilities: ${capabilityPreview}`);
  }

  adminUserRoleHint.textContent = parts.join(" ");
}

function renderDashboardUserBanner(user) {
  if (!user) {
    if (userMeta) {
      userMeta.textContent = "";
    }
    if (userScopeMeta) {
      userScopeMeta.textContent = "";
      userScopeMeta.classList.add("hidden");
    }
    if (userRoleHint) {
      userRoleHint.textContent = "";
      userRoleHint.classList.add("hidden");
    }
    return;
  }

  const roleKey = String(user.role || "").trim().toLowerCase();
  const roleDisplay = formatRoleDisplay(roleKey) || String(user.role || "");
  const branchName = String(user.branch_name || "").trim();
  const regionName = String(user.region_name || "").trim();
  const isBranchScopedUser = branchScopedUserRoles.has(roleKey);
  const isAreaManager = roleKey === "area_manager";
  const isHqTaggedRole = hqTaggedRoles.has(roleKey);

  let decoratedRole = roleDisplay;
  if (isBranchScopedUser && branchName) {
    decoratedRole = `${roleDisplay}-${branchName}`;
  } else if (isAreaManager && regionName) {
    decoratedRole = `${roleDisplay}-${regionName}`;
  } else if (isHqTaggedRole) {
    decoratedRole = `${roleDisplay}-HQ`;
  }

  if (userMeta) {
    userMeta.textContent = `${user.full_name} (${decoratedRole})`;
  }

  if (isHqTaggedRole) {
    if (userScopeMeta) {
      userScopeMeta.textContent = "HQ";
      userScopeMeta.classList.remove("hidden");
    }
    if (userRoleHint) {
      userRoleHint.textContent = "";
      userRoleHint.classList.add("hidden");
    }
    return;
  }

  let scopeText = "";
  if (isBranchScopedUser) {
    scopeText = branchName && regionName
      ? `Branch ${branchName} - Region ${regionName}`
      : (branchName ? `Branch ${branchName}` : (regionName ? `Region ${regionName}` : "Branch scope unavailable"));
  } else if (isAreaManager) {
    scopeText = regionName
      ? `Area ${regionName}`
      : "Area scope unavailable";
  } else {
    scopeText = "";
  }

  if (userScopeMeta) {
    userScopeMeta.textContent = scopeText;
    userScopeMeta.classList.toggle("hidden", !scopeText);
  }

  const roleDescription = String(
    user.role_description
    || roleCatalogByKey.get(roleKey)?.description
    || "",
  ).trim();
  if (!isBranchScopedUser && !isAreaManager) {
    if (userRoleHint) {
      userRoleHint.textContent = "";
      userRoleHint.classList.add("hidden");
    }
    return;
  }

  let hintText = "";
  if (roleDescription) {
    hintText = `${roleDescription.replace(/\.$/, "")}${isAreaManager ? " for this area." : " for this branch."}`;
  } else if (roleKey === "operations_manager") {
    hintText = operationsManagerRoleHintFallback;
  } else if (roleKey === "area_manager") {
    hintText = areaManagerRoleHintFallback;
  } else {
    hintText = loanOfficerRoleHintFallback;
  }

  if (userRoleHint) {
    userRoleHint.textContent = hintText;
    userRoleHint.classList.remove("hidden");
  }
}

async function loadRoleCatalog() {
  const rolesResult = await api("/api/users/roles");
  const roles = Array.isArray(rolesResult.roles) ? rolesResult.roles : [];
  roleCatalogByKey = new Map(
    roles
      .map((roleItem) => [String(roleItem.key || "").trim().toLowerCase(), roleItem])
      .filter(([key]) => key),
  );
  updateAdminRoleHint();
  return roles;
}

function renderPortfolio(summary) {
  clearElement(portfolioList);
  const entries = [
    ["Total Loans", formatNumber(summary.total_loans)],
    ["Active Loans", formatNumber(summary.active_loans)],
    ["Overdue Installments", formatNumber(summary.overdue_installments)],
    ["Principal Disbursed", formatCurrency(summary.principal_disbursed)],
    ["Expected Total", formatCurrency(summary.expected_total)],
    ["Repaid Total", formatCurrency(summary.repaid_total)],
    ["Outstanding Balance", formatCurrency(summary.outstanding_balance)],
    ["Overdue Loans", formatNumber(summary.overdue_loans)],
    ["Overdue Amount", formatCurrency(summary.overdue_amount)],
    ["Open Collection Actions", formatNumber(summary.open_collection_actions)],
  ];

  entries.forEach(([label, value]) => {
    appendMetric(portfolioList, label, value);
  });
}

function renderMyPortfolio(summary) {
  if (!myPortfolioList) {
    return;
  }

  clearElement(myPortfolioList);
  const entries = [
    ["My Total Loans", formatNumber(summary.total_loans ?? 0)],
    ["My Active Loans", formatNumber(summary.active_loans ?? 0)],
    ["My Overdue Loans", formatNumber(summary.overdue_loans ?? 0)],
    ["My Overdue Installments", formatNumber(summary.overdue_installments ?? 0)],
    ["My Overdue Amount", formatCurrency(summary.overdue_amount ?? 0)],
    ["My Outstanding Balance", formatCurrency(summary.outstanding_balance ?? 0)],
  ];

  entries.forEach(([label, value]) => {
    appendMetric(myPortfolioList, label, value);
  });
}

function renderPortfolioKpiHighlightsPanel(metrics) {
  if (!portfolioKpiHighlights) {
    return;
  }

  clearElement(portfolioKpiHighlights);
  metrics.forEach(([label, value]) => appendMetric(portfolioKpiHighlights, label, value));
}

async function loadPortfolioKpiPanel(filters = {}, baselinePortfolio = null) {
  const dateQuery = new URLSearchParams();
  appendDateRangeQuery(dateQuery, filters);
  const dateQuerySuffix = dateQuery.toString();

  const [portfolioResult, disbursementsResult, collectionsResult, duesResult] = await Promise.all([
    baselinePortfolio ? Promise.resolve(baselinePortfolio) : api("/api/reports/portfolio"),
    api(`/api/reports/disbursements${dateQuerySuffix ? `?${dateQuerySuffix}` : ""}`),
    api(`/api/reports/collections${dateQuerySuffix ? `?${dateQuerySuffix}` : ""}`),
    api(`/api/reports/dues${dateQuerySuffix ? `?${dateQuerySuffix}` : ""}`),
  ]);

  const portfolioSummary = portfolioResult || {};
  const disbursementsSummary = disbursementsResult?.summary || {};
  const collectionsSummary = collectionsResult?.summary || {};
  const duesInPeriod = duesResult?.duesInPeriod || {};
  const overdueBeforePeriod = duesResult?.alreadyOverdueBeforePeriod || {};

  renderMiniBarChart(
    portfolioKpiChart,
    [
      { label: "Principal Disbursed", value: Number(disbursementsSummary.total_principal || 0) || 0 },
      { label: "Repayments Collected", value: Number(collectionsSummary.total_collected || 0) || 0, tone: "is-secondary" },
      { label: "Expected Dues", value: Number(duesInPeriod.expected_amount || 0) || 0, tone: "is-accent" },
      { label: "Overdue Backlog", value: Number(overdueBeforePeriod.overdue_amount || 0) || 0, tone: "is-warning" },
    ],
    { valueFormatter: formatCurrency, emptyMessage: "No KPI values for the selected date range." },
  );

  const expectedDues = Number(duesInPeriod.expected_amount || 0) || 0;
  const collected = Number(collectionsSummary.total_collected || 0) || 0;
  const repeatLoans = Number(disbursementsSummary.repeat_client_loans || 0) || 0;
  const totalDisbursedLoans = Number(disbursementsSummary.total_loans || 0) || 0;
  const outstandingBalance = Number(portfolioSummary.outstanding_balance || 0) || 0;
  const overdueAmount = Number(portfolioSummary.overdue_amount || 0) || 0;
  const activeLoans = Number(portfolioSummary.active_loans || 0) || 0;
  const totalLoans = Number(portfolioSummary.total_loans || 0) || 0;

  const coverageRatio = expectedDues > 0 ? collected / expectedDues : null;
  const repeatShare = totalDisbursedLoans > 0 ? repeatLoans / totalDisbursedLoans : null;
  const riskRatio = outstandingBalance > 0 ? overdueAmount / outstandingBalance : null;
  const activeShare = totalLoans > 0 ? activeLoans / totalLoans : null;

  renderPortfolioKpiHighlightsPanel([
    ["Collection Coverage", coverageRatio === null ? "-" : formatPercent(coverageRatio)],
    ["Repeat Borrower Share", repeatShare === null ? "-" : formatPercent(repeatShare)],
    ["Overdue vs Outstanding", riskRatio === null ? "-" : formatPercent(riskRatio)],
    ["Active Loan Share", activeShare === null ? "-" : formatPercent(activeShare)],
  ]);

  if (portfolioKpiMeta) {
    portfolioKpiMeta.textContent =
      `Showing KPI visuals for ${formatDateRangeLabel(filters)}. Disbursements: ${formatNumber(totalDisbursedLoans)} loans.`;
  }

  return {
    portfolioSummary,
    disbursementsSummary,
    collectionsSummary,
    duesInPeriod,
    overdueBeforePeriod,
  };
}

function readPortfolioKpiFilters() {
  const range = readDateRangeFilters(portfolioKpiDateFromInput, portfolioKpiDateToInput);
  return normalizeDateRangeFilters(range, portfolioKpiDateFromInput, portfolioKpiDateToInput);
}

function readClientTrendFilters() {
  const range = readDateRangeFilters(clientTrendDateFromInput, clientTrendDateToInput);
  return normalizeDateRangeFilters(range, clientTrendDateFromInput, clientTrendDateToInput);
}

function renderClientTrendSummary(summary) {
  if (!clientTrendList) {
    return;
  }

  clearElement(clientTrendList);
  const newClients = Number(summary?.new_clients_registered || 0) || 0;
  const activeBorrowers = Number(summary?.active_borrowers || 0) || 0;
  const activeClients = Number(summary?.total_active_clients || 0) || 0;
  const firstTimeBorrowers = Number(summary?.first_time_borrowers_in_period || 0) || 0;
  const repeatBorrowers = Number(summary?.total_repeat_borrowers || 0) || 0;

  appendMetric(clientTrendList, "New Clients", formatNumber(newClients));
  appendMetric(clientTrendList, "First-Time Borrowers", formatNumber(firstTimeBorrowers));
  appendMetric(clientTrendList, "Active Borrowers", formatNumber(activeBorrowers));
  appendMetric(clientTrendList, "Repeat Borrowers", formatNumber(repeatBorrowers));
  appendMetric(
    clientTrendList,
    "Borrower Penetration",
    activeClients > 0 ? formatPercent(activeBorrowers / activeClients) : "-",
  );
}

async function loadClientTrendPanel(filters = {}) {
  const dateFrom = String(filters?.dateFrom || "").trim();
  const dateTo = String(filters?.dateTo || "").trim();
  const buckets = buildDateBuckets(dateFrom, dateTo, 8);

  const fullPeriodQuery = new URLSearchParams();
  appendDateRangeQuery(fullPeriodQuery, filters);
  const fullPeriodSuffix = fullPeriodQuery.toString();

  const bucketRequests = buckets.map((bucket) => {
    const query = new URLSearchParams();
    query.set("dateFrom", bucket.dateFrom);
    query.set("dateTo", bucket.dateTo);
    return api(`/api/reports/clients?${query.toString()}`)
      .then((response) => ({
        ...bucket,
        newClients: Number(response?.summary?.new_clients_registered || 0) || 0,
        firstTimeBorrowers: Number(response?.summary?.first_time_borrowers_in_period || 0) || 0,
      }));
  });

  const [summaryResult, ...bucketResults] = await Promise.all([
    api(`/api/reports/clients${fullPeriodSuffix ? `?${fullPeriodSuffix}` : ""}`),
    ...bucketRequests,
  ]);

  renderClientTrendChart(clientTrendChart, bucketResults);
  renderClientTrendSummary(summaryResult?.summary || {});

  if (clientTrendMeta) {
    clientTrendMeta.textContent =
      `Showing ${formatDateRangeLabel(filters)} across ${formatNumber(bucketResults.length)} time bucket(s).`;
  }

  return {
    summary: summaryResult?.summary || {},
    buckets: bucketResults,
  };
}

function readOverdueAlertsFilters() {
  const dateRange = normalizeDateRangeFilters(
    readDateRangeFilters(overdueAlertsDateFromInput, overdueAlertsDateToInput),
    overdueAlertsDateFromInput,
    overdueAlertsDateToInput,
  );
  const minDaysRaw = String(overdueAlertsMinDaysInput?.value || "").trim();
  if (!minDaysRaw) {
    return {
      ...dateRange,
      minDaysOverdue: defaultOverdueAlertsMinDays,
    };
  }

  const minDaysValue = Number(minDaysRaw);
  if (!Number.isInteger(minDaysValue) || minDaysValue < 0) {
    throwFieldValidationError(overdueAlertsMinDaysInput, "Minimum days overdue must be 0 or greater");
  }

  return {
    ...dateRange,
    minDaysOverdue: minDaysValue,
  };
}

function renderOverdueAlertsSummary(duesResult, overdueRowsData) {
  if (!overdueAlertsList) {
    return;
  }

  clearElement(overdueAlertsList);
  const duesInPeriod = duesResult?.duesInPeriod || {};
  const overdueBeforePeriod = duesResult?.alreadyOverdueBeforePeriod || {};
  const criticalCount = Array.isArray(overdueRowsData)
    ? overdueRowsData.filter((row) => Number(row.days_overdue || 0) >= 90).length
    : 0;

  appendMetric(overdueAlertsList, "Expected Dues In Period", formatCurrency(duesInPeriod.expected_amount ?? 0));
  appendMetric(overdueAlertsList, "Installments In Period", formatNumber(duesInPeriod.installment_count ?? 0));
  appendMetric(overdueAlertsList, "Already Overdue Before Period", formatCurrency(overdueBeforePeriod.overdue_amount ?? 0));
  appendMetric(overdueAlertsList, "Loans In Alert Queue", formatNumber(overdueRowsData?.length || 0));
  appendMetric(overdueAlertsList, "Critical Alerts (90+ Days)", formatNumber(criticalCount));
}

async function loadOverdueAlertsPanel(filters = {}, user = currentUser) {
  const duesQuery = new URLSearchParams();
  appendDateRangeQuery(duesQuery, filters);
  const duesQuerySuffix = duesQuery.toString();

  const overdueQuery = new URLSearchParams();
  overdueQuery.set("limit", "30");
  overdueQuery.set("sortBy", "daysOverdue");
  overdueQuery.set("sortOrder", "desc");
  const minDaysOverdue = Number(filters?.minDaysOverdue || 0);
  if (Number.isInteger(minDaysOverdue) && minDaysOverdue > 0) {
    overdueQuery.set("minDaysOverdue", String(minDaysOverdue));
  }
  if (user?.role === "loan_officer") {
    overdueQuery.set("mine", "1");
  }

  const [duesResult, overdueResult] = await Promise.all([
    api(`/api/reports/dues${duesQuerySuffix ? `?${duesQuerySuffix}` : ""}`),
    api(`/api/collections/overdue?${overdueQuery.toString()}`),
  ]);

  const overdueRowsData = Array.isArray(overdueResult?.data) ? overdueResult.data : [];
  renderOverdueAlertsSummary(duesResult, overdueRowsData);
  renderOverdueAlertsTable(overdueRowsData);

  if (overdueAlertsMeta) {
    overdueAlertsMeta.textContent =
      `Showing alerts for ${formatDateRangeLabel(filters)} with minimum ${formatNumber(minDaysOverdue)} day(s) overdue.`;
  }

  return {
    duesResult,
    overdueRowsData,
  };
}

function renderTransactions(transactions) {
  clearElement(txRows);
  if (!transactions || transactions.length === 0) {
    renderEmptyRow(txRows, 6, "No transactions found.");
    return;
  }

  transactions.forEach((item) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(item.id)));
    row.appendChild(createCell("td", item.tx_type || "-"));
    row.appendChild(createCell("td", item.client_name || "-"));
    row.appendChild(createCell("td", item.loan_id ? String(item.loan_id) : "-"));
    row.appendChild(createCell("td", formatCurrency(item.amount)));
    row.appendChild(createCell("td", formatDateTime(item.occurred_at)));
    txRows.appendChild(row);
  });
}

function renderCollectionsSummary(summary, { isLoanOfficer = false } = {}) {
  clearElement(collectionsList);
  const entries = [
    ["Overdue Loans", formatNumber(summary.overdue_loans)],
    ["Overdue Installments", formatNumber(summary.overdue_installments)],
    ["Overdue Amount", formatCurrency(summary.overdue_amount)],
    ["Open Collection Actions", formatNumber(summary.open_collection_actions)],
    ["Open Promises", formatNumber(summary.open_promises)],
  ];
  if (isLoanOfficer) {
    entries.push(["My Overdue Loans", formatNumber(summary.overdue_loans_for_officer ?? 0)]);
    entries.push(["My Overdue Amount", formatCurrency(summary.overdue_amount_for_officer ?? 0)]);
  }

  entries.forEach(([label, value]) => {
    appendMetric(collectionsList, label, value);
  });
}

function renderMyPipeline(rows) {
  if (!myPipelineRows) {
    return;
  }

  clearElement(myPipelineRows);
  if (!rows || rows.length === 0) {
    renderEmptyRow(myPipelineRows, 5, "No pending approvals in your pipeline.");
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(item.loan_id)));
    row.appendChild(createCell("td", item.client_name || "-"));
    row.appendChild(createCell("td", formatCurrency(item.principal ?? 0)));
    row.appendChild(createCell("td", formatDateTime(item.created_at)));
    row.appendChild(createCell("td", item.status || "-"));
    myPipelineRows.appendChild(row);
  });
}

function renderOverdueQueue(rows) {
  clearElement(overdueRows);
  if (!rows || rows.length === 0) {
    renderEmptyRow(overdueRows, 7, "No overdue loans right now.");
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("tr");
    row.classList.add("overdue-queue-row");
    row.dataset.loanId = String(item.loan_id ?? "");
    const installmentId = Number(item.oldest_overdue_installment_id);
    row.dataset.installmentId = Number.isInteger(installmentId) && installmentId > 0 ? String(installmentId) : "";
    row.appendChild(createCell("td", String(item.loan_id)));
    row.appendChild(createCell("td", item.client_name || "-"));
    row.appendChild(createCell("td", formatNumber(item.overdue_installments ?? 0)));
    row.appendChild(createCell("td", formatCurrency(item.overdue_amount ?? 0)));
    row.appendChild(createCell("td", formatNumber(item.days_overdue ?? 0)));
    row.appendChild(createCell("td", formatNumber(item.open_collection_actions ?? 0)));

    const viewCell = document.createElement("td");
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "secondary-btn queue-view-btn";
    viewButton.dataset.action = "open-schedule";
    viewButton.textContent = "View";
    viewCell.appendChild(viewButton);
    row.appendChild(viewCell);

    overdueRows.appendChild(row);
  });
}

function renderCollectionActions(rows) {
  clearElement(collectionActionRows);
  if (!rows || rows.length === 0) {
    renderEmptyRow(collectionActionRows, 7, "No collection actions recorded yet.");
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(item.id)));
    row.appendChild(createCell("td", String(item.loan_id)));
    row.appendChild(createCell("td", item.action_type || "-"));
    row.appendChild(createCell("td", item.action_status || "-"));
    row.appendChild(createCell("td", item.created_by_name || "-"));
    row.appendChild(createCell("td", formatDateTime(item.created_at)));
    row.appendChild(createCell("td", item.action_note || "-"));
    collectionActionRows.appendChild(row);
  });
}

function canViewOfficerPerformance(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  return officerPerformanceViewRoles.has(role);
}

function setOfficerPerformancePanelVisible(visible) {
  if (!officerPerformanceCard) {
    return;
  }

  officerPerformanceCard.classList.toggle("hidden", !visible);
  if (!visible) {
    if (officerPerformanceMeta) {
      officerPerformanceMeta.textContent = "";
    }
    if (officerPerformanceRows) {
      clearElement(officerPerformanceRows);
    }
  }
}

function renderOfficerPerformance(rows, period) {
  if (!officerPerformanceRows) {
    return;
  }

  clearElement(officerPerformanceRows);
  if (!rows || rows.length === 0) {
    renderEmptyRow(officerPerformanceRows, 9, "No officer leaderboard records for the selected filters.");
  } else {
    const sortedRows = [...rows].sort((left, right) => {
      const collectedDiff = Number(right.total_collected || 0) - Number(left.total_collected || 0);
      if (collectedDiff !== 0) {
        return collectedDiff;
      }
      return Number(right.loans_disbursed || 0) - Number(left.loans_disbursed || 0);
    });

    sortedRows.forEach((item, index) => {
      const row = document.createElement("tr");
      if (index < 3) {
        row.classList.add("leaderboard-top");
      }
      row.appendChild(createCell("td", `#${index + 1}`));
      row.appendChild(createCell("td", String(item.officer_name || "-")));
      row.appendChild(createCell("td", String(item.branch_name || "-")));
      row.appendChild(createCell("td", String(item.officer_email || "-")));
      row.appendChild(createCell("td", formatNumber(item.loans_disbursed ?? 0)));
      row.appendChild(createCell("td", formatCurrency(item.total_principal_disbursed ?? 0)));
      row.appendChild(createCell("td", formatNumber(item.repayment_count ?? 0)));
      row.appendChild(createCell("td", formatCurrency(item.total_collected ?? 0)));
      row.appendChild(createCell("td", formatPercent(item.collection_rate_pct ?? 0)));
      officerPerformanceRows.appendChild(row);
    });
  }

  if (!officerPerformanceMeta) {
    return;
  }
  const count = Array.isArray(rows) ? rows.length : 0;
  const periodStart = String(period?.dateFrom || "").trim();
  const periodEnd = String(period?.dateTo || "").trim();
  if (!periodStart && !periodEnd) {
    officerPerformanceMeta.textContent = `Showing ${formatNumber(count)} officer record(s) for all dates.`;
    return;
  }
  officerPerformanceMeta.textContent = `Showing ${formatNumber(count)} officer record(s) from ${periodStart || "start"} to ${periodEnd || "today"}.`;
}

function readOfficerPerformanceFilters() {
  const dateFromInput = document.getElementById("officerPerformanceDateFrom");
  const dateToInput = document.getElementById("officerPerformanceDateTo");
  const range = readDateRangeFilters(dateFromInput, dateToInput);
  return normalizeDateRangeFilters(range, dateFromInput, dateToInput);
}

async function loadOfficerPerformancePanel(filters = {}) {
  const query = new URLSearchParams();
  if (filters.dateFrom) {
    query.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    query.set("dateTo", filters.dateTo);
  }

  const querySuffix = query.toString();
  const result = await api(`/api/reports/officer-performance${querySuffix ? `?${querySuffix}` : ""}`);
  const rows = Array.isArray(result?.officers) ? result.officers : [];
  renderOfficerPerformance(rows, result?.period || null);
  return result;
}

function renderUsers(users) {
  clearElement(userRows);
  if (!users || users.length === 0) {
    renderEmptyRow(userRows, 9, "No users found.");
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("tr");
    const assignedAreaBranchIds = Array.isArray(user.assigned_branch_ids) ? user.assigned_branch_ids : [];
    const roleKey = String(user.role || "").trim().toLowerCase();
    const roleDisplay = formatRoleDisplay(roleKey);
    const branchName = String(user.branch_name || "").trim();
    const regionName = String(user.region_name || "").trim();
    const isHqTaggedRole = hqTaggedRoles.has(roleKey);
    const branchLabel = roleKey === "area_manager"
      ? (
        regionName
          ? `Area-${regionName}${assignedAreaBranchIds.length > 0 ? ` (${assignedAreaBranchIds.length} branches)` : ""}`
          : (assignedAreaBranchIds.length > 0 ? `${assignedAreaBranchIds.length} branches` : "Area")
      )
      : (branchScopedUserRoles.has(roleKey) && branchName
        ? `${roleDisplay || roleKey}-${branchName}`
        : (isHqTaggedRole ? "HQ" : (branchName || "-")));
    row.appendChild(createCell("td", String(user.id)));
    row.appendChild(createCell("td", user.full_name || ""));
    row.appendChild(createCell("td", user.email || ""));
    row.appendChild(createCell("td", user.role || ""));
    row.appendChild(createCell("td", branchLabel));
    row.appendChild(createCell("td", user.region_name || "-"));
    row.appendChild(createCell("td", formatNumber(user.failed_login_attempts ?? 0)));
    row.appendChild(createCell("td", formatDateTime(user.locked_until)));

    const actionsCell = document.createElement("td");
    actionsCell.className = "user-actions-cell";

    const unlockButton = document.createElement("button");
    unlockButton.className = "unlock-row-btn";
    unlockButton.type = "button";
    unlockButton.dataset.action = "unlock";
    unlockButton.dataset.userId = String(user.id);
    unlockButton.textContent = "Unlock";
    unlockButton.disabled = !user.locked_until;
    actionsCell.appendChild(unlockButton);

    const resetButton = document.createElement("button");
    resetButton.className = "unlock-row-btn secondary-btn";
    resetButton.type = "button";
    resetButton.dataset.action = "reset-token";
    resetButton.dataset.userId = String(user.id);
    resetButton.textContent = "Reset Token";
    resetButton.disabled = user.is_active !== 1;
    actionsCell.appendChild(resetButton);

    const revokeSessionsButton = document.createElement("button");
    revokeSessionsButton.className = "unlock-row-btn secondary-btn";
    revokeSessionsButton.type = "button";
    revokeSessionsButton.dataset.action = "revoke-sessions";
    revokeSessionsButton.dataset.userId = String(user.id);
    revokeSessionsButton.textContent = "Revoke Sessions";
    actionsCell.appendChild(revokeSessionsButton);

    const toggleButton = document.createElement("button");
    toggleButton.className = "unlock-row-btn secondary-btn";
    toggleButton.type = "button";
    toggleButton.dataset.action = user.is_active === 1 ? "deactivate" : "activate";
    toggleButton.dataset.userId = String(user.id);
    toggleButton.textContent = user.is_active === 1 ? "Deactivate" : "Activate";
    toggleButton.disabled = Boolean(currentUser && user.id === currentUser.id);
    actionsCell.appendChild(toggleButton);

    const roleControls = document.createElement("div");
    roleControls.className = "user-role-actions";

    const roleSelect = document.createElement("select");
    roleSelect.dataset.kind = "role-select";
    roleSelect.innerHTML = `
      <option value="admin">admin</option>
      <option value="ceo">ceo</option>
      <option value="finance">finance</option>
      <option value="operations_manager">operations_manager</option>
      <option value="it">it</option>
      <option value="area_manager">area_manager</option>
      <option value="loan_officer">loan_officer</option>
      <option value="cashier">cashier</option>
    `;
    roleSelect.value = user.role || "cashier";
    roleSelect.disabled = Boolean(currentUser && user.id === currentUser.id && user.role === "admin");

    const applyRoleButton = document.createElement("button");
    applyRoleButton.className = "unlock-row-btn secondary-btn";
    applyRoleButton.type = "button";
    applyRoleButton.dataset.action = "role-update";
    applyRoleButton.dataset.userId = String(user.id);
    applyRoleButton.textContent = "Apply Role";
    applyRoleButton.disabled = roleSelect.disabled;

    roleControls.appendChild(roleSelect);
    roleControls.appendChild(applyRoleButton);
    actionsCell.appendChild(roleControls);

    const scopeButton = document.createElement("button");
    scopeButton.className = "unlock-row-btn secondary-btn";
    scopeButton.type = "button";
    scopeButton.dataset.action = "scope-update";
    scopeButton.dataset.userId = String(user.id);
    scopeButton.dataset.role = user.role || "";
    scopeButton.dataset.branchId = user.branch_id ? String(user.branch_id) : "";
    scopeButton.dataset.branchIds = assignedAreaBranchIds.join(",");
    scopeButton.dataset.regionId = user.primary_region_id ? String(user.primary_region_id) : "";
    scopeButton.textContent = "Update Scope";
    actionsCell.appendChild(scopeButton);

    row.appendChild(actionsCell);
    userRows.appendChild(row);
  });
}

function renderBranches(branches) {
  clearElement(branchRows);
  if (!branches || branches.length === 0) {
    renderEmptyRow(branchRows, 8, "No branches found.");
    return;
  }

  branches.forEach((branch) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(branch.id)));
    row.appendChild(createCell("td", branch.code || "-"));
    row.appendChild(createCell("td", branch.name || "-"));
    row.appendChild(createCell("td", branch.region_name || "-"));
    row.appendChild(createCell("td", branch.town || "-"));
    row.appendChild(createCell("td", branch.county || "-"));
    row.appendChild(createCell("td", Number(branch.is_active) === 1 ? "Active" : "Inactive"));

    const actions = document.createElement("td");
    actions.className = "row-action-group";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "unlock-row-btn secondary-btn";
    editButton.dataset.action = "edit-branch";
    editButton.dataset.branchId = String(branch.id);
    editButton.dataset.branchName = branch.name || "";
    editButton.dataset.branchTown = branch.town || "";
    editButton.dataset.branchCounty = branch.county || "";
    editButton.dataset.branchRegionId = branch.region_id ? String(branch.region_id) : "";
    editButton.dataset.branchCode = branch.code || "";
    editButton.textContent = "Edit";
    actions.appendChild(editButton);

    const deactivateButton = document.createElement("button");
    deactivateButton.type = "button";
    deactivateButton.className = "unlock-row-btn secondary-btn";
    deactivateButton.dataset.action = "deactivate-branch";
    deactivateButton.dataset.branchId = String(branch.id);
    deactivateButton.textContent = Number(branch.is_active) === 1 ? "Deactivate" : "Inactive";
    deactivateButton.disabled = Number(branch.is_active) !== 1;
    actions.appendChild(deactivateButton);

    row.appendChild(actions);
    branchRows.appendChild(row);
  });
}

async function loadHierarchyLookups() {
  const [regionsResult, branchesResult] = await Promise.all([
    api("/api/regions"),
    api("/api/branches?limit=500&sortBy=name&sortOrder=asc"),
  ]);

  const regions = regionsResult.data || [];
  const branches = branchesResult.data || [];

  setSelectOptions(
    document.getElementById("adminUserBranchId"),
    branches.map((branch) => ({
      value: branch.id,
      label: `${branch.code} - ${branch.name} (${branch.town})`,
    })),
    "Select branch (optional)",
  );

  setSelectOptions(
    document.getElementById("branchRegionId"),
    regions.map((region) => ({
      value: region.id,
      label: `${region.name} (${region.code})`,
    })),
    "Select region",
  );

  return { regions, branches };
}

async function loadBranchesPanel() {
  const branchesResult = await api("/api/branches?limit=500&sortBy=name&sortOrder=asc");
  renderBranches(branchesResult.data || []);
}

function formatCompactJson(value) {
  if (value === null || typeof value === "undefined") {
    return "-";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "-";
    }
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch (_error) {
      return trimmed;
    }
  }
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function createPreformattedCell(value) {
  const cell = document.createElement("td");
  if (value === null || typeof value === "undefined") {
    cell.textContent = "-";
    return cell;
  }

  const pre = document.createElement("pre");
  pre.className = "json-details";
  pre.textContent = String(value);
  cell.appendChild(pre);
  return cell;
}

function setAuditPaginationMeta(total, limit, offset, pageMetaElement, prevButton, nextButton) {
  const normalizedTotal = Number(total || 0);
  const normalizedLimit = Math.max(Number(limit || 20), 1);
  const normalizedOffset = Math.max(Number(offset || 0), 0);
  const pageNumber = Math.floor(normalizedOffset / normalizedLimit) + 1;
  const totalPages = Math.max(Math.ceil(normalizedTotal / normalizedLimit), 1);
  const start = normalizedTotal > 0 ? normalizedOffset + 1 : 0;
  const end = normalizedTotal > 0 ? Math.min(normalizedOffset + normalizedLimit, normalizedTotal) : 0;

  if (pageMetaElement) {
    pageMetaElement.textContent = `Page ${formatNumber(pageNumber)} of ${formatNumber(totalPages)} · ${formatNumber(start)}-${formatNumber(end)} of ${formatNumber(normalizedTotal)}`;
  }
  if (prevButton) {
    prevButton.disabled = normalizedOffset <= 0;
  }
  if (nextButton) {
    nextButton.disabled = normalizedOffset + normalizedLimit >= normalizedTotal;
  }
}

function getNextSortOrder(activeSortBy, activeSortOrder, clickedSortBy) {
  if (String(activeSortBy || "").trim() !== String(clickedSortBy || "").trim()) {
    return "desc";
  }
  return String(activeSortOrder || "desc").toLowerCase() === "desc" ? "asc" : "desc";
}

function updateTableSortState(tableBody, { sortBy, sortOrder } = {}) {
  const table = tableBody?.closest("table");
  if (!table) {
    return;
  }

  const headers = table.querySelectorAll("th[data-sort-key]");
  headers.forEach((header) => {
    const key = String(header.dataset.sortKey || "").trim();
    const button = header.querySelector("button[data-sort-key]");
    const active = key && key === String(sortBy || "").trim();
    header.classList.toggle("is-active-sort", active);
    if (!button) {
      return;
    }
    if (active) {
      const normalizedOrder = String(sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";
      button.dataset.sortOrder = normalizedOrder;
      button.setAttribute("aria-label", `Sorted by ${key} ${normalizedOrder}. Click to toggle sort.`);
    } else {
      delete button.dataset.sortOrder;
      button.setAttribute("aria-label", `Sort by ${key}`);
    }
  });
}

function readAuditTrailFilters({ preserveOffset = false } = {}) {
  const actionInput = document.getElementById("auditAction");
  const userIdInput = document.getElementById("auditUserId");
  const targetTypeInput = document.getElementById("auditTargetType");
  const targetIdInput = document.getElementById("auditTargetId");
  const dateFromInput = document.getElementById("auditDateFrom");
  const dateToInput = document.getElementById("auditDateTo");
  const limitInput = document.getElementById("auditLimit");

  const range = readDateRangeFilters(dateFromInput, dateToInput);
  const userId = optionalPositiveInteger(userIdInput, "User ID");
  const targetId = optionalPositiveInteger(targetIdInput, "Target ID");
  const limit = Number(limitInput?.value || 20);
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;

  return {
    action: String(actionInput?.value || "").trim().toLowerCase(),
    userId,
    targetType: String(targetTypeInput?.value || "").trim().toLowerCase(),
    targetId,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    limit: normalizedLimit,
    offset: preserveOffset ? Math.max(Number(auditTrailFilters?.offset || 0), 0) : 0,
    sortBy: String(auditTrailFilters?.sortBy || "id"),
    sortOrder: String(auditTrailFilters?.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc",
  };
}

function applyAuditFilterValues(filters = {}) {
  const actionInput = document.getElementById("auditAction");
  const userIdInput = document.getElementById("auditUserId");
  const targetTypeInput = document.getElementById("auditTargetType");
  const targetIdInput = document.getElementById("auditTargetId");
  const dateFromInput = document.getElementById("auditDateFrom");
  const dateToInput = document.getElementById("auditDateTo");
  const limitInput = document.getElementById("auditLimit");

  if (actionInput) actionInput.value = String(filters.action || "");
  if (userIdInput) userIdInput.value = filters.userId ? String(filters.userId) : "";
  if (targetTypeInput) targetTypeInput.value = String(filters.targetType || "");
  if (targetIdInput) targetIdInput.value = filters.targetId ? String(filters.targetId) : "";
  if (dateFromInput) dateFromInput.value = String(filters.dateFrom || "");
  if (dateToInput) dateToInput.value = String(filters.dateTo || "");
  if (limitInput) limitInput.value = String(filters.limit || 20);
}

function getAuditEndpointForCurrentUser() {
  return canUseAdminAuditEndpoint() ? "/api/audit-logs" : "/api/system/audit-trail";
}

function syncAuditFilterAccess() {
  const targetTypeInput = document.getElementById("auditTargetType");
  const targetIdInput = document.getElementById("auditTargetId");
  const canUseTargetFilters = canUseAdminAuditEndpoint();

  if (targetTypeInput) {
    targetTypeInput.disabled = !canUseTargetFilters;
    if (!canUseTargetFilters) {
      targetTypeInput.value = "";
    }
  }

  if (targetIdInput) {
    targetIdInput.disabled = !canUseTargetFilters;
    if (!canUseTargetFilters) {
      targetIdInput.value = "";
    }
  }
}

function renderAuditTrail(entries) {
  if (!auditTrailRows) {
    return;
  }

  clearElement(auditTrailRows);
  if (!Array.isArray(entries) || entries.length === 0) {
    renderEmptyRow(auditTrailRows, 9, "No audit entries for the selected filters.");
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(entry.id ?? "-")));
    row.appendChild(createCell("td", formatDateTime(entry.created_at)));
    row.appendChild(createCell("td", String(entry.user_id ?? "-")));
    row.appendChild(createCell("td", String(entry.user_name || entry.user_email || "-")));
    row.appendChild(createCell("td", String(entry.action || "-")));
    row.appendChild(createCell("td", String(entry.target_type || "-")));
    row.appendChild(createCell("td", String(entry.target_id ?? "-")));
    row.appendChild(createCell("td", String(entry.ip_address || "-")));
    row.appendChild(createPreformattedCell(formatCompactJson(entry.details)));
    auditTrailRows.appendChild(row);
  });
}

async function loadAuditTrailPanel(filters = auditTrailFilters) {
  const query = new URLSearchParams();
  if (filters.action) query.set("action", filters.action);
  if (filters.userId) query.set("userId", String(filters.userId));
  if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) query.set("dateTo", filters.dateTo);
  if (filters.limit) query.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") query.set("offset", String(filters.offset));
  if (filters.sortBy) query.set("sortBy", String(filters.sortBy));
  if (filters.sortOrder) query.set("sortOrder", String(filters.sortOrder));

  if (canUseAdminAuditEndpoint()) {
    if (filters.targetType) query.set("targetType", filters.targetType);
    if (filters.targetId) query.set("targetId", String(filters.targetId));
  }

  const endpoint = getAuditEndpointForCurrentUser();
  const result = await api(`${endpoint}?${query.toString()}`);
  const rows = Array.isArray(result?.data) ? result.data : [];
  const pagination = result?.pagination || {};

  renderAuditTrail(rows);
  if (auditTrailMeta) {
    const sortLabel = `${String(filters.sortBy || "id")} ${String(filters.sortOrder || "desc").toUpperCase()}`;
    auditTrailMeta.textContent = `Loaded ${formatNumber(rows.length)} audit row(s) from ${endpoint} · Sort: ${sortLabel}.`;
  }
  setAuditPaginationMeta(
    pagination.total ?? rows.length,
    pagination.limit ?? filters.limit,
    pagination.offset ?? filters.offset,
    auditTrailPageMeta,
    auditTrailPrevBtn,
    auditTrailNextBtn,
  );

  auditTrailFilters = {
    ...filters,
    limit: Number(pagination.limit ?? filters.limit ?? 20) || 20,
    offset: Number(pagination.offset ?? filters.offset ?? 0) || 0,
    sortBy: String(pagination.sortBy || filters.sortBy || "id"),
    sortOrder: String(pagination.sortOrder || filters.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc",
  };
  updateTableSortState(auditTrailRows, auditTrailFilters);

  return result;
}

function resetAuditTrailPanelState({ signedIn = false } = {}) {
  const defaults = {
    action: "",
    userId: null,
    targetType: "",
    targetId: null,
    dateFrom: null,
    dateTo: null,
    limit: 20,
    offset: 0,
    sortBy: "id",
    sortOrder: "desc",
  };
  auditTrailFilters = { ...defaults };
  applyAuditFilterValues(defaults);
  syncAuditFilterAccess();
  if (auditTrailRows) {
    renderEmptyRow(auditTrailRows, 9, signedIn ? "Load audit logs to view entries." : "Sign in to view audit trail.");
  }
  if (auditTrailMeta) {
    auditTrailMeta.textContent = signedIn
      ? "Load audit entries by action, actor, date, and target."
      : "Sign in to view audit entries.";
  }
  setAuditPaginationMeta(0, defaults.limit, 0, auditTrailPageMeta, auditTrailPrevBtn, auditTrailNextBtn);
  updateTableSortState(auditTrailRows, defaults);
}

function readHierarchyEventFilters({ preserveOffset = false } = {}) {
  const eventTypeInput = document.getElementById("hierarchyEventType");
  const scopeLevelInput = document.getElementById("hierarchyScopeLevel");
  const regionIdInput = document.getElementById("hierarchyRegionId");
  const branchIdInput = document.getElementById("hierarchyBranchId");
  const actorUserIdInput = document.getElementById("hierarchyActorUserId");
  const dateFromInput = document.getElementById("hierarchyDateFrom");
  const dateToInput = document.getElementById("hierarchyDateTo");
  const limitInput = document.getElementById("hierarchyLimit");

  const range = readDateRangeFilters(dateFromInput, dateToInput);
  const limit = Number(limitInput?.value || 20);
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;

  return {
    eventType: String(eventTypeInput?.value || "").trim().toLowerCase(),
    scopeLevel: String(scopeLevelInput?.value || "").trim().toLowerCase(),
    regionId: optionalPositiveInteger(regionIdInput, "Region ID"),
    branchId: optionalPositiveInteger(branchIdInput, "Branch ID"),
    actorUserId: optionalPositiveInteger(actorUserIdInput, "Actor user ID"),
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    limit: normalizedLimit,
    offset: preserveOffset ? Math.max(Number(hierarchyEventFilters?.offset || 0), 0) : 0,
    sortBy: String(hierarchyEventFilters?.sortBy || "id"),
    sortOrder: String(hierarchyEventFilters?.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc",
  };
}

function applyHierarchyEventFilterValues(filters = {}) {
  const eventTypeInput = document.getElementById("hierarchyEventType");
  const scopeLevelInput = document.getElementById("hierarchyScopeLevel");
  const regionIdInput = document.getElementById("hierarchyRegionId");
  const branchIdInput = document.getElementById("hierarchyBranchId");
  const actorUserIdInput = document.getElementById("hierarchyActorUserId");
  const dateFromInput = document.getElementById("hierarchyDateFrom");
  const dateToInput = document.getElementById("hierarchyDateTo");
  const limitInput = document.getElementById("hierarchyLimit");

  if (eventTypeInput) eventTypeInput.value = String(filters.eventType || "");
  if (scopeLevelInput) scopeLevelInput.value = String(filters.scopeLevel || "");
  if (regionIdInput) regionIdInput.value = filters.regionId ? String(filters.regionId) : "";
  if (branchIdInput) branchIdInput.value = filters.branchId ? String(filters.branchId) : "";
  if (actorUserIdInput) actorUserIdInput.value = filters.actorUserId ? String(filters.actorUserId) : "";
  if (dateFromInput) dateFromInput.value = String(filters.dateFrom || "");
  if (dateToInput) dateToInput.value = String(filters.dateTo || "");
  if (limitInput) limitInput.value = String(filters.limit || 20);
}

function renderHierarchyEvents(entries) {
  if (!hierarchyEventRows) {
    return;
  }

  clearElement(hierarchyEventRows);
  if (!Array.isArray(entries) || entries.length === 0) {
    renderEmptyRow(hierarchyEventRows, 8, "No hierarchy events for the selected filters.");
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("tr");
    const actorLabel = entry.actor_user_name
      ? `${entry.actor_user_name}${entry.actor_user_email ? ` (${entry.actor_user_email})` : ""}`
      : (entry.actor_user_id ? `User #${entry.actor_user_id}` : "-");

    row.appendChild(createCell("td", String(entry.id ?? "-")));
    row.appendChild(createCell("td", formatDateTime(entry.created_at)));
    row.appendChild(createCell("td", String(entry.event_type || "-")));
    row.appendChild(createCell("td", String(entry.scope_level || "-")));
    row.appendChild(createCell("td", entry.region_name ? `${entry.region_name} (#${entry.region_id ?? "-"})` : (entry.region_id ? `#${entry.region_id}` : "-")));
    row.appendChild(createCell("td", entry.branch_name ? `${entry.branch_name} (#${entry.branch_id ?? "-"})` : (entry.branch_id ? `#${entry.branch_id}` : "-")));
    row.appendChild(createCell("td", actorLabel));
    row.appendChild(createPreformattedCell(formatCompactJson(entry.details)));
    hierarchyEventRows.appendChild(row);
  });
}

async function loadHierarchyEventsPanel(filters = hierarchyEventFilters) {
  const query = new URLSearchParams();
  if (filters.eventType) query.set("eventType", filters.eventType);
  if (filters.scopeLevel) query.set("scopeLevel", filters.scopeLevel);
  if (filters.regionId) query.set("regionId", String(filters.regionId));
  if (filters.branchId) query.set("branchId", String(filters.branchId));
  if (filters.actorUserId) query.set("actorUserId", String(filters.actorUserId));
  if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) query.set("dateTo", filters.dateTo);
  if (filters.limit) query.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") query.set("offset", String(filters.offset));
  if (filters.sortBy) query.set("sortBy", String(filters.sortBy));
  if (filters.sortOrder) query.set("sortOrder", String(filters.sortOrder));

  const result = await api(`/api/hierarchy-events?${query.toString()}`);
  const rows = Array.isArray(result?.data) ? result.data : [];
  const pagination = result?.pagination || {};

  renderHierarchyEvents(rows);
  if (hierarchyEventsMeta) {
    const sortLabel = `${String(filters.sortBy || "id")} ${String(filters.sortOrder || "desc").toUpperCase()}`;
    hierarchyEventsMeta.textContent = `Loaded ${formatNumber(rows.length)} hierarchy event(s) · Sort: ${sortLabel}.`;
  }
  setAuditPaginationMeta(
    pagination.total ?? rows.length,
    pagination.limit ?? filters.limit,
    pagination.offset ?? filters.offset,
    hierarchyEventsPageMeta,
    hierarchyEventsPrevBtn,
    hierarchyEventsNextBtn,
  );

  hierarchyEventFilters = {
    ...filters,
    limit: Number(pagination.limit ?? filters.limit ?? 20) || 20,
    offset: Number(pagination.offset ?? filters.offset ?? 0) || 0,
    sortBy: String(pagination.sortBy || filters.sortBy || "id"),
    sortOrder: String(pagination.sortOrder || filters.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc",
  };
  updateTableSortState(hierarchyEventRows, hierarchyEventFilters);
  return result;
}

function resetHierarchyEventsPanelState({ signedIn = false } = {}) {
  const defaults = {
    eventType: "",
    scopeLevel: "",
    regionId: null,
    branchId: null,
    actorUserId: null,
    dateFrom: null,
    dateTo: null,
    limit: 20,
    offset: 0,
    sortBy: "id",
    sortOrder: "desc",
  };
  hierarchyEventFilters = { ...defaults };
  applyHierarchyEventFilterValues(defaults);
  if (hierarchyEventRows) {
    renderEmptyRow(hierarchyEventRows, 8, signedIn ? "Load hierarchy events to view entries." : "Sign in to view hierarchy events.");
  }
  if (hierarchyEventsMeta) {
    hierarchyEventsMeta.textContent = signedIn
      ? "Filter hierarchy events by scope, actor, and date."
      : "Sign in as admin to view hierarchy events.";
  }
  setAuditPaginationMeta(0, defaults.limit, 0, hierarchyEventsPageMeta, hierarchyEventsPrevBtn, hierarchyEventsNextBtn);
  updateTableSortState(hierarchyEventRows, defaults);
}

function resetSystemBackupSummary() {
  if (!systemBackupSummary) {
    return;
  }
  clearElement(systemBackupSummary);
}

function renderSystemPanelOutput(container, payload, emptyMessage) {
  if (!container) {
    return;
  }
  clearElement(container);
  if (!payload || typeof payload !== "object") {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }
  renderReportPayload(container, payload);
}

async function loadSystemConfigStatusPanel() {
  const payload = await api("/api/system/config-status");
  renderSystemPanelOutput(systemConfigStatusOutput, payload, "Configuration status is unavailable.");
  return payload;
}

async function loadSystemMetricsPanel() {
  const payload = await api("/api/system/metrics");
  renderSystemPanelOutput(systemMetricsOutput, payload, "System metrics are unavailable.");
  return payload;
}

async function runSystemBackup() {
  const payload = await api("/api/system/backup", { method: "POST" });
  resetSystemBackupSummary();
  if (systemBackupSummary) {
    appendMetric(systemBackupSummary, "Message", String(payload?.message || "Database backup completed."));
    appendMetric(systemBackupSummary, "Backup Path", String(payload?.backupPath || "-"));
    appendMetric(systemBackupSummary, "Created At", formatDateTime(payload?.createdAt));
    const deletedCount = Array.isArray(payload?.deletedFiles) ? payload.deletedFiles.length : 0;
    appendMetric(systemBackupSummary, "Pruned Files", formatNumber(deletedCount));
  }
  if (systemBackupMeta) {
    systemBackupMeta.textContent = String(payload?.message || "Database backup completed.");
  }
  return payload;
}

function resetSystemPanelState({ signedIn = false } = {}) {
  if (systemConfigStatusOutput) {
    clearElement(systemConfigStatusOutput);
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = signedIn ? "Refresh Config to load runtime configuration." : "Sign in as admin to view runtime configuration.";
    systemConfigStatusOutput.appendChild(message);
  }
  if (systemMetricsOutput) {
    clearElement(systemMetricsOutput);
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = signedIn ? "Refresh Metrics to load system performance data." : "Sign in as admin to view system metrics.";
    systemMetricsOutput.appendChild(message);
  }
  resetSystemBackupSummary();
  if (systemBackupMeta) {
    systemBackupMeta.textContent = signedIn
      ? "Run an on-demand backup from this panel."
      : "Sign in as admin to run on-demand backups.";
  }
}

function canViewFinanceWorkspace(user = currentUser) {
  const role = String(user?.role || "").trim().toLowerCase();
  return financeViewRoles.has(role);
}

function readDateRangeWithBranch(dateFromInput, dateToInput, branchInput) {
  const range = readDateRangeFilters(dateFromInput, dateToInput);
  const normalizedRange = normalizeDateRangeFilters(range, dateFromInput, dateToInput);
  const branchRaw = String(branchInput?.value || "").trim();
  const branchId = branchRaw ? Number(branchRaw) : null;
  if (branchRaw && (!Number.isInteger(branchId) || branchId <= 0)) {
    throwFieldValidationError(branchInput, "Choose a valid branch");
  }
  return {
    dateFrom: normalizedRange.dateFrom,
    dateTo: normalizedRange.dateTo,
    branchId,
  };
}

function buildGlQuery(filters = {}, format = null) {
  const query = new URLSearchParams();
  if (filters?.dateFrom) {
    query.set("dateFrom", String(filters.dateFrom));
  }
  if (filters?.dateTo) {
    query.set("dateTo", String(filters.dateTo));
  }
  if (filters?.branchId) {
    query.set("branchId", String(filters.branchId));
  }
  if (format) {
    query.set("format", String(format).toLowerCase());
  }
  return query.toString();
}

async function downloadAuthenticatedFile(url, fallbackFilename) {
  const response = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      throw new Error(payload?.message || "Download failed");
    }
    throw new Error("Download failed");
  }

  const blob = await response.blob();
  const filename = extractFilenameFromDisposition(response.headers.get("content-disposition"), fallbackFilename);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

function populateGlBranchSelectors() {
  const branchSelectors = [
    document.getElementById("glTrialBranchId"),
    document.getElementById("glIncomeBranchId"),
    document.getElementById("glCashBranchId"),
    document.getElementById("glStatementBranchId"),
  ];
  branchSelectors.forEach((select) => {
    if (!select) {
      return;
    }
    const previous = String(select.value || "").trim();
    setSelectOptions(select, reportHubBranchOptions, "All branches");
    if (previous) {
      const exists = reportHubBranchOptions.some((option) => String(option.value) === previous);
      if (exists) {
        select.value = previous;
      }
    }
  });
}

function renderGlAccounts(accounts) {
  if (!glAccountsRows) {
    return;
  }
  clearElement(glAccountsRows);
  if (!accounts || accounts.length === 0) {
    renderEmptyRow(glAccountsRows, 6, "No GL accounts available.");
    return;
  }

  accounts.forEach((account) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(account.id ?? "-")));
    row.appendChild(createCell("td", String(account.code || "-")));
    row.appendChild(createCell("td", String(account.name || "-")));
    row.appendChild(createCell("td", String(account.account_type || "-")));
    row.appendChild(createCell("td", Number(account.is_contra || 0) === 1 ? "Yes" : "No"));
    row.appendChild(createCell("td", Number(account.is_active || 0) === 1 ? "Active" : "Inactive"));
    glAccountsRows.appendChild(row);
  });
}

function populateGlAccountSelector() {
  const statementAccountSelect = document.getElementById("glStatementAccountId");
  if (!statementAccountSelect) {
    return;
  }
  const options = glAccountCatalog.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  }));
  setSelectOptions(statementAccountSelect, options, "Select account");
}

async function loadGlAccountsPanel() {
  const accounts = await api("/api/reports/gl/accounts");
  glAccountCatalog = Array.isArray(accounts) ? accounts : [];
  renderGlAccounts(glAccountCatalog);
  populateGlAccountSelector();
}

function renderGlTrialBalance(result, filters = {}) {
  if (glTrialRows) {
    clearElement(glTrialRows);
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    if (rows.length === 0) {
      renderEmptyRow(glTrialRows, 6, "No trial balance rows for the selected filters.");
    } else {
      rows.forEach((item) => {
        const row = document.createElement("tr");
        row.appendChild(createCell("td", String(item.code || "-")));
        row.appendChild(createCell("td", String(item.name || "-")));
        row.appendChild(createCell("td", String(item.account_type || "-")));
        row.appendChild(createCell("td", formatCurrency(item.debits ?? 0)));
        row.appendChild(createCell("td", formatCurrency(item.credits ?? 0)));
        row.appendChild(createCell("td", formatCurrency(item.net ?? 0)));
        glTrialRows.appendChild(row);
      });
    }
  }

  if (glTrialSummary) {
    clearElement(glTrialSummary);
    appendMetric(glTrialSummary, "Total Debits", formatCurrency(result?.totals?.debits ?? 0));
    appendMetric(glTrialSummary, "Total Credits", formatCurrency(result?.totals?.credits ?? 0));
    appendMetric(glTrialSummary, "Balanced", result?.balanced ? "Yes" : "No");
  }

  if (glTrialMeta) {
    glTrialMeta.textContent = `Trial balance for ${formatDateRangeLabel(filters)}${filters.branchId ? `, branch #${filters.branchId}` : ""}.`;
  }
}

async function loadGlTrialBalance(filters) {
  const querySuffix = buildGlQuery(filters);
  const result = await api(`/api/reports/gl/trial-balance${querySuffix ? `?${querySuffix}` : ""}`);
  renderGlTrialBalance(result, filters);
  return result;
}

function renderGlIncomeStatement(result, filters = {}) {
  if (glIncomeSummary) {
    clearElement(glIncomeSummary);
    const summary = result?.summary || {};
    appendMetric(glIncomeSummary, "Interest Income", formatCurrency(summary.interest_income ?? 0));
    appendMetric(glIncomeSummary, "Fee Income", formatCurrency(summary.fee_income ?? 0));
    appendMetric(glIncomeSummary, "Write-off Expense", formatCurrency(summary.write_off_expense ?? 0));
    appendMetric(glIncomeSummary, "Net Interest After Write-offs", formatCurrency(summary.net_interest_after_write_off ?? 0));
    appendMetric(glIncomeSummary, "Net Operating Income", formatCurrency(summary.net_operating_income ?? 0));
  }
  if (glIncomeMeta) {
    glIncomeMeta.textContent = `Income statement for ${formatDateRangeLabel(filters)}${filters.branchId ? `, branch #${filters.branchId}` : ""}.`;
  }
}

async function loadGlIncomeStatement(filters) {
  const querySuffix = buildGlQuery(filters);
  const result = await api(`/api/reports/gl/income-statement${querySuffix ? `?${querySuffix}` : ""}`);
  renderGlIncomeStatement(result, filters);
  return result;
}

function renderGlCashFlow(result, filters = {}) {
  if (glCashSummary) {
    clearElement(glCashSummary);
    appendMetric(glCashSummary, "Total Disbursements", formatCurrency(result?.totals?.disbursements ?? 0));
    appendMetric(glCashSummary, "Total Repayments", formatCurrency(result?.totals?.repayments ?? 0));
    appendMetric(glCashSummary, "Net Cash Flow", formatCurrency(result?.totals?.net_cash_flow ?? 0));
  }

  if (glCashRows) {
    clearElement(glCashRows);
    const dailyRows = Array.isArray(result?.daily) ? result.daily : [];
    if (dailyRows.length === 0) {
      renderEmptyRow(glCashRows, 4, "No cash flow rows for the selected filters.");
    } else {
      dailyRows.forEach((item) => {
        const row = document.createElement("tr");
        row.appendChild(createCell("td", formatDate(item.date)));
        row.appendChild(createCell("td", formatCurrency(item.disbursements ?? 0)));
        row.appendChild(createCell("td", formatCurrency(item.repayments ?? 0)));
        row.appendChild(createCell("td", formatCurrency(item.net_cash_flow ?? 0)));
        glCashRows.appendChild(row);
      });
    }
  }

  if (glCashMeta) {
    glCashMeta.textContent = `Cash flow for ${formatDateRangeLabel(filters)}${filters.branchId ? `, branch #${filters.branchId}` : ""}.`;
  }
}

async function loadGlCashFlow(filters) {
  const querySuffix = buildGlQuery(filters);
  const result = await api(`/api/reports/gl/cash-flow${querySuffix ? `?${querySuffix}` : ""}`);
  renderGlCashFlow(result, filters);
  return result;
}

function renderGlAccountStatement(result, filters = {}) {
  if (glStatementSummary) {
    clearElement(glStatementSummary);
    appendMetric(glStatementSummary, "Account", `${result?.account?.code || "-"} - ${result?.account?.name || "-"}`);
    appendMetric(glStatementSummary, "Entry Count", formatNumber(result?.summary?.entry_count ?? 0));
    appendMetric(glStatementSummary, "Total Debits", formatCurrency(result?.summary?.total_debits ?? 0));
    appendMetric(glStatementSummary, "Total Credits", formatCurrency(result?.summary?.total_credits ?? 0));
    appendMetric(glStatementSummary, "Closing Balance", formatCurrency(result?.summary?.closing_balance ?? 0));
  }

  if (glStatementRows) {
    clearElement(glStatementRows);
    const entries = Array.isArray(result?.entries) ? result.entries : [];
    if (entries.length === 0) {
      renderEmptyRow(glStatementRows, 8, "No account statement entries for the selected filters.");
    } else {
      entries.forEach((entry) => {
        const row = document.createElement("tr");
        row.appendChild(createCell("td", String(entry.id ?? "-")));
        row.appendChild(createCell("td", formatDateTime(entry.posted_at)));
        row.appendChild(createCell("td", String(entry.reference_type || "-")));
        row.appendChild(createCell("td", String(entry.branch_name || "-")));
        row.appendChild(createCell("td", formatCurrency(entry.debit_amount ?? 0)));
        row.appendChild(createCell("td", formatCurrency(entry.credit_amount ?? 0)));
        row.appendChild(createCell("td", formatCurrency(entry.entry_effect ?? 0)));
        row.appendChild(createCell("td", formatCurrency(entry.running_balance ?? 0)));
        glStatementRows.appendChild(row);
      });
    }
  }

  if (glStatementMeta) {
    glStatementMeta.textContent = `Statement for ${formatDateRangeLabel(filters)}${filters.branchId ? `, branch #${filters.branchId}` : ""}.`;
  }
}

async function loadGlAccountStatement(filters) {
  const accountId = Number(filters?.accountId);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("Select a valid GL account");
  }
  const querySuffix = buildGlQuery(filters);
  const result = await api(`/api/reports/gl/accounts/${accountId}/statement${querySuffix ? `?${querySuffix}` : ""}`);
  renderGlAccountStatement(result, filters);
  return result;
}

function syncLifecycleActionAccessState() {
  if (!loanLifecycleForm) {
    return;
  }
  const role = getCurrentRoleKey();
  const buttons = loanLifecycleForm.querySelectorAll("button[data-lifecycle-action]");
  buttons.forEach((button) => {
    const action = String(button.dataset.lifecycleAction || "").trim();
    let allowed = false;
    if (action === "approve" || action === "reject") {
      allowed = checkerRoles.has(role);
    } else if (action === "write-off") {
      allowed = writeOffRoles.has(role);
    } else if (action === "restructure") {
      allowed = restructureRoles.has(role);
    } else if (action === "archive") {
      allowed = archiveRoles.has(role);
    }
    button.disabled = !allowed;
  });
}

function syncLifecycleBranchSelectorOptions() {
  const branchSelector = document.getElementById("pendingApprovalBranchId");
  if (!branchSelector) {
    return;
  }
  const previousValue = String(branchSelector.value || "").trim();
  setSelectOptions(branchSelector, reportHubBranchOptions, "All branches");
  if (previousValue) {
    const exists = reportHubBranchOptions.some((option) => String(option.value) === previousValue);
    if (exists) {
      branchSelector.value = previousValue;
    }
  }
}

function readPendingApprovalFilters() {
  const dateFromInput = document.getElementById("pendingApprovalDateFrom");
  const dateToInput = document.getElementById("pendingApprovalDateTo");
  const branchIdInput = document.getElementById("pendingApprovalBranchId");
  const range = readDateRangeFilters(dateFromInput, dateToInput);
  const normalizedRange = normalizeDateRangeFilters(range, dateFromInput, dateToInput);
  const branchRaw = String(branchIdInput?.value || "").trim();
  const branchId = branchRaw ? Number(branchRaw) : null;
  if (branchRaw && (!Number.isInteger(branchId) || branchId <= 0)) {
    throwFieldValidationError(branchIdInput, "Choose a valid branch");
  }
  return {
    dateFrom: normalizedRange.dateFrom,
    dateTo: normalizedRange.dateTo,
    branchId,
  };
}

function renderPendingApprovalRows(result, filters = {}) {
  if (!pendingApprovalRows) {
    return;
  }
  clearElement(pendingApprovalRows);
  const rows = Array.isArray(result?.data) ? result.data : [];
  if (rows.length === 0) {
    renderEmptyRow(pendingApprovalRows, 8, "No pending approval loans found.");
  } else {
    rows.forEach((item) => {
      const row = document.createElement("tr");
      row.appendChild(createCell("td", String(item.loan_id || item.id || "-")));
      row.appendChild(createCell("td", String(item.client_name || "-")));
      row.appendChild(createCell("td", formatCurrency(item.principal || 0)));
      row.appendChild(createCell("td", formatCurrency(item.expected_total || 0)));
      row.appendChild(createCell("td", String(item.branch_code || item.branch_name || "-")));
      row.appendChild(createCell("td", String(item.officer_name || "-")));
      row.appendChild(createCell("td", formatDateTime(item.submitted_at || item.created_at)));

      const actionCell = document.createElement("td");
      const loanId = Number(item.loan_id || item.id);

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "secondary";
      openButton.dataset.action = "lifecycle-open";
      openButton.dataset.loanId = String(loanId || "");
      openButton.textContent = "Open";
      actionCell.appendChild(openButton);

      const approveButton = document.createElement("button");
      approveButton.type = "button";
      approveButton.className = "secondary";
      approveButton.dataset.action = "lifecycle-approve";
      approveButton.dataset.loanId = String(loanId || "");
      approveButton.textContent = "Approve";
      approveButton.disabled = !checkerRoles.has(getCurrentRoleKey());
      actionCell.appendChild(approveButton);

      const rejectButton = document.createElement("button");
      rejectButton.type = "button";
      rejectButton.className = "secondary";
      rejectButton.dataset.action = "lifecycle-reject";
      rejectButton.dataset.loanId = String(loanId || "");
      rejectButton.textContent = "Reject";
      rejectButton.disabled = !checkerRoles.has(getCurrentRoleKey());
      actionCell.appendChild(rejectButton);

      row.appendChild(actionCell);
      pendingApprovalRows.appendChild(row);
    });
  }

  if (pendingApprovalMeta) {
    const total = Number(result?.paging?.total ?? rows.length);
    pendingApprovalMeta.textContent = `Showing ${formatNumber(rows.length)} of ${formatNumber(total)} pending approvals for ${formatDateRangeLabel(filters)}${filters.branchId ? `, branch #${filters.branchId}` : ""}.`;
  }
}

async function loadPendingApprovalQueue(filters = null) {
  const appliedFilters = filters || readPendingApprovalFilters();
  const query = new URLSearchParams();
  query.set("limit", "200");
  query.set("sortBy", "submittedAt");
  query.set("sortOrder", "desc");
  if (appliedFilters.dateFrom) {
    query.set("dateFrom", appliedFilters.dateFrom);
  }
  if (appliedFilters.dateTo) {
    query.set("dateTo", appliedFilters.dateTo);
  }
  if (appliedFilters.branchId) {
    query.set("branchId", String(appliedFilters.branchId));
  }
  const result = await api(`/api/loans/pending-approval?${query.toString()}`);
  renderPendingApprovalRows(result, appliedFilters);
  return result;
}

function setLifecycleLoanId(loanId) {
  const parsedId = Number(loanId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return;
  }
  selectedLifecycleLoanId = parsedId;
  const lifecycleLoanIdInput = document.getElementById("lifecycleLoanId");
  if (lifecycleLoanIdInput) {
    lifecycleLoanIdInput.value = String(parsedId);
  }
  if (loanLifecycleMeta) {
    loanLifecycleMeta.textContent = `Selected loan #${parsedId}.`;
  }
}

function readLifecycleLoanId() {
  const lifecycleLoanIdInput = document.getElementById("lifecycleLoanId");
  const loanId = Number(lifecycleLoanIdInput?.value || 0);
  if (!Number.isInteger(loanId) || loanId <= 0) {
    throwFieldValidationError(lifecycleLoanIdInput, "Enter a valid loan ID");
  }
  return loanId;
}

function renderLoanStatementPanel(payload) {
  if (loanStatementSummary) {
    clearElement(loanStatementSummary);
    const summary = payload?.summary || {};
    appendMetric(loanStatementSummary, "Total Due", formatCurrency(summary.total_due || 0));
    appendMetric(loanStatementSummary, "Total Paid", formatCurrency(summary.total_paid || 0));
    appendMetric(loanStatementSummary, "Outstanding", formatCurrency(summary.total_outstanding || 0));
    appendMetric(loanStatementSummary, "Repayment Count", formatNumber(summary.repayment_count || 0));
    appendMetric(loanStatementSummary, "Penalty Accrued", formatCurrency(payload?.breakdown?.penalty_amount_accrued || 0));
  }

  if (loanStatementRows) {
    clearElement(loanStatementRows);
    const rows = Array.isArray(payload?.amortization) ? payload.amortization : [];
    if (rows.length === 0) {
      renderEmptyRow(loanStatementRows, 7, "No statement schedule rows for this loan.");
    } else {
      rows.forEach((item) => {
        const row = document.createElement("tr");
        row.appendChild(createCell("td", String(item.installment_number || "-")));
        row.appendChild(createCell("td", formatDate(item.due_date)));
        row.appendChild(createCell("td", String(item.status || "-")));
        row.appendChild(createCell("td", formatCurrency(item.amount_due || 0)));
        row.appendChild(createCell("td", formatCurrency(item.amount_paid || 0)));
        row.appendChild(createCell("td", formatCurrency(item.amount_outstanding || 0)));
        row.appendChild(createCell("td", formatCurrency(item.penalty_amount_accrued || 0)));
        loanStatementRows.appendChild(row);
      });
    }
  }
}

async function loadLoanStatementForLifecycle(loanId) {
  const result = await api(`/api/loans/${loanId}/statement`);
  renderLoanStatementPanel(result);
  return result;
}

async function downloadLoanStatementJson(loanId) {
  const payload = await api(`/api/loans/${loanId}/statement`);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `loan-${loanId}-statement.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function renderLoanCollateralTables(collaterals, guarantors) {
  if (loanCollateralRows) {
    clearElement(loanCollateralRows);
    if (!collaterals || collaterals.length === 0) {
      renderEmptyRow(loanCollateralRows, 5, "No collaterals linked to this loan.");
    } else {
      collaterals.forEach((item) => {
        const row = document.createElement("tr");
        row.appendChild(createCell("td", String(item.asset_type || "-")));
        row.appendChild(createCell("td", String(item.description || "-")));
        row.appendChild(createCell("td", formatCurrency(item.estimated_value || 0)));
        row.appendChild(createCell("td", formatCurrency(item.forced_sale_value || 0)));
        row.appendChild(createCell("td", String(item.status || "-")));
        loanCollateralRows.appendChild(row);
      });
    }
  }

  if (loanGuarantorRows) {
    clearElement(loanGuarantorRows);
    if (!guarantors || guarantors.length === 0) {
      renderEmptyRow(loanGuarantorRows, 5, "No guarantors linked to this loan.");
    } else {
      guarantors.forEach((item) => {
        const row = document.createElement("tr");
        row.appendChild(createCell("td", String(item.full_name || "-")));
        row.appendChild(createCell("td", String(item.phone || "-")));
        row.appendChild(createCell("td", String(item.national_id || "-")));
        row.appendChild(createCell("td", formatCurrency(item.guarantee_amount || 0)));
        row.appendChild(createCell("td", String(item.liability_type || "-")));
        loanGuarantorRows.appendChild(row);
      });
    }
  }
}

async function loadLoanCollateralSnapshot(loanId) {
  const [collaterals, guarantors] = await Promise.all([
    api(`/api/loans/${loanId}/collaterals`).catch(() => []),
    api(`/api/loans/${loanId}/guarantors`).catch(() => []),
  ]);
  const collateralRows = Array.isArray(collaterals) ? collaterals : (Array.isArray(collaterals?.data) ? collaterals.data : []);
  const guarantorRows = Array.isArray(guarantors) ? guarantors : (Array.isArray(guarantors?.data) ? guarantors.data : []);
  renderLoanCollateralTables(
    collateralRows,
    guarantorRows,
  );
}

function buildLifecycleActionPayload(actionKey) {
  const note = String(document.getElementById("lifecycleNote")?.value || "").trim();
  const rejectReason = String(document.getElementById("lifecycleRejectReason")?.value || "").trim();
  const newTermWeeksRaw = String(document.getElementById("lifecycleNewTermWeeks")?.value || "").trim();
  const waiveInterest = Boolean(document.getElementById("lifecycleWaiveInterest")?.checked);

  if (actionKey === "reject") {
    if (!rejectReason || rejectReason.length < 5) {
      throw new Error("Reject reason must be at least 5 characters");
    }
    return { reason: rejectReason };
  }

  if (actionKey === "restructure") {
    const newTermWeeks = Number(newTermWeeksRaw);
    if (!Number.isInteger(newTermWeeks) || newTermWeeks <= 0) {
      throw new Error("Restructure term must be a positive whole number");
    }
    return { newTermWeeks, note: note || undefined, waiveInterest };
  }

  return { note: note || undefined };
}

async function executeLifecycleAction(actionKey, loanId) {
  const role = getCurrentRoleKey();
  if (actionKey === "approve" && !checkerRoles.has(role)) {
    throw new Error("Your role cannot approve loans");
  }
  if (actionKey === "reject" && !checkerRoles.has(role)) {
    throw new Error("Your role cannot reject loans");
  }
  if (actionKey === "write-off" && !writeOffRoles.has(role)) {
    throw new Error("Your role cannot write off loans");
  }
  if (actionKey === "restructure" && !restructureRoles.has(role)) {
    throw new Error("Your role cannot restructure loans");
  }
  if (actionKey === "archive" && !archiveRoles.has(role)) {
    throw new Error("Your role cannot archive loans");
  }

  const routeByAction = {
    approve: "approve",
    reject: "reject",
    restructure: "restructure",
    "write-off": "write-off",
    archive: "archive",
  };
  const route = routeByAction[actionKey];
  if (!route) {
    throw new Error("Unsupported lifecycle action");
  }

  const payload = buildLifecycleActionPayload(actionKey);
  const response = await api(`/api/loans/${loanId}/${route}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response;
}

function renderLoanProductsTable(products) {
  if (!loanProductRows) {
    return;
  }
  clearElement(loanProductRows);
  if (!products || products.length === 0) {
    renderEmptyRow(loanProductRows, 8, "No loan products found.");
    return;
  }
  products.forEach((item) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(item.id ?? "-")));
    row.appendChild(createCell("td", String(item.name || "-")));
    row.appendChild(createCell("td", formatPercent((Number(item.interest_rate || 0) || 0) / 100, { maximumFractionDigits: 2 })));
    row.appendChild(createCell("td", formatCurrency(item.registration_fee || 0)));
    row.appendChild(createCell("td", formatCurrency(item.processing_fee || 0)));
    row.appendChild(createCell("td", `${formatNumber(item.min_term_weeks || 0)}-${formatNumber(item.max_term_weeks || 0)} wks`));
    row.appendChild(createCell("td", Number(item.is_active || 0) === 1 ? "Active" : "Inactive"));

    const actionCell = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary";
    editBtn.dataset.action = "loan-product-edit";
    editBtn.dataset.productId = String(item.id);
    editBtn.dataset.name = String(item.name || "");
    editBtn.dataset.interestRate = String(item.interest_rate ?? "");
    editBtn.dataset.registrationFee = String(item.registration_fee ?? "");
    editBtn.dataset.processingFee = String(item.processing_fee ?? "");
    editBtn.dataset.minTermWeeks = String(item.min_term_weeks ?? "");
    editBtn.dataset.maxTermWeeks = String(item.max_term_weeks ?? "");
    editBtn.textContent = "Edit";
    actionCell.appendChild(editBtn);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "secondary";
    toggleBtn.dataset.action = Number(item.is_active || 0) === 1 ? "loan-product-deactivate" : "loan-product-activate";
    toggleBtn.dataset.productId = String(item.id);
    toggleBtn.textContent = Number(item.is_active || 0) === 1 ? "Deactivate" : "Activate";
    actionCell.appendChild(toggleBtn);

    row.appendChild(actionCell);
    loanProductRows.appendChild(row);
  });
}

async function loadLoanProductsPanel() {
  const result = await api("/api/loan-products?includeInactive=1");
  const products = Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);
  renderLoanProductsTable(products);
  if (loanProductMeta) {
    loanProductMeta.textContent = `Loaded ${formatNumber(products.length)} loan product(s).`;
  }
  return products;
}

function readLoanProductFormValues() {
  const nameInput = document.getElementById("loanProductName");
  const interestRateInput = document.getElementById("loanProductInterestRate");
  const registrationFeeInput = document.getElementById("loanProductRegistrationFee");
  const processingFeeInput = document.getElementById("loanProductProcessingFee");
  const minTermWeeksInput = document.getElementById("loanProductMinTermWeeks");
  const maxTermWeeksInput = document.getElementById("loanProductMaxTermWeeks");

  const name = requireNonEmptyText(nameInput, "Name");
  const interestRate = Number(String(interestRateInput?.value || "").trim());
  const registrationFee = Number(String(registrationFeeInput?.value || "").trim());
  const processingFee = Number(String(processingFeeInput?.value || "").trim());
  const minTermWeeks = requirePositiveInteger(minTermWeeksInput, "Min Term Weeks");
  const maxTermWeeks = requirePositiveInteger(maxTermWeeksInput, "Max Term Weeks");

  if (!Number.isFinite(interestRate) || interestRate < 0) {
    throwFieldValidationError(interestRateInput, "Interest rate must be zero or greater");
  }
  if (!Number.isFinite(registrationFee) || registrationFee < 0) {
    throwFieldValidationError(registrationFeeInput, "Registration fee must be zero or greater");
  }
  if (!Number.isFinite(processingFee) || processingFee < 0) {
    throwFieldValidationError(processingFeeInput, "Processing fee must be zero or greater");
  }
  if (maxTermWeeks < minTermWeeks) {
    throwFieldValidationError(maxTermWeeksInput, "Max term must be greater than or equal to min term");
  }

  return {
    name,
    interestRate,
    registrationFee,
    processingFee,
    minTermWeeks,
    maxTermWeeks,
  };
}

async function createLoanProduct(payload) {
  return api("/api/loan-products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function updateLoanProduct(productId, payload) {
  return api(`/api/loan-products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function setLoanProductActivation(productId, activate) {
  const route = activate ? "activate" : "deactivate";
  return api(`/api/loan-products/${productId}/${route}`, {
    method: "POST",
  });
}

function resetClientDetailPanels(message = "Select a client from the list to view detail and loan history.") {
  selectedClientId = null;
  selectedClientSnapshot = null;
  if (clientDetailMeta) {
    clientDetailMeta.textContent = message;
  }
  if (clientDetailSummary) {
    clearElement(clientDetailSummary);
  }
  if (clientHistoryLoanRows) {
    renderEmptyRow(clientHistoryLoanRows, 7, "No client selected.");
  }
  if (clientDetailDocumentsMeta) {
    clientDetailDocumentsMeta.textContent = "No document links available.";
  }
  if (clientDetailPhotoLink) {
    clientDetailPhotoLink.href = "#";
    clientDetailPhotoLink.classList.add("hidden");
  }
  if (clientDetailIdDocumentLink) {
    clientDetailIdDocumentLink.href = "#";
    clientDetailIdDocumentLink.classList.add("hidden");
  }
  if (clientDocumentMeta) {
    clientDocumentMeta.textContent = "Select a client first, then upload photo or ID document.";
  }
  if (clientEditForm) {
    clientEditForm.reset();
  }
  if (clientKycForm) {
    clientKycForm.reset();
  }
}

function buildClientListQuery() {
  const search = String(document.getElementById("clientMgmtSearch")?.value || "").trim();
  const minLoansRaw = String(document.getElementById("clientMgmtMinLoans")?.value || "").trim();
  const sortBy = String(document.getElementById("clientMgmtSortBy")?.value || "id").trim() || "id";
  const sortOrder = String(document.getElementById("clientMgmtSortOrder")?.value || "desc").trim().toLowerCase() === "asc"
    ? "asc"
    : "desc";

  const query = new URLSearchParams();
  query.set("limit", "200");
  query.set("sortBy", sortBy);
  query.set("sortOrder", sortOrder);
  if (search) {
    query.set("search", search);
  }
  if (minLoansRaw) {
    const minLoans = Number(minLoansRaw);
    if (!Number.isInteger(minLoans) || minLoans < 0) {
      throw new Error("Min Loans must be a whole number 0 or higher");
    }
    query.set("minLoans", String(minLoans));
  }
  return query.toString();
}

function renderClientManagementRowsTable(clients) {
  if (!clientManagementRows) {
    return;
  }
  clearElement(clientManagementRows);
  if (!clients || clients.length === 0) {
    renderEmptyRow(clientManagementRows, 9, "No clients matched the selected filters.");
    return;
  }

  clients.forEach((client) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(client.id ?? "-")));
    row.appendChild(createCell("td", String(client.full_name || "-")));
    row.appendChild(createCell("td", String(client.phone || "-")));
    row.appendChild(createCell("td", String(client.national_id || "-")));
    row.appendChild(createCell("td", String(client.branch_name || `#${client.branch_id || "-"}`)));
    row.appendChild(createCell("td", String(client.kyc_status || "pending")));
    row.appendChild(createCell("td", formatNumber(client.loan_count ?? 0)));
    row.appendChild(createCell("td", Number(client.is_active || 0) === 1 ? "Active" : "Inactive"));

    const actionCell = document.createElement("td");
    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.className = "secondary";
    detailButton.dataset.action = "open-client-detail";
    detailButton.dataset.clientId = String(client.id);
    detailButton.textContent = "Open";
    actionCell.appendChild(detailButton);
    row.appendChild(actionCell);
    clientManagementRows.appendChild(row);
  });
}

async function loadClientManagementList() {
  const query = buildClientListQuery();
  const result = await api(`/api/clients?${query}`);
  const rows = Array.isArray(result?.data) ? result.data : [];
  renderClientManagementRowsTable(rows);
  if (clientManagementMeta) {
    const total = Number(result?.paging?.total ?? rows.length);
    clientManagementMeta.textContent = `Showing ${formatNumber(rows.length)} of ${formatNumber(total)} clients.`;
  }
  return result;
}

function renderPotentialDuplicates(result) {
  if (!clientDuplicateRows) {
    return;
  }
  clearElement(clientDuplicateRows);
  const rows = Array.isArray(result?.duplicates) ? result.duplicates : [];
  if (rows.length === 0) {
    renderEmptyRow(clientDuplicateRows, 6, "No potential duplicates found.");
  } else {
    rows.forEach((item) => {
      const row = document.createElement("tr");
      row.appendChild(createCell("td", String(item.id ?? "-")));
      row.appendChild(createCell("td", String(item.full_name || "-")));
      row.appendChild(createCell("td", String(item.phone || "-")));
      row.appendChild(createCell("td", String(item.national_id || "-")));
      row.appendChild(createCell("td", formatNumber(item.matchScore ?? 0)));
      row.appendChild(createCell("td", Array.isArray(item.matchSignals) ? item.matchSignals.join(", ") : "-"));
      clientDuplicateRows.appendChild(row);
    });
  }
  if (clientDuplicateMeta) {
    clientDuplicateMeta.textContent = `Found ${formatNumber(result?.total ?? rows.length)} potential duplicate(s).`;
  }
}

function setClientEditFormValues(profile = {}, kycStatus = "pending") {
  const setValue = (id, value) => {
    const input = document.getElementById(id);
    if (input) {
      input.value = String(value ?? "");
    }
  };

  setValue("clientEditFullName", profile.full_name || "");
  setValue("clientEditPhone", profile.phone || "");
  setValue("clientEditNationalId", profile.national_id || "");
  setValue("clientEditKraPin", profile.kra_pin || "");
  setValue("clientEditBusinessType", profile.business_type || "");
  setValue("clientEditBusinessYears", profile.business_years ?? "");
  setValue("clientEditBusinessLocation", profile.business_location || "");
  setValue("clientEditResidentialAddress", profile.residential_address || "");
  setValue("clientEditNextKinName", profile.next_of_kin_name || "");
  setValue("clientEditNextKinPhone", profile.next_of_kin_phone || "");
  setValue("clientEditNextKinRelation", profile.next_of_kin_relation || "");
  setValue("clientKycStatus", kycStatus || "pending");
  setValue("clientKycNote", "");
}

function renderClientDetail(historyPayload, detailPayload) {
  const profile = historyPayload?.clientProfile || detailPayload || {};
  const loans = Array.isArray(historyPayload?.loans)
    ? historyPayload.loans
    : (Array.isArray(detailPayload?.loans) ? detailPayload.loans : []);

  selectedClientSnapshot = profile;
  selectedClientId = Number(profile.id || detailPayload?.id || 0) || null;

  if (clientDetailMeta) {
    const fullName = String(profile.full_name || detailPayload?.full_name || "Unknown client");
    clientDetailMeta.textContent = `${fullName} | Client #${selectedClientId || "-"}`;
  }

  if (clientDetailSummary) {
    clearElement(clientDetailSummary);
    const loanSummary = historyPayload?.loanSummary || {};
    appendMetric(clientDetailSummary, "KYC Status", String(historyPayload?.kycStatus?.status || profile.kyc_status || "pending"));
    appendMetric(clientDetailSummary, "Phone", String(profile.phone || "-"));
    appendMetric(clientDetailSummary, "National ID", String(profile.national_id || "-"));
    appendMetric(clientDetailSummary, "Branch", String(profile.branch_name || `#${profile.branch_id || "-"}`));
    appendMetric(clientDetailSummary, "Total Loans", formatNumber(loanSummary.total_loans ?? loans.length));
    appendMetric(clientDetailSummary, "Outstanding", formatCurrency(loanSummary.total_outstanding_balance ?? 0));
  }

  if (clientHistoryLoanRows) {
    clearElement(clientHistoryLoanRows);
    if (!loans || loans.length === 0) {
      renderEmptyRow(clientHistoryLoanRows, 7, "No loan history available for this client.");
    } else {
      loans.forEach((loan) => {
        const row = document.createElement("tr");
        row.appendChild(createCell("td", String(loan.id ?? "-")));
        row.appendChild(createCell("td", String(loan.status || "-")));
        row.appendChild(createCell("td", formatCurrency(loan.principal ?? 0)));
        row.appendChild(createCell("td", formatCurrency(loan.expected_total ?? 0)));
        row.appendChild(createCell("td", formatCurrency(loan.repaid_total ?? 0)));
        row.appendChild(createCell("td", formatCurrency(loan.balance ?? 0)));
        row.appendChild(createCell("td", formatDateTime(loan.disbursed_at)));
        clientHistoryLoanRows.appendChild(row);
      });
    }
  }

  const photoUrl = String(profile.photo_url || detailPayload?.photo_url || "").trim();
  const idDocumentUrl = String(profile.id_document_url || detailPayload?.id_document_url || "").trim();
  if (clientDetailPhotoLink) {
    clientDetailPhotoLink.href = photoUrl || "#";
    clientDetailPhotoLink.classList.toggle("hidden", !photoUrl);
  }
  if (clientDetailIdDocumentLink) {
    clientDetailIdDocumentLink.href = idDocumentUrl || "#";
    clientDetailIdDocumentLink.classList.toggle("hidden", !idDocumentUrl);
  }
  if (clientDetailDocumentsMeta) {
    if (photoUrl || idDocumentUrl) {
      const available = [photoUrl ? "Photo" : "", idDocumentUrl ? "ID Document" : ""].filter(Boolean).join(" and ");
      clientDetailDocumentsMeta.textContent = `${available} link${available.includes(" and ") ? "s are" : " is"} available.`;
    } else {
      clientDetailDocumentsMeta.textContent = "No document links available.";
    }
  }

  setClientEditFormValues(profile, historyPayload?.kycStatus?.status || profile.kyc_status || "pending");
  if (clientDocumentMeta) {
    clientDocumentMeta.textContent = `Selected client #${selectedClientId}. Upload photo or ID document.`;
  }
}

async function loadClientDetail(clientId) {
  const normalizedClientId = Number(clientId);
  if (!Number.isInteger(normalizedClientId) || normalizedClientId <= 0) {
    throw new Error("Invalid client ID");
  }
  const [detailPayload, historyPayload] = await Promise.all([
    api(`/api/clients/${normalizedClientId}`),
    api(`/api/clients/${normalizedClientId}/history`),
  ]);
  renderClientDetail(historyPayload, detailPayload);
  return { detailPayload, historyPayload };
}

function collectClientEditPayload() {
  if (!selectedClientSnapshot) {
    throw new Error("Select a client before saving profile changes");
  }

  const getValue = (id) => String(document.getElementById(id)?.value || "").trim();
  const payload = {};
  const fullName = getValue("clientEditFullName");
  if (fullName && fullName !== String(selectedClientSnapshot.full_name || "")) {
    payload.fullName = fullName;
  }

  const nullableFieldMap = {
    phone: "clientEditPhone",
    nationalId: "clientEditNationalId",
    kraPin: "clientEditKraPin",
    businessType: "clientEditBusinessType",
    businessLocation: "clientEditBusinessLocation",
    residentialAddress: "clientEditResidentialAddress",
    nextOfKinName: "clientEditNextKinName",
    nextOfKinPhone: "clientEditNextKinPhone",
    nextOfKinRelation: "clientEditNextKinRelation",
  };

  Object.entries(nullableFieldMap).forEach(([key, inputId]) => {
    const value = getValue(inputId);
    const snapshotKey = key
      .replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
      .replace(/^next_of_kin/, "next_of_kin")
      .replace(/^business_/, "business_")
      .replace(/^residential_/, "residential_");
    const previous = String(selectedClientSnapshot[snapshotKey] ?? "").trim();
    if (value !== previous) {
      payload[key] = value || null;
    }
  });

  const businessYearsRaw = getValue("clientEditBusinessYears");
  const previousBusinessYears = selectedClientSnapshot.business_years == null ? "" : String(selectedClientSnapshot.business_years);
  if (businessYearsRaw !== previousBusinessYears) {
    if (!businessYearsRaw) {
      payload.businessYears = null;
    } else {
      const years = Number(businessYearsRaw);
      if (!Number.isInteger(years) || years < 0) {
        throw new Error("Business Years must be a whole number 0 or higher");
      }
      payload.businessYears = years;
    }
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("No profile changes detected");
  }
  return payload;
}

async function uploadClientDocument(clientId, documentType, file) {
  if (!Number.isInteger(Number(clientId)) || Number(clientId) <= 0) {
    throw new Error("Select a client before uploading documents");
  }
  if (!file) {
    throw new Error("Choose a file to upload");
  }

  const formData = new FormData();
  formData.append("clientId", String(clientId));
  formData.append("documentType", String(documentType || ""));
  formData.append("file", file);

  const response = await fetch("/api/uploads/client-document", {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.message || "Document upload failed");
  }
  return payload;
}

function renderLoanSchedule(schedule) {
  clearElement(scheduleRows);
  const summary = schedule.summary || {};
  scheduleSummary.textContent = `Installments: ${formatNumber(summary.total_installments || 0)} | Paid: ${formatNumber(summary.paid_installments || 0)} | Overdue: ${formatNumber(summary.overdue_installments || 0)}`;

  clearElement(scheduleBreakdown);
  const breakdown = schedule.breakdown || {};
  const breakdownEntries = [
    ["Principal", formatCurrency(breakdown.principal)],
    ["Interest", formatCurrency(breakdown.interest_amount)],
    ["Registration Fee", formatCurrency(breakdown.registration_fee)],
    ["Processing Fee", formatCurrency(breakdown.processing_fee)],
    ["Total Due", formatCurrency(breakdown.expected_total)],
    ["Total Paid", formatCurrency(breakdown.repaid_total)],
    ["Outstanding", formatCurrency(breakdown.balance)],
  ];

  breakdownEntries.forEach(([label, value]) => {
    appendMetric(scheduleBreakdown, label, value);
  });

  const installments = schedule.installments || [];
  if (installments.length === 0) {
    renderEmptyRow(scheduleRows, 6, "No installment schedule available.");
    return;
  }

  installments.forEach((item) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(item.installment_number)));
    row.appendChild(createCell("td", formatDate(item.due_date)));
    row.appendChild(createCell("td", formatCurrency(item.amount_due)));
    row.appendChild(createCell("td", formatCurrency(item.amount_paid)));
    row.appendChild(createCell("td", formatCurrency(item.amount_outstanding)));
    row.appendChild(createCell("td", item.status));
    scheduleRows.appendChild(row);
  });
}

async function loadLoanScheduleForLoanId(loanId) {
  const [schedule, breakdown] = await Promise.all([
    api(`/api/loans/${loanId}/schedule`),
    api(`/api/loans/${loanId}/breakdown`),
  ]);
  schedule.breakdown = breakdown;
  renderLoanSchedule(schedule);
  return schedule;
}

function renderLoanSearchResults(loans) {
  if (!loanSearchRows) {
    return;
  }

  clearElement(loanSearchRows);
  if (!loans || loans.length === 0) {
    renderEmptyRow(loanSearchRows, 9, "No loans matched the selected filters.");
    return;
  }

  loans.forEach((loan) => {
    const row = document.createElement("tr");
    row.appendChild(createCell("td", String(loan.id ?? "-")));
    row.appendChild(createCell("td", String(loan.client_id ?? "-")));
    row.appendChild(createCell("td", String(loan.client_name || "-")));
    row.appendChild(createCell("td", String(loan.status || "-")));
    row.appendChild(createCell("td", formatLoanBranchCode(loan)));
    row.appendChild(createCell("td", formatLoanOfficerContext(loan)));
    row.appendChild(createCell("td", formatCurrency(loan.principal ?? 0)));
    row.appendChild(createCell("td", formatCurrency(loan.balance ?? 0)));
    row.appendChild(createCell("td", formatDateTime(loan.disbursed_at)));
    loanSearchRows.appendChild(row);
  });
}

function resetLoanSearchPanelState() {
  if (!loanSearchRows) {
    return;
  }
  renderEmptyRow(loanSearchRows, 9, "Use filters above and click Search Loans.");
  if (loanSearchMeta) {
    loanSearchMeta.textContent = "Use one or more filters, then search.";
  }
}

function readLoanSearchFilters() {
  const loanIdInput = document.getElementById("loanSearchLoanId");
  const clientIdInput = document.getElementById("loanSearchClientId");
  const statusInput = document.getElementById("loanSearchStatus");
  const sortByInput = document.getElementById("loanSearchSortBy");
  const sortOrderInput = document.getElementById("loanSearchSortOrder");

  const loanId = optionalPositiveInteger(loanIdInput, "Loan ID");
  const clientId = optionalPositiveInteger(clientIdInput, "Client ID");
  const status = String(statusInput?.value || "").trim().toLowerCase();
  if (status && !loanStatusValues.includes(status)) {
    throwFieldValidationError(statusInput, "Choose a valid loan status");
  }

  const sortBy = String(sortByInput?.value || "id").trim() || "id";
  const normalizedSortOrder = String(sortOrderInput?.value || "desc").trim().toLowerCase();
  const sortOrder = normalizedSortOrder === "asc" ? "asc" : "desc";

  return {
    loanId,
    clientId,
    status: status || undefined,
    sortBy,
    sortOrder,
  };
}

async function runLoanSearch(filters) {
  const query = new URLSearchParams();
  query.set("limit", "200");
  query.set("sortBy", filters.sortBy || "id");
  query.set("sortOrder", filters.sortOrder || "desc");

  if (typeof filters.loanId !== "undefined") {
    query.set("loanId", String(filters.loanId));
  }
  if (typeof filters.clientId !== "undefined") {
    query.set("clientId", String(filters.clientId));
  }
  if (filters.status) {
    query.set("status", filters.status);
  }

  const result = await api(`/api/loans?${query.toString()}`);
  const rows = Array.isArray(result?.data) ? result.data : [];
  renderLoanSearchResults(rows);

  if (loanSearchMeta) {
    const total = Number(result?.pagination?.total ?? rows.length);
    loanSearchMeta.textContent = `Showing ${formatNumber(rows.length)} of ${formatNumber(total)} loans`;
  }

  return result;
}

async function loadAdminUsers() {
  const usersResult = await api("/api/users");
  renderUsers(usersResult.data || []);
}

function buildCollectionsScopeQuery(user) {
  const params = new URLSearchParams();
  if (user?.role === "loan_officer") {
    params.set("mine", "1");
  }
  return params.toString();
}

async function loadCollectionsPanel(user = currentUser) {
  const scopeQuery = buildCollectionsScopeQuery(user);
  const scopeSuffix = scopeQuery ? `&${scopeQuery}` : "";
  const isLoanOfficer = user?.role === "loan_officer";

  const [collectionsSummary, overdueResult, actionsResult] = await Promise.all([
    api(`/api/reports/collections-summary${scopeQuery ? `?${scopeQuery}` : ""}`),
    api(`/api/collections/overdue?limit=20${scopeSuffix}`),
    api(`/api/collections/actions?limit=20${scopeSuffix}`),
  ]);

  if (collectionsPanelTitle) {
    collectionsPanelTitle.textContent = isLoanOfficer ? "My Collections Queue" : "Collections";
  }
  renderCollectionsSummary(collectionsSummary, { isLoanOfficer });
  renderOverdueQueue(overdueResult.data || []);
  renderCollectionActions(actionsResult.data || []);

  return collectionsSummary;
}

async function loadMyPipelinePanel() {
  const pendingResult = await api("/api/loans/my-pending?limit=20&sortBy=createdAt&sortOrder=desc");
  renderMyPipeline(pendingResult.data || []);
  return pendingResult;
}

function initializeReportFilterState() {
  const defaults = createDefaultReportDateRange();
  portfolioKpiFilters = { ...defaults };
  clientTrendFilters = { ...defaults };
  officerPerformanceFilters = { ...defaults };
  overdueAlertsFilters = {
    ...defaults,
    minDaysOverdue: defaultOverdueAlertsMinDays,
  };

  setDateRangeInputs(portfolioKpiDateFromInput, portfolioKpiDateToInput, defaults);
  setDateRangeInputs(clientTrendDateFromInput, clientTrendDateToInput, defaults);
  setDateRangeInputs(
    document.getElementById("officerPerformanceDateFrom"),
    document.getElementById("officerPerformanceDateTo"),
    defaults,
  );
  setDateRangeInputs(overdueAlertsDateFromInput, overdueAlertsDateToInput, defaults);
  setDateRangeInputs(document.getElementById("glTrialDateFrom"), document.getElementById("glTrialDateTo"), defaults);
  setDateRangeInputs(document.getElementById("glIncomeDateFrom"), document.getElementById("glIncomeDateTo"), defaults);
  setDateRangeInputs(document.getElementById("glCashDateFrom"), document.getElementById("glCashDateTo"), defaults);
  setDateRangeInputs(document.getElementById("glStatementDateFrom"), document.getElementById("glStatementDateTo"), defaults);
  setDateRangeInputs(document.getElementById("pendingApprovalDateFrom"), document.getElementById("pendingApprovalDateTo"), defaults);
  const pendingBranchSelect = document.getElementById("pendingApprovalBranchId");
  if (pendingBranchSelect) {
    pendingBranchSelect.value = "";
  }
  if (overdueAlertsMinDaysInput) {
    overdueAlertsMinDaysInput.value = String(defaultOverdueAlertsMinDays);
  }
  resetReportsHubState(false);
}

async function refreshOverviewSnapshot({ silent = false } = {}) {
  if (!authToken || !currentUser || isOverviewRefreshInFlight) {
    return;
  }

  isOverviewRefreshInFlight = true;
  try {
    const scopeQuery = buildCollectionsScopeQuery(currentUser);
    const isLoanOfficer = currentUser.role === "loan_officer";

    const [transactionsResult, portfolio, collectionsSummary, myPortfolio] = await Promise.all([
      api("/api/transactions"),
      api("/api/reports/portfolio"),
      api(`/api/reports/collections-summary${scopeQuery ? `?${scopeQuery}` : ""}`),
      isLoanOfficer ? api("/api/reports/portfolio?scope=mine") : Promise.resolve(null),
    ]);

    renderPortfolio({
      ...portfolio,
      open_collection_actions: collectionsSummary?.open_collection_actions ?? 0,
    });
    renderTransactions(transactionsResult?.data || []);

    if (isLoanOfficer) {
      myPortfolioCard?.classList.remove("hidden");
      renderMyPortfolio(myPortfolio || {});
    }

    markOverviewRefreshedNow();
    if (!silent) {
      setMessage(dashboardMessage, "Overview data refreshed");
    }
  } catch (error) {
    if (!silent) {
      setMessage(dashboardMessage, error.message, true);
    }
  } finally {
    isOverviewRefreshInFlight = false;
  }
}

function startOverviewAutoRefresh() {
  stopOverviewAutoRefresh();
  updateOverviewRefreshMeta();
  overviewAutoRefreshTimerId = window.setInterval(() => {
    void refreshOverviewSnapshot({ silent: true });
  }, overviewAutoRefreshMs);
  overviewRefreshTickerTimerId = window.setInterval(() => {
    updateOverviewRefreshMeta();
  }, 1_000);
}

function handleGlobalAccessibilityKeydown(event) {
  if (event.key === "Escape" && isMobileMenuOpen) {
    event.preventDefault();
    closeMobileMenu();
    return;
  }

  if (!isMobileMenuOpen || event.key !== "Tab") {
    return;
  }

  const focusables = getFocusableElements(dashboardMenu);
  if (focusables.length === 0) {
    event.preventDefault();
    dashboardMenu?.focus();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleMenuKeyboardNavigation(event) {
  if (!dashboardMenu) {
    return;
  }
  const buttons = Array.from(dashboardMenu.querySelectorAll(".menu-btn:not(.hidden)"));
  if (buttons.length === 0) {
    return;
  }

  const currentIndex = buttons.findIndex((button) => button === document.activeElement);
  if (currentIndex < 0) {
    return;
  }

  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
  }

  if (event.key === "ArrowDown") {
    buttons[(currentIndex + 1) % buttons.length].focus();
  } else if (event.key === "ArrowUp") {
    buttons[(currentIndex - 1 + buttons.length) % buttons.length].focus();
  } else if (event.key === "Home") {
    buttons[0].focus();
  } else if (event.key === "End") {
    buttons[buttons.length - 1].focus();
  }
}

function initializeResponsiveTableObserver() {
  if (tableCardObserver || !dashboard) {
    return;
  }

  tableCardObserver = new MutationObserver(() => {
    applyResponsiveTableLabels();
  });

  tableCardObserver.observe(dashboard, {
    subtree: true,
    childList: true,
  });
}

function initializeAccessibilityEnhancements() {
  mobileMenuToggleBtn?.setAttribute("aria-controls", "dashboardMenu");
  logoutBtn?.setAttribute("aria-label", "Logout of dashboard");
  menuButtons.forEach((button) => {
    button.setAttribute("aria-label", `Open ${button.textContent?.trim() || "section"}`);
  });
}

async function loadDashboard() {
  const [me, transactionsResult] = await Promise.all([
    api("/api/auth/me"),
    api("/api/transactions"),
  ]);
  currentUser = me;
  syncLifecycleActionAccessState();

  const isLoanOfficer = me.role === "loan_officer";
  const canViewPerformance = canViewOfficerPerformance(me);
  setOfficerPerformancePanelVisible(canViewPerformance);

  const [portfolio, collectionsSummary, myPortfolio, officerPerformanceResult] = await Promise.all([
    api("/api/reports/portfolio"),
    loadCollectionsPanel(me),
    isLoanOfficer ? api("/api/reports/portfolio?scope=mine") : Promise.resolve(null),
    canViewPerformance
      ? loadOfficerPerformancePanel(officerPerformanceFilters).catch((error) => {
        if (officerPerformanceRows) {
          renderEmptyRow(officerPerformanceRows, 9, "Officer performance could not be loaded.");
        }
        if (officerPerformanceMeta) {
          officerPerformanceMeta.textContent = `Error: ${error.message}`;
        }
        return null;
      })
      : Promise.resolve(null),
  ]);
  if (isLoanOfficer) {
    await loadMyPipelinePanel();
  }
  void officerPerformanceResult;

  renderDashboardUserBanner(me);
  renderPortfolio({
    ...portfolio,
    open_collection_actions: collectionsSummary?.open_collection_actions ?? 0,
  });
  if (isLoanOfficer) {
    myPortfolioCard?.classList.remove("hidden");
    renderMyPortfolio(myPortfolio || {});
    myPipelineCard?.classList.remove("hidden");
  } else {
    myPortfolioCard?.classList.add("hidden");
    myPipelineCard?.classList.add("hidden");
    if (myPortfolioList) {
      clearElement(myPortfolioList);
    }
    if (myPipelineRows) {
      clearElement(myPipelineRows);
    }
  }
  renderTransactions(transactionsResult.data || []);
  markOverviewRefreshedNow();
  await loadOperationsLookups();
  await Promise.all([
    loadClientManagementList().catch((_error) => {
      if (clientManagementRows) {
        renderEmptyRow(clientManagementRows, 9, "Client list is unavailable for your current role.");
      }
      if (clientManagementMeta) {
        clientManagementMeta.textContent = "Client search is unavailable for your current role.";
      }
      return null;
    }),
    canViewFinanceWorkspace(me)
      ? loadGlAccountsPanel().catch((error) => {
        if (glAccountsRows) {
          renderEmptyRow(glAccountsRows, 6, "GL accounts could not be loaded.");
        }
        setMessage(dashboardMessage, error.message, true);
        return null;
      })
      : Promise.resolve(null),
  ]);
  await loadReportsHubBranchOptions();
  syncLifecycleBranchSelectorOptions();
  resetReportsHubState(true);
  applyReportsHubAccessState({ signedIn: true });
  await autoLoadReportsHubDefaults();

  await loadPendingApprovalQueue().catch((error) => {
    if (pendingApprovalRows) {
      renderEmptyRow(pendingApprovalRows, 8, "Pending approval queue could not be loaded.");
    }
    if (pendingApprovalMeta) {
      pendingApprovalMeta.textContent = `Error: ${error.message}`;
    }
    return null;
  });

  if (me.role === "admin") {
    await loadLoanProductsPanel().catch((error) => {
      if (loanProductRows) {
        renderEmptyRow(loanProductRows, 8, "Loan products could not be loaded.");
      }
      if (loanProductMeta) {
        loanProductMeta.textContent = `Error: ${error.message}`;
      }
      return null;
    });
  }

  if (financeMenuGroup) {
    financeMenuGroup.classList.toggle("hidden", !canViewFinanceWorkspace(me));
  }

  const canViewAdmin = canViewAdminWorkspace(me);
  const canViewSystem = canViewSystemPanel(me);
  syncAuditFilterAccess();

  if (adminMenuGroup) {
    adminMenuGroup.classList.toggle("hidden", !canViewAdmin);
  }

  if (canViewAdmin) {
    await loadAuditTrailPanel(auditTrailFilters).catch((error) => {
      if (auditTrailRows) {
        renderEmptyRow(auditTrailRows, 9, "Audit trail could not be loaded.");
      }
      if (auditTrailMeta) {
        auditTrailMeta.textContent = `Error: ${error.message}`;
      }
      return null;
    });
  }

  if (me.role === "admin") {
    adminUserPanel.classList.remove("hidden");
    if (systemPanelCard) {
      systemPanelCard.classList.remove("hidden");
    }
    await Promise.all([
      loadAdminUsers(),
      loadHierarchyLookups(),
      loadBranchesPanel(),
      loadRoleCatalog(),
      loadSystemConfigStatusPanel().catch((error) => {
        if (systemConfigStatusOutput) {
          clearElement(systemConfigStatusOutput);
          const message = document.createElement("p");
          message.className = "muted";
          message.textContent = `Error: ${error.message}`;
          systemConfigStatusOutput.appendChild(message);
        }
        return null;
      }),
      loadSystemMetricsPanel().catch((error) => {
        if (systemMetricsOutput) {
          clearElement(systemMetricsOutput);
          const message = document.createElement("p");
          message.className = "muted";
          message.textContent = `Error: ${error.message}`;
          systemMetricsOutput.appendChild(message);
        }
        return null;
      }),
      loadHierarchyEventsPanel(hierarchyEventFilters).catch((error) => {
        if (hierarchyEventRows) {
          renderEmptyRow(hierarchyEventRows, 8, "Hierarchy events could not be loaded.");
        }
        if (hierarchyEventsMeta) {
          hierarchyEventsMeta.textContent = `Error: ${error.message}`;
        }
        return null;
      }),
    ]);
  } else {
    adminUserPanel.classList.add("hidden");
    if (systemPanelCard) {
      systemPanelCard.classList.add("hidden");
    }
    clearElement(userRows);
    clearElement(branchRows);
    resetSystemPanelState({ signedIn: true });
    resetHierarchyEventsPanelState({ signedIn: true });

    if (!canViewSystem) {
      if (systemPanelCard) {
        systemPanelCard.classList.add("hidden");
      }
    }

    const activeCategory = menuButtons.find((button) => button.classList.contains("active"))?.dataset.category;
    if ((!canViewAdmin && activeCategory === "admin") || (activeCategory === "finance" && !canViewFinanceWorkspace(me))) {
      applyMenuCategory("overview");
    }
  }

  await Promise.all([
    loadPortfolioKpiPanel(portfolioKpiFilters, portfolio).catch((error) => {
      renderMiniChartFallback(portfolioKpiChart, "Portfolio KPIs could not be loaded.");
      if (portfolioKpiHighlights) {
        clearElement(portfolioKpiHighlights);
      }
      if (portfolioKpiMeta) {
        portfolioKpiMeta.textContent = `Error: ${error.message}`;
      }
      return null;
    }),
    loadClientTrendPanel(clientTrendFilters).catch((error) => {
      renderMiniChartFallback(clientTrendChart, "Client trend data could not be loaded.");
      if (clientTrendList) {
        clearElement(clientTrendList);
      }
      if (clientTrendMeta) {
        clientTrendMeta.textContent = `Error: ${error.message}`;
      }
      return null;
    }),
    loadOverdueAlertsPanel(overdueAlertsFilters, me).catch((error) => {
      if (overdueAlertsList) {
        clearElement(overdueAlertsList);
      }
      if (overdueAlertsRows) {
        renderEmptyRow(overdueAlertsRows, 7, "Overdue alerts could not be loaded.");
      }
      if (overdueAlertsMeta) {
        overdueAlertsMeta.textContent = `Error: ${error.message}`;
      }
      return null;
    }),
  ]);

  applyResponsiveTableLabels();
  startOverviewAutoRefresh();
}

function setLoggedInState(loggedIn) {
  if (loggedIn) {
    authCard.classList.add("hidden");
    dashboard.classList.remove("hidden");
    updateOverviewRefreshMeta();
  } else {
    authCard.classList.remove("hidden");
    dashboard.classList.add("hidden");
    renderDashboardUserBanner(null);
    setOfficerPerformancePanelVisible(false);
    stopOverviewAutoRefresh();
    lastOverviewRefreshAt = null;
    updateOverviewRefreshMeta();
    closeMobileMenu();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(authMessage);
  clearAllFieldErrors(loginForm);
  const submitButton = loginForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Signing in...");

  try {
    const email = requireNonEmptyText(emailInput, "Email");
    const password = requireNonEmptyText(passwordInput, "Password");
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    authToken = result.token;
    storeLastLoginEmail(email);
    passwordInput.value = "";
    setLoggedInState(true);
    await loadDashboard();
  } catch (error) {
    setMessage(authMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

resetRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(authMessage);
  clearAllFieldErrors(resetRequestForm);
  const submitButton = resetRequestForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Sending...");

  try {
    const resetEmailInput = document.getElementById("resetEmail");
    const email = requireNonEmptyText(resetEmailInput, "Account email");
    const result = await api("/api/auth/reset-password/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });

    setMessage(authMessage, result.message || "If the account exists, reset instructions have been sent");
  } catch (error) {
    setMessage(authMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(clientForm);
  const submitButton = clientForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Saving...");

  try {
    const clientNameInput = document.getElementById("clientName");
    const fullName = requireNonEmptyText(clientNameInput, "Client name");
    const phone = document.getElementById("clientPhone").value.trim();

    const createdClient = await api("/api/clients", {
      method: "POST",
      body: JSON.stringify({ fullName, phone: phone || undefined }),
    });
    lastCreatedClientId = Number(createdClient?.id || 0) || null;

    clientForm.reset();
    setMessage(dashboardMessage, `Client created successfully (ID: ${createdClient?.id || "-"})`);
    await loadDashboard();
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

loanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(loanForm);
  const submitButton = loanForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Creating...");

  try {
    const clientIdInput = document.getElementById("loanClientId");
    const principalInput = document.getElementById("loanPrincipal");
    const termInput = document.getElementById("loanTerm");
    const clientId = requirePositiveInteger(clientIdInput, "Client ID");
    const principal = requirePositiveNumber(principalInput, "Principal");
    const termWeeks = requirePositiveInteger(termInput, "Term weeks");

    const createdLoan = await api("/api/loans", {
      method: "POST",
      body: JSON.stringify({ clientId, principal, termWeeks }),
    });
    lastCreatedLoanId = Number(createdLoan?.id || 0) || null;

    loanForm.reset();
    setMessage(dashboardMessage, `Loan created successfully (ID: ${createdLoan?.id || "-"})`);
    await loadDashboard();
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

repaymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(repaymentForm);
  const submitButton = repaymentForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Saving...");

  try {
    const repaymentLoanIdInput = document.getElementById("repaymentLoanId");
    const repaymentAmountInput = document.getElementById("repaymentAmount");
    const loanId = requirePositiveInteger(repaymentLoanIdInput, "Loan ID");
    const amount = requirePositiveNumber(repaymentAmountInput, "Repayment amount");

    await api(`/api/loans/${loanId}/repayments`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });

    repaymentForm.reset();
    setMessage(dashboardMessage, "Repayment saved successfully");
    await loadDashboard();
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

scheduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(scheduleForm);
  const submitButton = scheduleForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");

  try {
    const scheduleLoanIdInput = document.getElementById("scheduleLoanId");
    const loanId = requirePositiveInteger(scheduleLoanIdInput, "Loan ID");
    await loadLoanScheduleForLoanId(loanId);
    setMessage(dashboardMessage, "Schedule loaded");
  } catch (error) {
    scheduleSummary.textContent = "";
    clearElement(scheduleBreakdown);
    clearElement(scheduleRows);
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

loanSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(loanSearchForm);
  const submitButton = loanSearchForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Searching...");

  try {
    const filters = readLoanSearchFilters();
    const result = await runLoanSearch(filters);
    const total = Number(result?.pagination?.total ?? 0);
    setMessage(dashboardMessage, `Loan search completed (${formatNumber(total)} match(es))`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

loanSearchResetBtn.addEventListener("click", () => {
  clearMessage(dashboardMessage);
  loanSearchForm.reset();
  clearAllFieldErrors(loanSearchForm);
  resetLoanSearchPanelState();
});

clientManagementForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(clientManagementForm);
  const submitButton = clientManagementForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Searching...");
  try {
    await loadClientManagementList();
    setMessage(dashboardMessage, "Client list loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

clientManagementResetBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  clientManagementForm?.reset();
  clearAllFieldErrors(clientManagementForm);
  setButtonBusy(clientManagementResetBtn, true, "Resetting...");
  try {
    await loadClientManagementList();
    resetClientDetailPanels();
    setMessage(dashboardMessage, "Client filters reset");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(clientManagementResetBtn, false);
  }
});

clientManagementRows?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action='open-client-detail']");
  if (!button) {
    return;
  }

  clearMessage(dashboardMessage);
  const clientId = Number(button.dataset.clientId);
  setButtonBusy(button, true, "Opening...");
  try {
    await loadClientDetail(clientId);
    setMessage(dashboardMessage, `Client #${clientId} detail loaded`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

clientDuplicateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(clientDuplicateForm);
  const submitButton = clientDuplicateForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Checking...");
  try {
    const nationalId = String(document.getElementById("clientDupNationalId")?.value || "").trim();
    const phone = String(document.getElementById("clientDupPhone")?.value || "").trim();
    const name = String(document.getElementById("clientDupName")?.value || "").trim();
    if (!nationalId && !phone && !name) {
      throw new Error("Provide at least one duplicate search field");
    }

    const query = new URLSearchParams();
    if (nationalId) query.set("nationalId", nationalId);
    if (phone) query.set("phone", phone);
    if (name) query.set("name", name);
    query.set("limit", "50");
    const result = await api(`/api/clients/potential-duplicates?${query.toString()}`);
    renderPotentialDuplicates(result);
    setMessage(dashboardMessage, "Duplicate analysis completed");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

clientDuplicateResetBtn?.addEventListener("click", () => {
  clearMessage(dashboardMessage);
  clientDuplicateForm?.reset();
  clearAllFieldErrors(clientDuplicateForm);
  if (clientDuplicateRows) {
    renderEmptyRow(clientDuplicateRows, 6, "No potential duplicates found.");
  }
  if (clientDuplicateMeta) {
    clientDuplicateMeta.textContent = "Provide at least one field to detect likely duplicates.";
  }
});

clientEditForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(clientEditForm);
  const submitButton = clientEditForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Saving...");
  try {
    if (!selectedClientId) {
      throw new Error("Select a client before saving profile changes");
    }
    const payload = collectClientEditPayload();
    const result = await api(`/api/clients/${selectedClientId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await loadClientDetail(selectedClientId);
    await loadClientManagementList();
    setMessage(dashboardMessage, result?.message || "Client profile updated");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

clientEditResetBtn?.addEventListener("click", () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(clientEditForm);
  if (!selectedClientSnapshot) {
    clientEditForm?.reset();
    return;
  }
  setClientEditFormValues(selectedClientSnapshot, document.getElementById("clientKycStatus")?.value || "pending");
});

clientKycForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(clientKycForm);
  const submitButton = clientKycForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Updating...");
  try {
    if (!selectedClientId) {
      throw new Error("Select a client before updating KYC");
    }
    const status = String(document.getElementById("clientKycStatus")?.value || "").trim().toLowerCase();
    const note = String(document.getElementById("clientKycNote")?.value || "").trim();
    if (!["pending", "verified", "rejected"].includes(status)) {
      throw new Error("Choose a valid KYC status");
    }
    const result = await api(`/api/clients/${selectedClientId}/kyc`, {
      method: "PATCH",
      body: JSON.stringify({ status, note: note || undefined }),
    });
    await loadClientDetail(selectedClientId);
    await loadClientManagementList();
    setMessage(dashboardMessage, result?.message || "Client KYC status updated");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

clientDocumentUploadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(clientDocumentUploadForm);
  const submitButton = clientDocumentUploadForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Uploading...");
  try {
    if (!selectedClientId) {
      throw new Error("Select a client before uploading documents");
    }
    const documentType = String(document.getElementById("clientDocumentType")?.value || "").trim().toLowerCase();
    const fileInput = document.getElementById("clientDocumentFile");
    const file = fileInput?.files?.[0] || null;
    const result = await uploadClientDocument(selectedClientId, documentType, file);
    await loadClientDetail(selectedClientId);
    await loadClientManagementList();
    clientDocumentUploadForm.reset();
    setMessage(dashboardMessage, result?.message || "Client document uploaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

pendingApprovalForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(pendingApprovalForm);
  const submitButton = pendingApprovalForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");
  try {
    await loadPendingApprovalQueue();
    setMessage(dashboardMessage, "Pending approvals loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

pendingApprovalResetBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(pendingApprovalForm);
  setButtonBusy(pendingApprovalResetBtn, true, "Resetting...");
  try {
    const defaults = createDefaultReportDateRange();
    setDateRangeInputs(document.getElementById("pendingApprovalDateFrom"), document.getElementById("pendingApprovalDateTo"), defaults);
    const branchInput = document.getElementById("pendingApprovalBranchId");
    if (branchInput) {
      branchInput.value = "";
    }
    await loadPendingApprovalQueue({ ...defaults, branchId: null });
    setMessage(dashboardMessage, "Pending approval filters reset");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(pendingApprovalResetBtn, false);
  }
});

refreshPendingApprovalBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(refreshPendingApprovalBtn, true, "Refreshing...");
  try {
    await loadPendingApprovalQueue();
    setMessage(dashboardMessage, "Pending approvals refreshed");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(refreshPendingApprovalBtn, false);
  }
});

pendingApprovalRows?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action][data-loan-id]");
  if (!button) {
    return;
  }
  const action = String(button.dataset.action || "").trim();
  const loanId = Number(button.dataset.loanId || 0);
  if (!Number.isInteger(loanId) || loanId <= 0) {
    return;
  }

  clearMessage(dashboardMessage);
  setButtonBusy(button, true, "Working...");
  try {
    setLifecycleLoanId(loanId);
    if (action === "lifecycle-open") {
      await Promise.all([loadLoanStatementForLifecycle(loanId), loadLoanCollateralSnapshot(loanId)]);
      setMessage(dashboardMessage, `Loan #${loanId} opened`);
    } else if (action === "lifecycle-approve") {
      await executeLifecycleAction("approve", loanId);
      await loadPendingApprovalQueue();
      setMessage(dashboardMessage, `Loan #${loanId} approved`);
    } else if (action === "lifecycle-reject") {
      const rejectInput = document.getElementById("lifecycleRejectReason");
      if (rejectInput && !String(rejectInput.value || "").trim()) {
        const promptedReason = window.prompt("Enter reject reason", "");
        if (promptedReason === null) {
          return;
        }
        rejectInput.value = promptedReason;
      }
      await executeLifecycleAction("reject", loanId);
      await loadPendingApprovalQueue();
      setMessage(dashboardMessage, `Loan #${loanId} rejected`);
    }
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

loanLifecycleForm?.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("button[data-lifecycle-action]");
  if (!actionButton) {
    return;
  }
  clearMessage(dashboardMessage);
  clearAllFieldErrors(loanLifecycleForm);
  setButtonBusy(actionButton, true, "Applying...");
  try {
    const action = String(actionButton.dataset.lifecycleAction || "").trim();
    const loanId = readLifecycleLoanId();
    setLifecycleLoanId(loanId);
    await executeLifecycleAction(action, loanId);
    await loadPendingApprovalQueue();
    setMessage(dashboardMessage, `Loan #${loanId} ${action} action completed`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(actionButton, false);
  }
});

loadLoanStatementBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(loanLifecycleForm);
  setButtonBusy(loadLoanStatementBtn, true, "Loading...");
  try {
    const loanId = readLifecycleLoanId();
    setLifecycleLoanId(loanId);
    await loadLoanStatementForLifecycle(loanId);
    setMessage(dashboardMessage, `Statement loaded for loan #${loanId}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(loadLoanStatementBtn, false);
  }
});

downloadLoanStatementBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(loanLifecycleForm);
  setButtonBusy(downloadLoanStatementBtn, true, "Preparing...");
  try {
    const loanId = readLifecycleLoanId();
    setLifecycleLoanId(loanId);
    await downloadLoanStatementJson(loanId);
    setMessage(dashboardMessage, `Statement JSON downloaded for loan #${loanId}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(downloadLoanStatementBtn, false);
  }
});

loadLoanCollateralBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(loanLifecycleForm);
  setButtonBusy(loadLoanCollateralBtn, true, "Loading...");
  try {
    const loanId = readLifecycleLoanId();
    setLifecycleLoanId(loanId);
    await loadLoanCollateralSnapshot(loanId);
    setMessage(dashboardMessage, `Collateral snapshot loaded for loan #${loanId}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(loadLoanCollateralBtn, false);
  }
});

loanProductForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(loanProductForm);
  const submitButton = loanProductForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Creating...");
  try {
    if (getCurrentRoleKey() !== "admin") {
      throw new Error("Only admins can create loan products");
    }
    const payload = readLoanProductFormValues();
    await createLoanProduct(payload);
    loanProductForm.reset();
    await loadLoanProductsPanel();
    setMessage(dashboardMessage, "Loan product created");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

refreshLoanProductsBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(refreshLoanProductsBtn, true, "Refreshing...");
  try {
    await loadLoanProductsPanel();
    setMessage(dashboardMessage, "Loan products refreshed");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(refreshLoanProductsBtn, false);
  }
});

loanProductRows?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action][data-product-id]");
  if (!button) {
    return;
  }
  clearMessage(dashboardMessage);
  setButtonBusy(button, true, "Applying...");
  try {
    if (getCurrentRoleKey() !== "admin") {
      throw new Error("Only admins can manage loan products");
    }
    const action = String(button.dataset.action || "").trim();
    const productId = Number(button.dataset.productId || 0);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error("Invalid loan product ID");
    }

    if (action === "loan-product-activate") {
      await setLoanProductActivation(productId, true);
    } else if (action === "loan-product-deactivate") {
      await setLoanProductActivation(productId, false);
    } else if (action === "loan-product-edit") {
      const namePrompt = window.prompt("Product name", String(button.dataset.name || ""));
      if (namePrompt === null) {
        return;
      }
      const interestPrompt = window.prompt("Interest rate", String(button.dataset.interestRate || "0"));
      if (interestPrompt === null) {
        return;
      }
      const registrationPrompt = window.prompt("Registration fee", String(button.dataset.registrationFee || "0"));
      if (registrationPrompt === null) {
        return;
      }
      const processingPrompt = window.prompt("Processing fee", String(button.dataset.processingFee || "0"));
      if (processingPrompt === null) {
        return;
      }
      const minTermPrompt = window.prompt("Min term weeks", String(button.dataset.minTermWeeks || "1"));
      if (minTermPrompt === null) {
        return;
      }
      const maxTermPrompt = window.prompt("Max term weeks", String(button.dataset.maxTermWeeks || "1"));
      if (maxTermPrompt === null) {
        return;
      }
      const payload = {
        name: String(namePrompt || "").trim(),
        interestRate: Number(String(interestPrompt || "").trim()),
        registrationFee: Number(String(registrationPrompt || "").trim()),
        processingFee: Number(String(processingPrompt || "").trim()),
        minTermWeeks: Number(String(minTermPrompt || "").trim()),
        maxTermWeeks: Number(String(maxTermPrompt || "").trim()),
      };
      if (!payload.name) {
        throw new Error("Product name is required");
      }
      if (!Number.isFinite(payload.interestRate) || payload.interestRate < 0) {
        throw new Error("Interest rate must be zero or greater");
      }
      if (!Number.isFinite(payload.registrationFee) || payload.registrationFee < 0) {
        throw new Error("Registration fee must be zero or greater");
      }
      if (!Number.isFinite(payload.processingFee) || payload.processingFee < 0) {
        throw new Error("Processing fee must be zero or greater");
      }
      if (!Number.isInteger(payload.minTermWeeks) || payload.minTermWeeks <= 0) {
        throw new Error("Min term weeks must be a positive whole number");
      }
      if (!Number.isInteger(payload.maxTermWeeks) || payload.maxTermWeeks <= 0) {
        throw new Error("Max term weeks must be a positive whole number");
      }
      if (payload.maxTermWeeks < payload.minTermWeeks) {
        throw new Error("Max term must be greater than or equal to min term");
      }
      await updateLoanProduct(productId, payload);
    }

    await loadLoanProductsPanel();
    setMessage(dashboardMessage, "Loan products updated");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

refreshGlAccountsBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(refreshGlAccountsBtn, true, "Refreshing...");
  try {
    await loadGlAccountsPanel();
    setMessage(dashboardMessage, "GL accounts refreshed");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(refreshGlAccountsBtn, false);
  }
});

glTrialBalanceForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(glTrialBalanceForm);
  const submitButton = glTrialBalanceForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");
  try {
    const filters = readDateRangeWithBranch(
      document.getElementById("glTrialDateFrom"),
      document.getElementById("glTrialDateTo"),
      document.getElementById("glTrialBranchId"),
    );
    await loadGlTrialBalance(filters);
    setMessage(dashboardMessage, "Trial balance loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

glTrialResetBtn?.addEventListener("click", () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(glTrialBalanceForm);
  const defaults = createDefaultReportDateRange();
  setDateRangeInputs(document.getElementById("glTrialDateFrom"), document.getElementById("glTrialDateTo"), defaults);
  const branchSelect = document.getElementById("glTrialBranchId");
  if (branchSelect) {
    branchSelect.value = "";
  }
});

glTrialBalanceForm?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-export]");
  if (!button) {
    return;
  }
  clearMessage(dashboardMessage);
  const exportFormat = String(button.dataset.export || "").trim().toLowerCase();
  setButtonBusy(button, true, "Preparing...");
  try {
    const filters = readDateRangeWithBranch(
      document.getElementById("glTrialDateFrom"),
      document.getElementById("glTrialDateTo"),
      document.getElementById("glTrialBranchId"),
    );
    const suffix = buildGlQuery(filters, exportFormat);
    await downloadAuthenticatedFile(`/api/reports/gl/trial-balance${suffix ? `?${suffix}` : ""}`, `gl-trial-balance.${exportFormat}`);
    setMessage(dashboardMessage, `Trial balance exported as ${exportFormat.toUpperCase()}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

glIncomeStatementForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(glIncomeStatementForm);
  const submitButton = glIncomeStatementForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");
  try {
    const filters = readDateRangeWithBranch(
      document.getElementById("glIncomeDateFrom"),
      document.getElementById("glIncomeDateTo"),
      document.getElementById("glIncomeBranchId"),
    );
    await loadGlIncomeStatement(filters);
    setMessage(dashboardMessage, "GL income statement loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

glIncomeResetBtn?.addEventListener("click", () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(glIncomeStatementForm);
  const defaults = createDefaultReportDateRange();
  setDateRangeInputs(document.getElementById("glIncomeDateFrom"), document.getElementById("glIncomeDateTo"), defaults);
  const branchSelect = document.getElementById("glIncomeBranchId");
  if (branchSelect) {
    branchSelect.value = "";
  }
});

glIncomeStatementForm?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-export]");
  if (!button) {
    return;
  }
  clearMessage(dashboardMessage);
  const exportFormat = String(button.dataset.export || "").trim().toLowerCase();
  setButtonBusy(button, true, "Preparing...");
  try {
    const filters = readDateRangeWithBranch(
      document.getElementById("glIncomeDateFrom"),
      document.getElementById("glIncomeDateTo"),
      document.getElementById("glIncomeBranchId"),
    );
    const suffix = buildGlQuery(filters, exportFormat);
    await downloadAuthenticatedFile(`/api/reports/gl/income-statement${suffix ? `?${suffix}` : ""}`, `gl-income-statement.${exportFormat}`);
    setMessage(dashboardMessage, `Income statement exported as ${exportFormat.toUpperCase()}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

glCashFlowForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(glCashFlowForm);
  const submitButton = glCashFlowForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");
  try {
    const filters = readDateRangeWithBranch(
      document.getElementById("glCashDateFrom"),
      document.getElementById("glCashDateTo"),
      document.getElementById("glCashBranchId"),
    );
    await loadGlCashFlow(filters);
    setMessage(dashboardMessage, "GL cash flow loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

glCashResetBtn?.addEventListener("click", () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(glCashFlowForm);
  const defaults = createDefaultReportDateRange();
  setDateRangeInputs(document.getElementById("glCashDateFrom"), document.getElementById("glCashDateTo"), defaults);
  const branchSelect = document.getElementById("glCashBranchId");
  if (branchSelect) {
    branchSelect.value = "";
  }
});

glCashFlowForm?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-export]");
  if (!button) {
    return;
  }
  clearMessage(dashboardMessage);
  const exportFormat = String(button.dataset.export || "").trim().toLowerCase();
  setButtonBusy(button, true, "Preparing...");
  try {
    const filters = readDateRangeWithBranch(
      document.getElementById("glCashDateFrom"),
      document.getElementById("glCashDateTo"),
      document.getElementById("glCashBranchId"),
    );
    const suffix = buildGlQuery(filters, exportFormat);
    await downloadAuthenticatedFile(`/api/reports/gl/cash-flow${suffix ? `?${suffix}` : ""}`, `gl-cash-flow.${exportFormat}`);
    setMessage(dashboardMessage, `Cash flow exported as ${exportFormat.toUpperCase()}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

glAccountStatementForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(glAccountStatementForm);
  const submitButton = glAccountStatementForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");
  try {
    const baseFilters = readDateRangeWithBranch(
      document.getElementById("glStatementDateFrom"),
      document.getElementById("glStatementDateTo"),
      document.getElementById("glStatementBranchId"),
    );
    const accountId = Number(document.getElementById("glStatementAccountId")?.value || 0);
    await loadGlAccountStatement({ ...baseFilters, accountId });
    setMessage(dashboardMessage, "GL account statement loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

glStatementResetBtn?.addEventListener("click", () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(glAccountStatementForm);
  const defaults = createDefaultReportDateRange();
  setDateRangeInputs(document.getElementById("glStatementDateFrom"), document.getElementById("glStatementDateTo"), defaults);
  const branchSelect = document.getElementById("glStatementBranchId");
  const accountSelect = document.getElementById("glStatementAccountId");
  if (branchSelect) {
    branchSelect.value = "";
  }
  if (accountSelect) {
    accountSelect.value = "";
  }
});

glAccountStatementForm?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-export]");
  if (!button) {
    return;
  }
  clearMessage(dashboardMessage);
  const exportFormat = String(button.dataset.export || "").trim().toLowerCase();
  setButtonBusy(button, true, "Preparing...");
  try {
    const baseFilters = readDateRangeWithBranch(
      document.getElementById("glStatementDateFrom"),
      document.getElementById("glStatementDateTo"),
      document.getElementById("glStatementBranchId"),
    );
    const accountId = Number(document.getElementById("glStatementAccountId")?.value || 0);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error("Select a valid GL account");
    }
    const suffix = buildGlQuery({ ...baseFilters, accountId }, exportFormat);
    await downloadAuthenticatedFile(`/api/reports/gl/accounts/${accountId}/statement${suffix ? `?${suffix}` : ""}`, `gl-account-${accountId}-statement.${exportFormat}`);
    setMessage(dashboardMessage, `GL account statement exported as ${exportFormat.toUpperCase()}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

portfolioKpiForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(portfolioKpiForm);
  const submitButton = portfolioKpiForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");

  try {
    portfolioKpiFilters = readPortfolioKpiFilters();
    await loadPortfolioKpiPanel(portfolioKpiFilters);
    setMessage(dashboardMessage, `Portfolio KPIs loaded for ${formatDateRangeLabel(portfolioKpiFilters)}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

portfolioKpiResetBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(portfolioKpiForm);
  setButtonBusy(portfolioKpiResetBtn, true, "Resetting...");
  try {
    const defaults = createDefaultReportDateRange();
    setDateRangeInputs(portfolioKpiDateFromInput, portfolioKpiDateToInput, defaults);
    portfolioKpiFilters = { ...defaults };
    await loadPortfolioKpiPanel(portfolioKpiFilters);
    setMessage(dashboardMessage, "Portfolio KPI range reset");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(portfolioKpiResetBtn, false);
  }
});

clientTrendForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(clientTrendForm);
  const submitButton = clientTrendForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");

  try {
    clientTrendFilters = readClientTrendFilters();
    await loadClientTrendPanel(clientTrendFilters);
    setMessage(dashboardMessage, `Client trend loaded for ${formatDateRangeLabel(clientTrendFilters)}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

clientTrendResetBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(clientTrendForm);
  setButtonBusy(clientTrendResetBtn, true, "Resetting...");
  try {
    const defaults = createDefaultReportDateRange();
    setDateRangeInputs(clientTrendDateFromInput, clientTrendDateToInput, defaults);
    clientTrendFilters = { ...defaults };
    await loadClientTrendPanel(clientTrendFilters);
    setMessage(dashboardMessage, "Client trend range reset");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(clientTrendResetBtn, false);
  }
});

officerPerformanceForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(officerPerformanceForm);
  const submitButton = officerPerformanceForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");

  try {
    officerPerformanceFilters = readOfficerPerformanceFilters();
    const result = await loadOfficerPerformancePanel(officerPerformanceFilters);
    const count = Array.isArray(result?.officers) ? result.officers.length : 0;
    setMessage(dashboardMessage, `Officer performance loaded (${formatNumber(count)} officer(s))`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

officerPerformanceResetBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(officerPerformanceForm);
  setButtonBusy(officerPerformanceResetBtn, true, "Resetting...");
  try {
    const defaults = createDefaultReportDateRange();
    setDateRangeInputs(
      document.getElementById("officerPerformanceDateFrom"),
      document.getElementById("officerPerformanceDateTo"),
      defaults,
    );
    officerPerformanceFilters = { ...defaults };
    const result = await loadOfficerPerformancePanel(officerPerformanceFilters);
    const count = Array.isArray(result?.officers) ? result.officers.length : 0;
    setMessage(dashboardMessage, `Officer performance reset (${formatNumber(count)} officer(s))`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(officerPerformanceResetBtn, false);
  }
});

overdueAlertsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(overdueAlertsForm);
  const submitButton = overdueAlertsForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");

  try {
    overdueAlertsFilters = readOverdueAlertsFilters();
    await loadOverdueAlertsPanel(overdueAlertsFilters);
    setMessage(dashboardMessage, `Overdue alerts loaded for ${formatDateRangeLabel(overdueAlertsFilters)}`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

overdueAlertsResetBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(overdueAlertsForm);
  setButtonBusy(overdueAlertsResetBtn, true, "Resetting...");
  try {
    const defaults = createDefaultReportDateRange();
    setDateRangeInputs(overdueAlertsDateFromInput, overdueAlertsDateToInput, defaults);
    if (overdueAlertsMinDaysInput) {
      overdueAlertsMinDaysInput.value = String(defaultOverdueAlertsMinDays);
    }
    overdueAlertsFilters = {
      ...defaults,
      minDaysOverdue: defaultOverdueAlertsMinDays,
    };
    await loadOverdueAlertsPanel(overdueAlertsFilters);
    setMessage(dashboardMessage, "Overdue alerts filters reset");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(overdueAlertsResetBtn, false);
  }
});

collectionActionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(collectionActionForm);
  const submitButton = collectionActionForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Saving...");

  try {
    const collectionLoanIdInput = document.getElementById("collectionLoanId");
    const collectionInstallmentIdInput = document.getElementById("collectionInstallmentId");
    const loanId = requirePositiveInteger(collectionLoanIdInput, "Loan ID");
    const actionType = document.getElementById("collectionActionType").value;
    const actionStatus = document.getElementById("collectionActionStatus").value;
    const actionNote = document.getElementById("collectionActionNote").value.trim();
    const promiseDateRaw = document.getElementById("collectionPromiseDate").value;
    const nextFollowUpDateRaw = document.getElementById("collectionFollowUpDate").value;

    const payload = {
      loanId,
      actionType,
      actionStatus,
      installmentId: optionalPositiveInteger(collectionInstallmentIdInput, "Installment ID"),
      actionNote: actionNote || undefined,
      promiseDate: promiseDateRaw ? new Date(promiseDateRaw).toISOString() : undefined,
      nextFollowUpDate: nextFollowUpDateRaw ? new Date(nextFollowUpDateRaw).toISOString() : undefined,
    };

    await api("/api/collections/actions", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    collectionActionForm.reset();
    setMessage(dashboardMessage, "Collection action logged successfully");
    await loadDashboard();
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

overdueRows.addEventListener("click", async (event) => {
  const row = event.target.closest("tr");
  if (!row || !overdueRows.contains(row)) {
    return;
  }

  const loanId = Number(row.dataset.loanId);
  if (!Number.isInteger(loanId) || loanId <= 0) {
    return;
  }

  const scheduleButton = event.target.closest("button[data-action='open-schedule']");
  if (scheduleButton) {
    clearMessage(dashboardMessage);
    setButtonBusy(scheduleButton, true, "Opening...");
    try {
      setSelectValue(document.getElementById("scheduleLoanId"), loanId, `Loan #${loanId} (from overdue queue)`);
      applyMenuCategory("operations");
      await loadLoanScheduleForLoanId(loanId);
      setMessage(dashboardMessage, `Schedule loaded for loan #${loanId}`);
    } catch (error) {
      scheduleSummary.textContent = "";
      clearElement(scheduleBreakdown);
      clearElement(scheduleRows);
      setMessage(dashboardMessage, error.message, true);
    } finally {
      setButtonBusy(scheduleButton, false);
    }
    return;
  }

  const collectionLoanIdInput = document.getElementById("collectionLoanId");
  const collectionInstallmentIdInput = document.getElementById("collectionInstallmentId");
  const installmentId = Number(row.dataset.installmentId);

  setSelectValue(collectionLoanIdInput, loanId, `Loan #${loanId} (from overdue queue)`);
  if (collectionInstallmentIdInput) {
    collectionInstallmentIdInput.value =
      Number.isInteger(installmentId) && installmentId > 0 ? String(installmentId) : "";
  }

  const activeCategory = menuButtons.find((button) => button.classList.contains("active"))?.dataset.category;
  if (activeCategory !== "collections" && activeCategory !== "all") {
    applyMenuCategory("collections");
  }
});

refreshOverdueBtn.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(refreshOverdueBtn, true, "Refreshing...");
  try {
    await Promise.all([
      loadCollectionsPanel(currentUser),
      loadOverdueAlertsPanel(overdueAlertsFilters, currentUser),
    ]);
    setMessage(dashboardMessage, "Overdue queue refreshed");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(refreshOverdueBtn, false);
  }
});

refreshCollectionActionsBtn.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(refreshCollectionActionsBtn, true, "Refreshing...");
  try {
    await Promise.all([
      loadCollectionsPanel(currentUser),
      loadOverdueAlertsPanel(overdueAlertsFilters, currentUser),
    ]);
    setMessage(dashboardMessage, "Collection actions refreshed");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(refreshCollectionActionsBtn, false);
  }
});

changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(changePasswordForm);
  const submitButton = changePasswordForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Updating...");

  try {
    const currentPasswordInput = document.getElementById("currentPassword");
    const newPasswordInput = document.getElementById("newPassword");
    const currentPassword = requireNonEmptyText(currentPasswordInput, "Current password");
    const newPassword = requireStrongPassword(newPasswordInput, "New password");

    const result = await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    changePasswordForm.reset();
    setMessage(dashboardMessage, result.message || "Password updated successfully");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

resetConfirmForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(resetConfirmForm);
  const submitButton = resetConfirmForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Applying...");

  try {
    const resetTokenInput = document.getElementById("resetToken");
    const resetNewPasswordInput = document.getElementById("resetNewPassword");
    const token = requireNonEmptyText(resetTokenInput, "Reset token");
    const newPassword = requireStrongPassword(resetNewPasswordInput, "New password");

    const result = await api("/api/auth/reset-password/confirm", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    });

    resetConfirmForm.reset();
    setMessage(dashboardMessage, result.message || "Password reset successful");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

adminCreateUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(adminCreateUserForm);
  const submitButton = adminCreateUserForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Creating...");

  try {
    const fullNameInput = document.getElementById("adminUserFullName");
    const emailInput = document.getElementById("adminUserEmail");
    const passwordInput = document.getElementById("adminUserPassword");
    const roleInput = document.getElementById("adminUserRole");
    const branchInput = document.getElementById("adminUserBranchId");
    const areaBranchIdsInput = document.getElementById("adminUserAreaBranchIds");
    const areaBranchCountInput = document.getElementById("adminUserAreaBranchCount");
    const primaryRegionInput = document.getElementById("adminUserPrimaryRegionId");

    const fullName = requireNonEmptyText(fullNameInput, "Full name");
    const email = requireNonEmptyText(emailInput, "Email");
    const password = requireStrongPassword(passwordInput, "Password");
    const role = requireNonEmptyText(roleInput, "Role");
    const branchId = String(branchInput.value || "").trim() ? requirePositiveInteger(branchInput, "Branch ID") : undefined;
    const areaBranchIds = parsePositiveIntegerList(areaBranchIdsInput.value);
    const areaBranchCount = String(areaBranchCountInput.value || "").trim()
      ? requirePositiveInteger(areaBranchCountInput, "Area branch count")
      : undefined;
    const primaryRegionId = String(primaryRegionInput.value || "").trim()
      ? requirePositiveInteger(primaryRegionInput, "Primary region ID")
      : undefined;

    if ((role === "operations_manager" || role === "loan_officer") && !branchId) {
      throwFieldValidationError(branchInput, "This role requires a branch assignment");
    }

    if (role === "area_manager" && areaBranchIds.length === 0 && !branchId) {
      if (typeof areaBranchCount === "undefined") {
        throwFieldValidationError(areaBranchIdsInput, "Area manager requires branch IDs, branch count, or an anchor branch");
      }
    }

    if (role === "area_manager" && typeof areaBranchCount !== "undefined" && areaBranchIds.length > 0 && areaBranchIds.length !== areaBranchCount) {
      throwFieldValidationError(areaBranchCountInput, "Area branch count must match provided branch IDs");
    }

    const payload = { fullName, email, password, role };
    if (typeof branchId !== "undefined") {
      payload.branchId = branchId;
    }
    if (typeof primaryRegionId !== "undefined") {
      payload.primaryRegionId = primaryRegionId;
    }
    if (role === "area_manager") {
      if (typeof areaBranchCount !== "undefined") {
        payload.branchCount = areaBranchCount;
      }
      payload.branchIds = areaBranchIds.length > 0 ? areaBranchIds : (branchId && typeof areaBranchCount === "undefined" ? [branchId] : []);
    }

    const result = await api("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    adminCreateUserForm.reset();
    updateAdminRoleHint();
    setMessage(dashboardMessage, `User ${result.email || email} created successfully`);
    await loadAdminUsers();
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

userRows.addEventListener("click", async (event) => {
  const button = event.target.closest(".unlock-row-btn");
  if (!button) {
    return;
  }

  clearMessage(dashboardMessage);
  try {
    const action = button.dataset.action;
    const userId = Number(button.dataset.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("Invalid user id");
    }

    if (action === "unlock") {
      const result = await api(`/api/users/${userId}/unlock`, {
        method: "POST",
      });
      setMessage(dashboardMessage, result.message || "User unlocked");
    } else if (action === "reset-token") {
      const result = await api(`/api/users/${userId}/reset-token`, {
        method: "POST",
      });
      setMessage(dashboardMessage, result.message || "Password reset initiated");
    } else if (action === "deactivate") {
      const result = await api(`/api/users/${userId}/deactivate`, {
        method: "POST",
      });
      setMessage(dashboardMessage, result.message || "User deactivated");
    } else if (action === "activate") {
      const result = await api(`/api/users/${userId}/activate`, {
        method: "POST",
      });
      setMessage(dashboardMessage, result.message || "User activated");
    } else if (action === "revoke-sessions") {
      const result = await api(`/api/users/${userId}/revoke-sessions`, {
        method: "POST",
      });
      setMessage(dashboardMessage, result.message || "User sessions revoked");
    } else if (action === "role-update") {
      const roleSelect = button.parentElement?.querySelector("select[data-kind='role-select']");
      const role = String(roleSelect?.value || "").trim();
      if (!role) {
        throw new Error("Choose a role before applying");
      }

      const rolePayload = { role };
      if (role === "operations_manager" || role === "loan_officer") {
        const branchPrompt = window.prompt("Enter branch ID for this role", "");
        if (branchPrompt === null) {
          return;
        }
        const parsedBranch = Number(branchPrompt.trim());
        if (!Number.isInteger(parsedBranch) || parsedBranch <= 0) {
          throw new Error("Branch ID must be a positive whole number");
        }
        rolePayload.branchId = parsedBranch;
      }
      if (role === "area_manager") {
        const branchListPrompt = window.prompt(
          "Enter area manager branch IDs (comma separated). Leave blank to assign by branch count.",
          "",
        );
        if (branchListPrompt === null) {
          return;
        }
        const branchIds = parsePositiveIntegerList(branchListPrompt);
        if (branchIds.length > 0) {
          rolePayload.branchIds = branchIds;
        } else {
          const branchCountPrompt = window.prompt("Enter number of branches to assign", "");
          if (branchCountPrompt === null) {
            return;
          }
          const parsedCount = Number(branchCountPrompt.trim());
          if (!Number.isInteger(parsedCount) || parsedCount <= 0) {
            throw new Error("Branch count must be a positive whole number");
          }
          rolePayload.branchCount = parsedCount;
        }
      }

      const result = await api(`/api/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify(rolePayload),
      });
      setMessage(dashboardMessage, result.message || "User role updated");
    } else if (action === "scope-update") {
      const role = String(button.dataset.role || "").trim();
      const currentBranchId = String(button.dataset.branchId || "").trim();
      const currentBranchIds = String(button.dataset.branchIds || "").trim();
      const currentRegionId = String(button.dataset.regionId || "").trim();
      const profilePayload = {};

      if (role === "operations_manager" || role === "loan_officer") {
        const branchPrompt = window.prompt("Enter branch ID", currentBranchId);
        if (branchPrompt === null) {
          return;
        }
        const parsedBranch = Number(branchPrompt.trim());
        if (!Number.isInteger(parsedBranch) || parsedBranch <= 0) {
          throw new Error("Branch ID must be a positive whole number");
        }
        profilePayload.branchId = parsedBranch;
      } else if (role === "area_manager") {
        const branchIdsPrompt = window.prompt(
          "Enter branch IDs (comma separated). Leave blank to assign by branch count.",
          currentBranchIds,
        );
        if (branchIdsPrompt === null) {
          return;
        }
        const parsedBranchIds = parsePositiveIntegerList(branchIdsPrompt);
        if (parsedBranchIds.length > 0) {
          profilePayload.branchIds = parsedBranchIds;
        } else {
          const currentCount = parsePositiveIntegerList(currentBranchIds).length;
          const branchCountPrompt = window.prompt(
            "Enter number of branches to assign",
            currentCount > 0 ? String(currentCount) : "",
          );
          if (branchCountPrompt === null) {
            return;
          }
          const parsedCount = Number(branchCountPrompt.trim());
          if (!Number.isInteger(parsedCount) || parsedCount <= 0) {
            throw new Error("Branch count must be a positive whole number");
          }
          profilePayload.branchCount = parsedCount;
        }
      } else {
        const branchPrompt = window.prompt("Enter branch ID (leave blank to clear)", currentBranchId);
        if (branchPrompt === null) {
          return;
        }
        const normalized = branchPrompt.trim();
        if (!normalized) {
          profilePayload.branchId = null;
        } else {
          const parsedBranch = Number(normalized);
          if (!Number.isInteger(parsedBranch) || parsedBranch <= 0) {
            throw new Error("Branch ID must be a positive whole number");
          }
          profilePayload.branchId = parsedBranch;
        }
      }

      const regionPrompt = window.prompt("Enter primary region ID (leave blank to keep current)", currentRegionId);
      if (regionPrompt !== null) {
        const normalizedRegion = regionPrompt.trim();
        if (normalizedRegion) {
          const parsedRegion = Number(normalizedRegion);
          if (!Number.isInteger(parsedRegion) || parsedRegion <= 0) {
            throw new Error("Primary region ID must be a positive whole number");
          }
          profilePayload.primaryRegionId = parsedRegion;
        }
      }

      const result = await api(`/api/users/${userId}/profile`, {
        method: "PATCH",
        body: JSON.stringify(profilePayload),
      });
      setMessage(dashboardMessage, result.message || "User scope updated");
    }

    await loadAdminUsers();
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  }
});

refreshUsersBtn.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(refreshUsersBtn, true, "Refreshing...");
  try {
    await loadAdminUsers();
    setMessage(dashboardMessage, "User list refreshed");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(refreshUsersBtn, false);
  }
});

branchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(branchForm);
  const submitButton = branchForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Creating...");

  try {
    const payload = {
      name: requireNonEmptyText(document.getElementById("branchName"), "Branch name"),
      branchCode: String(document.getElementById("branchCode").value || "").trim() || undefined,
      county: requireNonEmptyText(document.getElementById("branchCounty"), "County"),
      town: requireNonEmptyText(document.getElementById("branchTown"), "Town"),
      locationAddress: requireNonEmptyText(document.getElementById("branchLocationAddress"), "Location"),
      regionId: requirePositiveInteger(document.getElementById("branchRegionId"), "Region ID"),
      contactPhone: String(document.getElementById("branchContactPhone").value || "").trim() || undefined,
      contactEmail: String(document.getElementById("branchContactEmail").value || "").trim() || undefined,
    };

    const result = await api("/api/branches", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    branchForm.reset();
    await Promise.all([loadHierarchyLookups(), loadBranchesPanel(), loadAdminUsers()]);
    setMessage(dashboardMessage, `Branch ${result.name || payload.name} created successfully`);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

branchRows.addEventListener("click", async (event) => {
  const button = event.target.closest(".unlock-row-btn");
  if (!button) {
    return;
  }

  clearMessage(dashboardMessage);

  try {
    const action = button.dataset.action;
    const branchId = Number(button.dataset.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new Error("Invalid branch id");
    }

    if (action === "deactivate-branch") {
      const confirmed = window.confirm("Deactivate this branch?");
      if (!confirmed) {
        return;
      }
      const result = await api(`/api/branches/${branchId}`, { method: "DELETE" });
      setMessage(dashboardMessage, result.message || "Branch deactivated");
    } else if (action === "edit-branch") {
      const payload = {};
      const nextName = window.prompt("Branch name", button.dataset.branchName || "");
      if (nextName === null) {
        return;
      }
      payload.name = nextName.trim();

      const nextTown = window.prompt("Town", button.dataset.branchTown || "");
      if (nextTown === null) {
        return;
      }
      payload.town = nextTown.trim();

      const nextCounty = window.prompt("County", button.dataset.branchCounty || "");
      if (nextCounty === null) {
        return;
      }
      payload.county = nextCounty.trim();

      const nextRegion = window.prompt("Region ID", button.dataset.branchRegionId || "");
      if (nextRegion === null) {
        return;
      }
      const parsedRegion = Number(nextRegion.trim());
      if (!Number.isInteger(parsedRegion) || parsedRegion <= 0) {
        throw new Error("Region ID must be a positive whole number");
      }
      payload.regionId = parsedRegion;

      const nextCode = window.prompt("Branch code", button.dataset.branchCode || "");
      if (nextCode !== null && nextCode.trim()) {
        payload.branchCode = nextCode.trim();
      }

      const result = await api(`/api/branches/${branchId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setMessage(dashboardMessage, result.message || "Branch updated");
    }

    await Promise.all([loadHierarchyLookups(), loadBranchesPanel(), loadAdminUsers()]);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  }
});

refreshBranchesBtn.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(refreshBranchesBtn, true, "Refreshing...");
  try {
    await Promise.all([loadHierarchyLookups(), loadBranchesPanel()]);
    setMessage(dashboardMessage, "Branches refreshed");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(refreshBranchesBtn, false);
  }
});

auditTrailForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(auditTrailForm);
  const submitButton = auditTrailForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");

  try {
    auditTrailFilters = readAuditTrailFilters({ preserveOffset: false });
    await loadAuditTrailPanel(auditTrailFilters);
    setMessage(dashboardMessage, "Audit trail loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

auditTrailResetBtn?.addEventListener("click", () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(auditTrailForm);
  resetAuditTrailPanelState({ signedIn: true });
});

auditTrailPrevBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  const previousOffset = Math.max(Number(auditTrailFilters.offset || 0) - Number(auditTrailFilters.limit || 20), 0);
  const nextFilters = { ...auditTrailFilters, offset: previousOffset };
  setButtonBusy(auditTrailPrevBtn, true, "Loading...");
  try {
    await loadAuditTrailPanel(nextFilters);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(auditTrailPrevBtn, false);
  }
});

auditTrailNextBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  const nextOffset = Number(auditTrailFilters.offset || 0) + Number(auditTrailFilters.limit || 20);
  const nextFilters = { ...auditTrailFilters, offset: nextOffset };
  setButtonBusy(auditTrailNextBtn, true, "Loading...");
  try {
    await loadAuditTrailPanel(nextFilters);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(auditTrailNextBtn, false);
  }
});

hierarchyEventsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(dashboardMessage);
  clearAllFieldErrors(hierarchyEventsForm);
  const submitButton = hierarchyEventsForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "Loading...");

  try {
    hierarchyEventFilters = readHierarchyEventFilters({ preserveOffset: false });
    await loadHierarchyEventsPanel(hierarchyEventFilters);
    setMessage(dashboardMessage, "Hierarchy events loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

hierarchyEventsResetBtn?.addEventListener("click", () => {
  clearMessage(dashboardMessage);
  clearAllFieldErrors(hierarchyEventsForm);
  resetHierarchyEventsPanelState({ signedIn: true });
});

hierarchyEventsPrevBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  const previousOffset = Math.max(Number(hierarchyEventFilters.offset || 0) - Number(hierarchyEventFilters.limit || 20), 0);
  const nextFilters = { ...hierarchyEventFilters, offset: previousOffset };
  setButtonBusy(hierarchyEventsPrevBtn, true, "Loading...");
  try {
    await loadHierarchyEventsPanel(nextFilters);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(hierarchyEventsPrevBtn, false);
  }
});

hierarchyEventsNextBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  const nextOffset = Number(hierarchyEventFilters.offset || 0) + Number(hierarchyEventFilters.limit || 20);
  const nextFilters = { ...hierarchyEventFilters, offset: nextOffset };
  setButtonBusy(hierarchyEventsNextBtn, true, "Loading...");
  try {
    await loadHierarchyEventsPanel(nextFilters);
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(hierarchyEventsNextBtn, false);
  }
});

systemConfigRefreshBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(systemConfigRefreshBtn, true, "Refreshing...");
  try {
    await loadSystemConfigStatusPanel();
    setMessage(dashboardMessage, "System configuration status loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(systemConfigRefreshBtn, false);
  }
});

systemMetricsRefreshBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(systemMetricsRefreshBtn, true, "Refreshing...");
  try {
    await loadSystemMetricsPanel();
    setMessage(dashboardMessage, "System metrics loaded");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(systemMetricsRefreshBtn, false);
  }
});

systemBackupBtn?.addEventListener("click", async () => {
  clearMessage(dashboardMessage);
  setButtonBusy(systemBackupBtn, true, "Running...");
  try {
    await runSystemBackup();
    setMessage(dashboardMessage, "Database backup completed");
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(systemBackupBtn, false);
  }
});

document.addEventListener("click", async (event) => {
  const sortButton = event.target.closest("button[data-sort-table][data-sort-key]");
  if (!sortButton) {
    return;
  }

  const tableType = String(sortButton.dataset.sortTable || "").trim();
  const sortKey = String(sortButton.dataset.sortKey || "").trim();
  if (!tableType || !sortKey) {
    return;
  }

  clearMessage(dashboardMessage);
  setButtonBusy(sortButton, true, "Sorting...");

  try {
    if (tableType === "audit") {
      const sortOrder = getNextSortOrder(auditTrailFilters.sortBy, auditTrailFilters.sortOrder, sortKey);
      const nextFilters = {
        ...auditTrailFilters,
        sortBy: sortKey,
        sortOrder,
        offset: 0,
      };
      await loadAuditTrailPanel(nextFilters);
      return;
    }

    if (tableType === "hierarchy") {
      const sortOrder = getNextSortOrder(hierarchyEventFilters.sortBy, hierarchyEventFilters.sortOrder, sortKey);
      const nextFilters = {
        ...hierarchyEventFilters,
        sortBy: sortKey,
        sortOrder,
        offset: 0,
      };
      await loadHierarchyEventsPanel(nextFilters);
      return;
    }
  } catch (error) {
    setMessage(dashboardMessage, error.message, true);
  } finally {
    setButtonBusy(sortButton, false);
  }
});

if (adminRoleSelect) {
  adminRoleSelect.addEventListener("change", (event) => {
    updateAdminRoleHint(event.target.value);
  });
}

menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyMenuCategory(button.dataset.category);
  });
});

mobileNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyMenuCategory(String(button.dataset.category || "overview"));
    dashboardMain?.focus();
  });
});

mobileMenuToggleBtn?.addEventListener("click", () => {
  setMobileMenuOpen(!isMobileMenuOpen, { focusMenu: true });
});

mobileMenuOverlay?.addEventListener("click", () => {
  closeMobileMenu();
});

window.addEventListener("resize", () => {
  if (!isMobileViewport()) {
    setMobileMenuOpen(false);
  }
  applyResponsiveTableLabels();
});

document.addEventListener("keydown", handleGlobalAccessibilityKeydown);
dashboardMenu?.addEventListener("keydown", handleMenuKeyboardNavigation);

logoutBtn.addEventListener("click", async () => {
  if (authToken) {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (_error) {
      // Local logout should still complete even if remote revoke fails.
    }
  }

  authToken = "";
  currentUser = null;
  lastCreatedClientId = null;
  lastCreatedLoanId = null;
  selectedLifecycleLoanId = null;
  lastOverviewRefreshAt = null;
  stopOverviewAutoRefresh();
  closeMobileMenu();
  clearMessage(dashboardMessage);
  clearElement(userRows);
  clearElement(branchRows);
  if (adminMenuGroup) {
    adminMenuGroup.classList.add("hidden");
  }
  if (adminUserPanel) {
    adminUserPanel.classList.add("hidden");
  }
  if (systemPanelCard) {
    systemPanelCard.classList.add("hidden");
  }
  if (financeMenuGroup) {
    financeMenuGroup.classList.add("hidden");
  }
  loanSearchForm.reset();
  clientManagementForm?.reset();
  clientDuplicateForm?.reset();
  clientEditForm?.reset();
  clientKycForm?.reset();
  clientDocumentUploadForm?.reset();
  pendingApprovalForm?.reset();
  loanLifecycleForm?.reset();
  loanProductForm?.reset();
  resetLoanSearchPanelState();
  if (clientManagementRows) {
    renderEmptyRow(clientManagementRows, 9, "Sign in to view clients.");
  }
  if (clientDuplicateRows) {
    renderEmptyRow(clientDuplicateRows, 6, "Sign in to run duplicate detection.");
  }
  if (glAccountsRows) {
    renderEmptyRow(glAccountsRows, 6, "Sign in to view GL accounts.");
  }
  if (glTrialRows) {
    renderEmptyRow(glTrialRows, 6, "Sign in to view trial balance.");
  }
  if (glCashRows) {
    renderEmptyRow(glCashRows, 4, "Sign in to view GL cash flow.");
  }
  if (glStatementRows) {
    renderEmptyRow(glStatementRows, 8, "Sign in to view account statements.");
  }
  if (pendingApprovalRows) {
    renderEmptyRow(pendingApprovalRows, 8, "Sign in to view pending approvals.");
  }
  if (pendingApprovalMeta) {
    pendingApprovalMeta.textContent = "Load pending approvals by period and branch.";
  }
  if (loanStatementRows) {
    renderEmptyRow(loanStatementRows, 7, "Sign in to view loan statements.");
  }
  if (loanCollateralRows) {
    renderEmptyRow(loanCollateralRows, 5, "Sign in to view collateral.");
  }
  if (loanGuarantorRows) {
    renderEmptyRow(loanGuarantorRows, 5, "Sign in to view guarantors.");
  }
  if (loanProductRows) {
    renderEmptyRow(loanProductRows, 8, "Sign in as admin to manage loan products.");
  }
  if (loanLifecycleMeta) {
    loanLifecycleMeta.textContent = "Enter a loan ID to perform lifecycle actions.";
  }
  if (loanProductMeta) {
    loanProductMeta.textContent = "Manage loan product catalog.";
  }
  if (loanStatementSummary) {
    clearElement(loanStatementSummary);
  }
  resetClientDetailPanels("Sign in to view client details and history.");
  initializeReportFilterState();
  syncLifecycleActionAccessState();
  if (portfolioKpiChart) {
    renderMiniChartFallback(portfolioKpiChart, "Sign in to view portfolio KPI visuals.");
  }
  if (clientTrendChart) {
    renderMiniChartFallback(clientTrendChart, "Sign in to view client acquisition trends.");
  }
  if (portfolioKpiHighlights) {
    clearElement(portfolioKpiHighlights);
  }
  if (clientTrendList) {
    clearElement(clientTrendList);
  }
  if (overdueAlertsList) {
    clearElement(overdueAlertsList);
  }
  if (overdueAlertsRows) {
    renderEmptyRow(overdueAlertsRows, 7, "Sign in to view overdue alerts.");
  }
  resetAuditTrailPanelState({ signedIn: false });
  resetHierarchyEventsPanelState({ signedIn: false });
  resetSystemPanelState({ signedIn: false });
  resetReportsHubState(false);
  updateOverviewRefreshMeta();
  applyMenuCategory("overview");
  if (passwordInput) {
    passwordInput.value = "";
  }
  setLoggedInState(false);
});

async function bootstrap() {
  if (emailInput) {
    emailInput.value = getStoredLastLoginEmail();
  }

  if (passwordInput) {
    passwordInput.value = "";
  }

  setLoggedInState(false);
  initializeAccessibilityEnhancements();
  initializeResponsiveTableObserver();
  setMobileMenuOpen(false);
  updateAdminRoleHint();
  resetLoanSearchPanelState();
  resetClientDetailPanels();
  initializeReportFilterState();
  syncLifecycleActionAccessState();
  renderReportsHub();
  renderMiniChartFallback(portfolioKpiChart, "Sign in to view portfolio KPI visuals.");
  renderMiniChartFallback(clientTrendChart, "Sign in to view client acquisition trends.");
  if (clientManagementRows) {
    renderEmptyRow(clientManagementRows, 9, "Sign in to view clients.");
  }
  if (clientDuplicateRows) {
    renderEmptyRow(clientDuplicateRows, 6, "Sign in to run duplicate detection.");
  }
  if (glAccountsRows) {
    renderEmptyRow(glAccountsRows, 6, "Sign in to view GL accounts.");
  }
  if (glTrialRows) {
    renderEmptyRow(glTrialRows, 6, "Sign in to view trial balance.");
  }
  if (glCashRows) {
    renderEmptyRow(glCashRows, 4, "Sign in to view GL cash flow.");
  }
  if (glStatementRows) {
    renderEmptyRow(glStatementRows, 8, "Sign in to view account statements.");
  }
  if (pendingApprovalRows) {
    renderEmptyRow(pendingApprovalRows, 8, "Sign in to view pending approvals.");
  }
  if (loanStatementRows) {
    renderEmptyRow(loanStatementRows, 7, "Sign in to view loan statements.");
  }
  if (loanCollateralRows) {
    renderEmptyRow(loanCollateralRows, 5, "Sign in to view collateral.");
  }
  if (loanGuarantorRows) {
    renderEmptyRow(loanGuarantorRows, 5, "Sign in to view guarantors.");
  }
  if (loanProductRows) {
    renderEmptyRow(loanProductRows, 8, "Sign in as admin to manage loan products.");
  }
  if (overdueAlertsRows) {
    renderEmptyRow(overdueAlertsRows, 7, "Sign in to view overdue alerts.");
  }
  resetAuditTrailPanelState({ signedIn: false });
  resetHierarchyEventsPanelState({ signedIn: false });
  resetSystemPanelState({ signedIn: false });
  updateOverviewRefreshMeta();
  applyResponsiveTableLabels();
}

bootstrap();

applyMenuCategory("overview");

[
  loginForm,
  resetRequestForm,
  clientForm,
  loanForm,
  repaymentForm,
  scheduleForm,
  loanSearchForm,
  clientManagementForm,
  clientDuplicateForm,
  clientEditForm,
  clientKycForm,
  clientDocumentUploadForm,
  glTrialBalanceForm,
  glIncomeStatementForm,
  glCashFlowForm,
  glAccountStatementForm,
  pendingApprovalForm,
  loanLifecycleForm,
  loanProductForm,
  auditTrailForm,
  hierarchyEventsForm,
  portfolioKpiForm,
  clientTrendForm,
  officerPerformanceForm,
  overdueAlertsForm,
  collectionActionForm,
  changePasswordForm,
  resetConfirmForm,
  adminCreateUserForm,
  branchForm,
].forEach((form) => attachLiveValidationClear(form));
