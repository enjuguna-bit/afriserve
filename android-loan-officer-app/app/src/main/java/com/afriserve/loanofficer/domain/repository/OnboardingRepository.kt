package com.afriserve.loanofficer.domain.repository

import com.afriserve.loanofficer.domain.model.DashboardSnapshot
import com.afriserve.loanofficer.domain.model.OfficerSession
import com.afriserve.loanofficer.domain.model.OnboardingDraft
import com.afriserve.loanofficer.domain.model.OnboardingDraftSummary
import com.afriserve.loanofficer.domain.model.SyncReport
import kotlinx.coroutines.flow.Flow

interface OnboardingRepository {
    fun observeDashboard(): Flow<DashboardSnapshot>

    fun observeDraftSummaries(): Flow<List<OnboardingDraftSummary>>

    fun observeDraft(localId: String): Flow<OnboardingDraft?>

    suspend fun createDraft(session: OfficerSession): OnboardingDraft

    suspend fun saveDraft(draft: OnboardingDraft)

    suspend fun refreshDraftFromServer(localId: String): OnboardingDraft?

    suspend fun queueDraftForSync(localId: String)

    suspend fun deleteDraft(localId: String)

    suspend fun clearLocalDrafts(): Int

    suspend fun syncPendingDrafts(): SyncReport
}
