package com.afriserve.customer.domain.model

enum class StatementEntryType {
  ALL,
  REPAYMENT,
  DISBURSEMENT,
  FEE,
  PENALTY,
}

data class StatementEntry(
  val date: String,
  val description: String,
  val debit: Double,
  val credit: Double,
  val runningBalance: Double,
  val reference: String?,
  val type: StatementEntryType = StatementEntryType.ALL,
  val loanId: Long? = null,
)
