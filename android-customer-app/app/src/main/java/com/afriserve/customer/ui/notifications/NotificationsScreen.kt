package com.afriserve.customer.ui.notifications

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afriserve.customer.ui.components.AfriServeTopBar
import com.afriserve.customer.ui.components.EmptyState
import com.afriserve.customer.utils.formatIsoDateTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
  viewModel: NotificationsViewModel,
  onBack: () -> Unit,
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()

  Column(modifier = Modifier.fillMaxSize()) {
    AfriServeTopBar(title = "Notifications")
    TextButton(onClick = {
      viewModel.markAllRead()
      onBack()
    }) {
      Text("Mark all read")
    }
    if (uiState.notifications.isEmpty()) {
      EmptyState("No notifications", "Payment reminders and account updates will show here.")
    } else {
      LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        items(uiState.notifications, key = { it.id }) { notification ->
          Card(
            modifier = Modifier
              .fillMaxWidth()
              .clickable { viewModel.markRead(notification.id) },
          ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
              Text(notification.title, style = MaterialTheme.typography.titleLarge)
              Text(notification.body, style = MaterialTheme.typography.bodyMedium)
              Text(formatIsoDateTime(notification.createdAt), style = MaterialTheme.typography.bodySmall)
            }
          }
        }
      }
    }
  }
}
