package com.afriserve.customer.domain.model

data class Repayment(
  val id: Long,
  val amount: Double,
  val appliedAmount: Double,
  val penaltyAmount: Double,
  val interestAmount: Double,
  val principalAmount: Double,
  val paidAt: String,
  val paymentChannel: String,
  val externalReceipt: String?,
  val payerPhone: String?,
)
