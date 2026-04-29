package com.afriserve.customer.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afriserve.customer.BuildConfig
import com.afriserve.customer.ui.components.AfriServeTopBar
import com.afriserve.customer.ui.components.AfriServeTopBarStyle
import com.afriserve.customer.ui.components.ErrorBanner
import com.afriserve.customer.ui.components.LoadingOverlay
import com.afriserve.customer.ui.theme.ErrorRed
import com.afriserve.customer.ui.theme.SurfaceCard
import com.afriserve.customer.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
  viewModel: SettingsViewModel,
  onBack: () -> Unit,
  onOpenChangePassword: () -> Unit,
  onOpenProfile: () -> Unit,
  onLoggedOut: () -> Unit,
  showSnackbar: (String) -> Unit,
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()

  Column(modifier = Modifier.fillMaxSize()) {
    AfriServeTopBar(
      title = "Settings",
      style = AfriServeTopBarStyle.Compact,
      showBack = true,
      onBackClick = onBack,
    )
    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
      item {
        Card(colors = CardDefaults.cardColors(containerColor = SurfaceCard)) {
          Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SettingsRow(
              icon = { androidx.compose.material3.Icon(Icons.Outlined.Person, contentDescription = null) },
              title = uiState.accountName.ifBlank { "AfriServe Customer" },
              subtitle = uiState.accountEmail.ifBlank { "Email unavailable" },
              trailing = { Text("View Profile ->", color = MaterialTheme.colorScheme.primary) },
              onClick = onOpenProfile,
            )
          }
        }
      }
      item {
        Card(colors = CardDefaults.cardColors(containerColor = SurfaceCard)) {
          Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Security", style = MaterialTheme.typography.titleLarge)
            SettingsRow(
              icon = { androidx.compose.material3.Icon(Icons.Outlined.Lock, contentDescription = null) },
              title = "Change Password",
              subtitle = "Update your sign-in password",
              trailing = { Text(">") },
              onClick = onOpenChangePassword,
            )
            SettingsSwitchRow(
              icon = { androidx.compose.material3.Icon(Icons.Outlined.Fingerprint, contentDescription = null) },
              title = "Biometric Login",
              checked = uiState.biometricEnabled,
              onCheckedChange = viewModel::toggleBiometric,
            )
            SettingsRow(
              icon = { androidx.compose.material3.Icon(Icons.Outlined.Lock, contentDescription = null) },
              title = "Change PIN",
              subtitle = "Manage your unlock PIN",
              trailing = { Text(">") },
              onClick = { showSnackbar("PIN management is coming soon.") },
            )
          }
        }
      }
      item {
        Card(colors = CardDefaults.cardColors(containerColor = SurfaceCard)) {
          Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("App", style = MaterialTheme.typography.titleLarge)
            SettingsSwitchRow(
              icon = { androidx.compose.material3.Icon(Icons.Outlined.Notifications, contentDescription = null) },
              title = "Notifications",
              checked = uiState.notificationsEnabled,
              onCheckedChange = viewModel::toggleNotifications,
            )
            SettingsRow(
              icon = { androidx.compose.material3.Icon(Icons.Outlined.Wifi, contentDescription = null) },
              title = "API Endpoint",
              subtitle = uiState.apiEndpoint,
              trailing = { Text("i", color = MaterialTheme.colorScheme.primary) },
              onClick = { showSnackbar(BuildConfig.API_BASE_URL) },
            )
            SettingsRow(
              icon = { androidx.compose.material3.Icon(Icons.Outlined.Info, contentDescription = null) },
              title = "App Version",
              subtitle = "v${BuildConfig.VERSION_NAME}",
            )
          }
        }
      }
      item {
        uiState.error?.let { ErrorBanner(message = it) }
        uiState.message?.let {
          Text(
            text = it,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(vertical = 8.dp),
          )
        }
        Button(
          onClick = { viewModel.logout(onLoggedOut) },
          modifier = Modifier.fillMaxWidth(),
          colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = ErrorRed),
        ) {
          Text("Log Out")
        }
      }
    }
  }

  if (uiState.isLoading) {
    LoadingOverlay(message = "Updating your settings...")
  }
}

@Composable
private fun SettingsRow(
  icon: @Composable () -> Unit,
  title: String,
  subtitle: String,
  trailing: @Composable (() -> Unit)? = null,
  onClick: (() -> Unit)? = null,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Row(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      icon()
      Column {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
      }
    }
    trailing?.invoke()
  }
}

@Composable
private fun SettingsSwitchRow(
  icon: @Composable () -> Unit,
  title: String,
  checked: Boolean,
  onCheckedChange: (Boolean) -> Unit,
) {
  Row(
    modifier = Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
      icon()
      Text(title, style = MaterialTheme.typography.titleMedium)
    }
    Switch(checked = checked, onCheckedChange = onCheckedChange)
  }
}
