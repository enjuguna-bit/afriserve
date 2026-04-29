package com.afriserve.customer.domain.model

data class ClientGuarantor(
  val id: Long,
  val name: String,
  val phone: String?,
  val guaranteeAmount: Double,
  val relationship: String? = null,
)

data class CollateralAsset(
  val id: Long,
  val assetType: String,
  val description: String?,
  val estimatedValue: Double,
  val status: String? = null,
  val lienRank: String? = null,
  val documentUrl: String? = null,
)

data class ProfileVersion(
  val id: Long,
  val versionNumber: Int,
  val effectiveDate: String?,
  val note: String?,
  val createdAt: String? = null,
)

data class OnboardingChecklist(
  val readyForLoanApplication: Boolean,
  val blockers: List<String>,
  val nextStep: String?,
  val guarantorCount: Int,
  val collateralCount: Int,
  val feesPaidAt: String?,
)

data class LoanStatement(
  val summary: List<StatementEntry>,
  val formattedText: String,
)

data class LoanDetailBundle(
  val loan: Loan,
  val installments: List<LoanInstallment>,
  val repayments: List<Repayment>,
  val statementEntries: List<StatementEntry>,
  val guarantors: List<ClientGuarantor>,
  val collaterals: List<CollateralAsset>,
)

data class DashboardSummary(
  val profile: ClientProfile,
  val loans: List<Loan>,
  val installmentsByLoanId: Map<Long, List<LoanInstallment>>,
  val recentRepayments: List<Repayment>,
)

enum class NotificationType(
  val wireValue: String,
  val title: String,
) {
  PAYMENT_DUE("payment_due", "Payment Due"),
  PAYMENT_RECEIVED("payment_received", "Payment Confirmed"),
  LOAN_APPROVED("loan_approved", "Loan Approved!"),
  LOAN_DISBURSED("loan_disbursed", "Funds Disbursed"),
  KYC_UPDATE("kyc_update", "KYC Status Updated"),
  PROFILE_REFRESH("profile_refresh", "Profile Update Required"),
  UNKNOWN("unknown", "Notification");

  companion object {
    fun fromWireValue(value: String?): NotificationType =
      entries.firstOrNull { it.wireValue == value.orEmpty().trim().lowercase() } ?: UNKNOWN
  }
}

data class CustomerNotification(
  val id: String,
  val type: NotificationType,
  val title: String,
  val body: String,
  val loanId: Long? = null,
  val createdAt: String,
  val isRead: Boolean = false,
)

data class SupportErrorLogEntry(
  val id: String,
  val message: String,
  val code: Int?,
  val endpoint: String?,
  val createdAt: String,
)
