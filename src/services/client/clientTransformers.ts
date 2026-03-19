export function normalizeExportFormat(value: unknown) {
  return String(value || "json").trim().toLowerCase();
}

export function buildClientListExportFilename(isDormantOnly: boolean) {
  const stamp = new Date().toISOString().slice(0, 10);
  return isDormantOnly
    ? `dormant-borrowers-${stamp}`
    : `borrowers-${stamp}`;
}

export function mapClientListExportRows(clients: Array<Record<string, any>>) {
  return clients.map((client) => ({
    BorrowerRef: `BRW-${String(client.id || "").padStart(6, "0")}`,
    FullName: String(client.full_name || ""),
    Phone: String(client.phone || ""),
    NationalId: String(client.national_id || ""),
    Branch: String(client.branch_name || ""),
    Agent: String(client.assigned_officer_name || ""),
    LoanCount: Number(client.loan_count || 0),
    CompletedLoans: Number(client.closed_loan_count || 0),
    OpenLoans: Number(client.open_loan_count || 0),
    KycStatus: String(client.kyc_status || ""),
    OnboardingStatus: String(client.onboarding_status || ""),
    FeePaymentStatus: String(client.fee_payment_status || ""),
    Active: Number(client.is_active || 0) === 1 ? "Yes" : "No",
    CreatedAt: String(client.created_at || ""),
    UpdatedAt: String(client.updated_at || ""),
  }));
}
