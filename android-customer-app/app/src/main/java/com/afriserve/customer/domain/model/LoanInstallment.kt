package com.afriserve.customer.domain.model

enum class InstallmentStatus {
  PENDING,
  PAID,
  PARTIAL,
  OVERDUE,
  UNKNOWN,
}

data class LoanInstallment(
  val id: Long,
  val installmentNumber: Int,
  val dueDate: String,
  val amountDue: Double,
  val amountPaid: Double,
  val penaltyAmountAccrued: Double,
  val status: InstallmentStatus,
)
