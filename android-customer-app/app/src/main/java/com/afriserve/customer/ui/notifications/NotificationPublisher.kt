package com.afriserve.customer.ui.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.afriserve.customer.MainActivity
import com.afriserve.customer.R
import com.afriserve.customer.domain.model.CustomerNotification
import com.afriserve.customer.ui.navigation.AppLaunchTarget

object NotificationPublisher {
  private const val CHANNEL_ID = "afriserve_customer_updates"

  fun show(context: Context, notification: CustomerNotification) {
    ensureChannel(context)

    val targetIntent = Intent(context, MainActivity::class.java).apply {
      putExtra(AppLaunchTarget.EXTRA_ROUTE, resolveRoute(notification.type.wireValue))
      notification.loanId?.let { putExtra(AppLaunchTarget.EXTRA_LOAN_ID, it) }
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
      context,
      notification.id.hashCode(),
      targetIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val systemNotification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(notification.title)
      .setContentText(notification.body)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    NotificationManagerCompat.from(context).notify(notification.id.hashCode(), systemNotification)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Customer Updates",
      NotificationManager.IMPORTANCE_DEFAULT,
    )
    manager.createNotificationChannel(channel)
  }

  private fun resolveRoute(type: String): String =
    when (type) {
      "payment_due", "loan_approved", "loan_disbursed" -> "loan_detail/{loanId}"
      "payment_received" -> "statement"
      "kyc_update", "profile_refresh" -> "profile"
      else -> "notifications"
    }
}
