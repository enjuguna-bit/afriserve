package com.afriserve.customer.ui.notifications

import com.afriserve.customer.data.local.TokenStore
import com.afriserve.customer.domain.model.CustomerNotification
import com.afriserve.customer.domain.model.NotificationType
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

@AndroidEntryPoint
class AfriServeFirebaseMessagingService : FirebaseMessagingService() {
  @Inject lateinit var tokenStore: TokenStore

  override fun onMessageReceived(message: RemoteMessage) {
    val type = NotificationType.fromWireValue(message.data["type"])
    val notification = CustomerNotification(
      id = message.messageId ?: UUID.randomUUID().toString(),
      type = type,
      title = message.data["title"] ?: type.title,
      body = message.data["body"] ?: message.notification?.body.orEmpty(),
      loanId = message.data["loanId"]?.toLongOrNull(),
      createdAt = Instant.now().toString(),
    )
    tokenStore.appendNotification(notification)
    NotificationPublisher.show(this, notification)
  }
}
