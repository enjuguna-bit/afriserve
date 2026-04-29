package com.afriserve.loanofficer

import android.app.Application
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.afriserve.loanofficer.data.sync.OnboardingSyncWorker
import java.util.concurrent.TimeUnit

class AfriserveLoanOfficerApp : Application() {
    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        appContainer = AppContainer(this)
        scheduleBackgroundSync()
    }

    private fun scheduleBackgroundSync() {
        val request = PeriodicWorkRequestBuilder<OnboardingSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            // Exponential backoff: first retry after 30 s, then doubles each time (capped by
            // WorkManager's internal maximum of ~5 hours). This avoids hammering the server
            // when the backend is temporarily unavailable.
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            SYNC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    private companion object {
        const val SYNC_WORK_NAME = "onboarding_sync"
    }
}
