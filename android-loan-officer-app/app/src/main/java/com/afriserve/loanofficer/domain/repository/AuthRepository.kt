package com.afriserve.loanofficer.domain.repository

import com.afriserve.loanofficer.domain.model.OfficerSession
import kotlinx.coroutines.flow.Flow

interface AuthRepository {
    suspend fun login(
        email: String,
        password: String,
        tenantId: String,
    ): OfficerSession

    suspend fun logout()

    suspend fun refreshSession(): OfficerSession?

    fun observeSession(): Flow<OfficerSession?>
}
