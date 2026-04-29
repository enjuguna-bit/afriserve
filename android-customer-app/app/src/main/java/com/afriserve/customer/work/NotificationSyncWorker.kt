package com.afriserve.customer.work

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.afriserve.customer.data.local.TokenStore
import com.afriserve.customer.data.repository.ClientRepository
import com.afriserve.customer.data.repository.LoanRepository
import com.afriserve.customer.domain.model.CustomerNotification
import com.afriserve.customer.domain.model.NotificationType
import com.afriserve.customer.utils.NetworkResult
import com.afriserve.customer.ui.notifications.NotificationPublisher
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.time.Instant
import java.util.UUID

@HiltWorker
class NotificationSyncWorker @AssistedInject constructor(
  @Assisted appContext: Context,
  @Assisted workerParams: WorkerParameters,
  private val clientRepository: ClientRepository,
  private val loanRepository: LoanRepository,
  private val tokenStore: TokenStore,
) : CoroutineWorker(appContext, workerParams) {
  override suspend fun doWork(): Result {
    val loansResult = clientRepository.getClientLoans()
    if (loansResult !is NetworkResult.Success) return Result.retry()

    loansResult.data.forEach { loan ->
      val installments = loanRepository.getInstallments(loan.id).getOrNull().orEmpty()
      val overdue = installments.filter { it.status.name == "OVERDUE" }
      if (overdue.isNotEmpty()) {
        val notification = CustomerNotification(
          id = "overdue-${loan.id}-${overdue.first().id}",
          type = NotificationType.PAYMENT_DUE,
          title = NotificationType.PAYMENT_DUE.title,
          body = "Loan #${loan.id} has overdue installment(s).",
          loanId = loan.id,
          createdAt = Instant.now().toString(),
        )
        if (tokenStore.notifications.value.none { it.id == notification.id }) {
          tokenStore.appendNotification(notification)
          NotificationPublisher.show(applicationContext, notification)
        }
      }
    }
    return Result.success()
  }
}
