type LegacyReportKind = "disbursements" | "arrears" | "dues";

type LegacyReportRow = Record<string, string>;

interface LegacyReportTemplate {
  filenameBase: string;
  title: string;
  headers: string[];
}

const LEGACY_REPORT_TIME_ZONE = "Africa/Nairobi";

const legacyReportTemplates: Record<LegacyReportKind, LegacyReportTemplate> = {
  disbursements: {
    filenameBase: "disbursement-report",
    title: "Disbursement Report",
    headers: [
      "FullNames",
      "AccountNo",
      "LoanId",
      "AmountDisbursed",
      "MpesaRef",
      "Interest",
      "OLB",
      "Amount Disbursed",
      "Borrow Date",
      "Loantype",
      "Branch",
      "Product",
      "FieldOfficer",
      "Clear Date",
    ],
  },
  arrears: {
    filenameBase: "arrears-report",
    title: "Arrears Report",
    headers: [
      "LoanId",
      "BorowerId",
      "FullNames",
      "PhoneNumber",
      "LoanAmount",
      "AmountDisbursed",
      "Interest",
      "Arrears Amount",
      "DaysInArrears",
      "LoanBalance",
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
    ],
  },
  dues: {
    filenameBase: "loans-due-report",
    title: "Loans Due Report",
    headers: [
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
    ],
  },
};

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toIntegerString(value: unknown): string {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return String(Math.trunc(numeric));
  }
  return String(value ?? "").trim();
}

function toText(value: unknown): string {
  return value == null ? "" : String(value);
}

function normalizeLegacyBranchLabel(value: unknown): string {
  const text = toText(value).trim();
  if (!text) {
    return "";
  }
  return text.replace(/\s+branch$/i, "");
}

function formatPlainAmount(value: unknown): string {
  return toNumber(value).toFixed(2);
}

function formatFlexibleAmount(value: unknown): string {
  const normalized = toNumber(value).toFixed(2);
  return normalized.replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
}

function formatCurrencyAmount(value: unknown): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
  return `Ksh ${formatted}`;
}

function formatDateParts(
  value: unknown,
  options: Intl.DateTimeFormatOptions,
): Record<string, string> | null {
  if (!value) {
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LEGACY_REPORT_TIME_ZONE,
    ...options,
  }).formatToParts(date);

  const output: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.type !== "literal") {
      output[part.type] = part.value;
    }
  });
  return output;
}

function formatLegacyDate(value: unknown): string {
  const parts = formatDateParts(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  if (!parts) {
    return "";
  }
  return `${parts.day}/${parts.month}/${parts.year}`;
}

function formatLegacyDateTime(value: unknown): string {
  const parts = formatDateParts(value, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  if (!parts) {
    return "";
  }
  return `${parts.month}/${parts.day}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod}`;
}

function formatLegacyDateAtMidnight(value: unknown): string {
  const parts = formatDateParts(value, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  if (!parts) {
    return "";
  }
  return `${parts.month}/${parts.day}/${parts.year} 12:00:00 AM`;
}

function mapLegacyDisbursementRows(rows: Array<Record<string, unknown>>): LegacyReportRow[] {
  return rows.map((row) => ({
    FullNames: toText(row.fullnames),
    AccountNo: toText(row.accountno || row.phonenumber),
    LoanId: toIntegerString(row.loanid),
    AmountDisbursed: formatCurrencyAmount(row.amountdisbursed),
    MpesaRef: toText(row.mpesaref),
    Interest: formatCurrencyAmount(row.interest),
    OLB: formatCurrencyAmount(row.olb ?? row.loanbalance),
    "Amount Disbursed": formatCurrencyAmount(row.amountdisbursed),
    "Borrow Date": formatLegacyDate(row.borrowdate),
    Loantype: toText(row.loantype),
    Branch: normalizeLegacyBranchLabel(row.branch),
    Product: toText(row.productname),
    FieldOfficer: toText(row.fieldofficer),
    "Clear Date": formatLegacyDate(row.cleardate),
  }));
}

function mapLegacyArrearsRows(rows: Array<Record<string, unknown>>): LegacyReportRow[] {
  return rows.map((row) => ({
    LoanId: toIntegerString(row.loan_id),
    BorowerId: toIntegerString(row.borrowerid),
    FullNames: toText(row.fullnames),
    PhoneNumber: toText(row.phonenumber),
    LoanAmount: formatPlainAmount(row.loanamount),
    AmountDisbursed: formatPlainAmount(row.amountdisbursed),
    Interest: formatPlainAmount(row.interest),
    "Arrears Amount": formatPlainAmount(row.arrears_amount),
    DaysInArrears: toIntegerString(row.daysinarrears),
    LoanBalance: formatPlainAmount(row.loanbalance),
    ProductName: toText(row.productname),
    Maturity: toText(row.maturity),
    Branch: normalizeLegacyBranchLabel(row.branch),
    "Expected Clear Date": formatLegacyDateAtMidnight(row.expectedcleardate),
    Borrowdate: formatLegacyDateTime(row.borrowdate),
    BusinessLocation: toText(row.businesslocation),
    DaysToNpl: toIntegerString(row.daystonpl),
    GurantorNames: toText(row.guarantornames),
    GurantorPhone: toText(row.guarantorphone),
    ProductName1: toText(row.productname),
    SalesRep: toText(row.salesrep),
  }));
}

function mapLegacyDuesRows(rows: Array<Record<string, unknown>>): LegacyReportRow[] {
  return rows.map((row) => ({
    LoanId: toIntegerString(row.loanid),
    FullNames: toText(row.fullnames),
    PhoneNumber: toText(row.phonenumber),
    InstallmentNo: toIntegerString(row.installmentno),
    "AMOUNT DISBURSED": formatPlainAmount(row.amountdisbursed),
    "Amount Due": formatPlainAmount(row.amountdue),
    Arrears: formatFlexibleAmount(row.arrears),
    AmountPaid: formatPlainAmount(row.amountpaid),
    LoanAmount: formatPlainAmount(row.loanamount),
    LoanBalance: formatPlainAmount(row.loanbalance),
    "Product Name": toText(row.productname),
    UnitTitle: normalizeLegacyBranchLabel(row.unittitle),
    FieldOfficer: toText(row.fieldofficer),
    "Due Date": formatLegacyDateAtMidnight(row.duedate),
  }));
}

function getLegacyReportTemplate(kind: LegacyReportKind): LegacyReportTemplate {
  return legacyReportTemplates[kind];
}

export {
  getLegacyReportTemplate,
  mapLegacyArrearsRows,
  mapLegacyDisbursementRows,
  mapLegacyDuesRows,
  type LegacyReportKind,
  type LegacyReportRow,
};
