package com.afriserve.customer.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afriserve.customer.ui.components.ErrorBanner

@Composable
fun PasswordResetScreen(
  viewModel: LoginViewModel,
  onBack: () -> Unit,
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()
  var email by remember { mutableStateOf(uiState.email) }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(20.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Text("Reset password", style = MaterialTheme.typography.headlineMedium)
    Text("Enter your email to receive reset instructions.")
    uiState.error?.let { ErrorBanner(message = it) }
    uiState.resetMessage?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
    OutlinedTextField(
      value = email,
      onValueChange = { email = it },
      label = { Text("Email") },
      modifier = Modifier.fillMaxWidth(),
      singleLine = true,
    )
    Button(onClick = { viewModel.requestPasswordReset(email) }, modifier = Modifier.fillMaxWidth()) {
      Text("Send reset link")
    }
    TextButton(onClick = onBack) {
      Text("Back")
    }
  }
}
