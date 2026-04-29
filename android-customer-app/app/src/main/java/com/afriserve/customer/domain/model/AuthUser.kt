package com.afriserve.customer.domain.model

data class AuthUser(
  val id: Long,
  val fullName: String,
  val email: String,
  val role: String,
  val roles: List<String>,
  val permissions: List<String>,
  val branchId: Int?,
  val primaryRegionId: Int?,
  val clientId: Long?,
  val accessToken: String?,
  val refreshToken: String?,
)
