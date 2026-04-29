package com.afriserve.customer.domain.model

enum class KycStatus {
  PENDING,
  VERIFIED,
  REJECTED,
  UNKNOWN,
}

enum class OnboardingStatus {
  REGISTERED,
  KYC_SUBMITTED,
  FEES_PAID,
  ACTIVE,
  UNKNOWN,
}

enum class FeePaymentStatus {
  UNPAID,
  PAID,
  UNKNOWN,
}

data class ClientProfile(
  val id: Long,
  val fullName: String,
  val phone: String?,
  val nationalId: String?,
  val kraPin: String?,
  val photoUrl: String?,
  val idDocumentUrl: String?,
  val kycStatus: KycStatus,
  val onboardingStatus: OnboardingStatus,
  val feePaymentStatus: FeePaymentStatus,
  val businessType: String?,
  val businessYears: Int?,
  val businessLocation: String?,
  val residentialAddress: String?,
  val latitude: Double?,
  val longitude: Double?,
  val nextOfKinName: String?,
  val nextOfKinPhone: String?,
  val nextOfKinRelation: String?,
  val branchId: Int?,
  val officerId: Int?,
  val createdAt: String,
  val branchName: String? = null,
  val branchPhone: String? = null,
  val officerName: String? = null,
  val feesPaidAt: String? = null,
)
