package com.afriserve.customer.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight

enum class AfriServeTopBarStyle {
  Large,
  Compact,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AfriServeTopBar(
  title: String,
  style: AfriServeTopBarStyle = AfriServeTopBarStyle.Large,
  showBack: Boolean = false,
  onBackClick: (() -> Unit)? = null,
  unreadCount: Int = 0,
  onNotificationsClick: (() -> Unit)? = null,
  onSettingsClick: (() -> Unit)? = null,
  scrollBehavior: TopAppBarScrollBehavior? = null,
) {
  val navigationIcon: @Composable (() -> Unit)? =
    if (showBack && onBackClick != null) {
      {
        IconButton(onClick = onBackClick) {
          Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
        }
      }
    } else {
      null
    }

  val actions: @Composable () -> Unit = {
    if (onNotificationsClick != null) {
      IconButton(onClick = onNotificationsClick) {
        BadgedBox(
          badge = {
            if (unreadCount > 0) {
              Badge { Text(text = unreadCount.coerceAtMost(9).toString()) }
            }
          },
        ) {
          Icon(Icons.Outlined.Notifications, contentDescription = "Notifications")
        }
      }
    }
    if (onSettingsClick != null) {
      IconButton(onClick = onSettingsClick) {
        Icon(Icons.Outlined.Settings, contentDescription = "Settings")
      }
    }
  }

  when (style) {
    AfriServeTopBarStyle.Large -> LargeTopAppBar(
      title = {
        Text(
          text = title,
          style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.SemiBold),
          color = MaterialTheme.colorScheme.onSurface,
        )
      },
      navigationIcon = { navigationIcon?.invoke() },
      actions = { actions() },
      colors = TopAppBarDefaults.largeTopAppBarColors(
        containerColor = MaterialTheme.colorScheme.background,
        scrolledContainerColor = MaterialTheme.colorScheme.background,
      ),
      scrollBehavior = scrollBehavior,
    )
    AfriServeTopBarStyle.Compact -> TopAppBar(
      title = {
        Text(
          text = title,
          style = MaterialTheme.typography.titleLarge,
          color = MaterialTheme.colorScheme.onSurface,
        )
      },
      navigationIcon = { navigationIcon?.invoke() },
      actions = { actions() },
      colors = TopAppBarDefaults.topAppBarColors(
        containerColor = MaterialTheme.colorScheme.background,
        scrolledContainerColor = MaterialTheme.colorScheme.background,
      ),
      scrollBehavior = scrollBehavior,
    )
  }
}
