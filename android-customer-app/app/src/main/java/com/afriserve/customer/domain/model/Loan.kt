package com.afriserve.customer.domain.model

enum class LoanStatus {
  PENDING_APPROVAL,
  APPROVED,
  ACTIVE,
  OVERDUE,
  CLOSED,
  WRITTEN_OFF,
  RESTRUCTURED,
  REJECTED,
  UNKNOWN,
}

data class Loan(
  val id: Long,
  val status: LoanStatus,
  val principal: Double,
  val interestRate: Double,
  val termWeeks: Int?,
  val termMonths: Int,
  val registrationFee: Double,
  val processingFee: Double,
  val expectedTotal: Double,
  val repaidTotal: Double,
  val balance: Double,
  val disbursedAt: String?,
  val createdAt: String,
  val approvedAt: String? = null,
  val purpose: String?,
  val productId: Int?,
  val productName: String? = null,
  val externalReference: String? = null,
  val officerName: String? = null,
  val installmentCount: Int = 0,
  val paidInstallmentCount: Int = 0,
  val overdueInstallmentCount: Int = 0,
  val overdueAmount: Double = 0.0,
)
