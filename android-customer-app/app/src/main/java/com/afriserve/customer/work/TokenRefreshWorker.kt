package com.afriserve.customer.work

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.afriserve.customer.data.repository.AuthRepository
import com.afriserve.customer.utils.NetworkResult
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

@HiltWorker
class TokenRefreshWorker @AssistedInject constructor(
  @Assisted appContext: Context,
  @Assisted workerParams: WorkerParameters,
  private val authRepository: AuthRepository,
) : CoroutineWorker(appContext, workerParams) {
  override suspend fun doWork(): Result {
    if (authRepository.currentUser() == null) return Result.success()
    return when (authRepository.refreshSession()) {
      is NetworkResult.Success -> Result.success()
      is NetworkResult.Error -> Result.retry()
      NetworkResult.Loading -> Result.retry()
    }
  }
}
