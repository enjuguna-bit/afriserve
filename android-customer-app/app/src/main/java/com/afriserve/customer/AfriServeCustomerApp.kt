package com.afriserve.customer

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.work.Configuration
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.afriserve.customer.data.repository.AuthRepository
import com.afriserve.customer.work.NotificationSyncWorker
import com.afriserve.customer.work.TokenRefreshWorker
import dagger.hilt.android.HiltAndroidApp
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import android.app.Application
import androidx.hilt.work.HiltWorkerFactory

@HiltAndroidApp
class AfriServeCustomerApp : Application(), Configuration.Provider, DefaultLifecycleObserver {
  @Inject lateinit var workerFactory: HiltWorkerFactory
  @Inject lateinit var authRepository: AuthRepository

  override val workManagerConfiguration: Configuration
    get() = Configuration.Builder()
      .setWorkerFactory(workerFactory)
      .build()

  override fun onCreate() {
    super<Application>.onCreate()
    scheduleWorkers()
    ProcessLifecycleOwner.get().lifecycle.addObserver(this)
  }

  override fun onStart(owner: LifecycleOwner) {
    authRepository.evaluateForeground(SESSION_TIMEOUT_MILLIS)
  }

  override fun onStop(owner: LifecycleOwner) {
    authRepository.markBackgrounded()
  }

  private fun scheduleWorkers() {
    val workManager = WorkManager.getInstance(this)
    val networkConstraint = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()

    val tokenRefreshWork = PeriodicWorkRequestBuilder<TokenRefreshWorker>(50, TimeUnit.MINUTES)
      .setConstraints(networkConstraint)
      .build()
    workManager.enqueueUniquePeriodicWork(
      "token-refresh",
      ExistingPeriodicWorkPolicy.UPDATE,
      tokenRefreshWork,
    )

    val notificationSyncWork = PeriodicWorkRequestBuilder<NotificationSyncWorker>(15, TimeUnit.MINUTES)
      .setConstraints(networkConstraint)
      .build()
    workManager.enqueueUniquePeriodicWork(
      "notification-sync",
      ExistingPeriodicWorkPolicy.UPDATE,
      notificationSyncWork,
    )
  }

  private companion object {
    const val SESSION_TIMEOUT_MILLIS = 30L * 60L * 1000L
  }
}
