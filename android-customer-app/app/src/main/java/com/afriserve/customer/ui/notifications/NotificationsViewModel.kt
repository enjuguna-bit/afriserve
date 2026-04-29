package com.afriserve.customer.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.customer.data.local.TokenStore
import com.afriserve.customer.domain.model.CustomerNotification
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class NotificationsUiState(
  val notifications: List<CustomerNotification> = emptyList(),
  val unreadCount: Int = 0,
)

@HiltViewModel
class NotificationsViewModel @Inject constructor(
  private val tokenStore: TokenStore,
) : ViewModel() {
  val uiState: StateFlow<NotificationsUiState> = tokenStore.notifications
    .map { items ->
      NotificationsUiState(
        notifications = items,
        unreadCount = items.count { !it.isRead },
      )
    }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), NotificationsUiState())

  fun markRead(notificationId: String) {
    tokenStore.markNotificationRead(notificationId)
  }

  fun markAllRead() {
    tokenStore.markAllNotificationsRead()
  }
}
