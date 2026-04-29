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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import com.afriserve.customer.data.repository.AuthRepository
import com.afriserve.customer.ui.components.ErrorBanner
import com.afriserve.customer.utils.NetworkResult

@Composable
fun PinLoginScreen(
  authRepository: AuthRepository,
  onUnlockSuccess: () -> Unit,
  onUsePassword: () -> Unit,
) {
  val activity = LocalContext.current as? FragmentActivity
  val biometricManager = remember(activity) { activity?.let { BiometricPromptManager(it) } }
  var pin by remember { mutableStateOf("") }
  var error by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(biometricManager, authRepository.isBiometricEnabled()) {
    if (biometricManager != null && authRepository.isBiometricEnabled() && biometricManager.canUseBiometrics()) {
      biometricManager.showPrompt(
        title = "Unlock AfriServe",
        subtitle = "Use your biometric to continue",
        onSuccess = {
          authRepository.clearReauthRequirement()
          onUnlockSuccess()
        },
        onError = { message ->
          error = message
        },
      )
    }
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(20.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Text("Welcome back", style = MaterialTheme.typography.headlineMedium)
    Text("Enter your PIN to continue.")
    error?.let { ErrorBanner(message = it) }
    OutlinedTextField(
      value = pin,
      onValueChange = { if (it.length <= 6) pin = it.filter(Char::isDigit) },
      label = { Text("PIN") },
      modifier = Modifier.fillMaxWidth(),
      visualTransformation = PasswordVisualTransformation(),
    )
    Button(
      onClick = {
        when (val result = authRepository.verifyPin(pin)) {
          is NetworkResult.Success -> onUnlockSuccess()
          is NetworkResult.Error -> error = result.message
          NetworkResult.Loading -> Unit
        }
      },
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Unlock")
    }
    TextButton(onClick = onUsePassword) {
      Text("Use email and password")
    }
  }
}
