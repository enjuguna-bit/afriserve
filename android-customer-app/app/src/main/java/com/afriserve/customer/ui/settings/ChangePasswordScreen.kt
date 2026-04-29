package com.afriserve.customer.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afriserve.customer.ui.components.AfriServeTopBar
import com.afriserve.customer.ui.components.ErrorBanner

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangePasswordScreen(
  viewModel: SettingsViewModel,
  onBack: () -> Unit,
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()
  var currentPassword by remember { mutableStateOf("") }
  var newPassword by remember { mutableStateOf("") }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(20.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    AfriServeTopBar(title = "Change password")
    uiState.error?.let { ErrorBanner(message = it) }
    uiState.message?.let { Text(uiState.message.orEmpty()) }
    OutlinedTextField(
      value = currentPassword,
      onValueChange = { currentPassword = it },
      label = { Text("Current password") },
      modifier = Modifier.fillMaxWidth(),
      visualTransformation = PasswordVisualTransformation(),
    )
    OutlinedTextField(
      value = newPassword,
      onValueChange = { newPassword = it },
      label = { Text("New password") },
      modifier = Modifier.fillMaxWidth(),
      visualTransformation = PasswordVisualTransformation(),
    )
    Button(onClick = { viewModel.changePassword(currentPassword, newPassword) }, modifier = Modifier.fillMaxWidth()) {
      Text("Update password")
    }
    TextButton(onClick = onBack) {
      Text("Back")
    }
  }
}
