package com.afriserve.customer.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import com.afriserve.customer.data.repository.AuthRepository
import com.afriserve.customer.ui.components.ErrorBanner
import com.afriserve.customer.utils.NetworkResult

@Composable
fun PinSetupScreen(
  authRepository: AuthRepository,
  onSkip: () -> Unit,
  onPinSaved: () -> Unit,
) {
  var pin by remember { mutableStateOf("") }
  var confirmPin by remember { mutableStateOf("") }
  var enableBiometric by remember { mutableStateOf(authRepository.isBiometricEnabled()) }
  var error by remember { mutableStateOf<String?>(null) }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(20.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Text("Set up your PIN", style = MaterialTheme.typography.headlineMedium)
    Text("Use a 4 to 6 digit PIN for quick secure access.")
    error?.let { ErrorBanner(message = it) }
    OutlinedTextField(
      value = pin,
      onValueChange = { if (it.length <= 6) pin = it.filter(Char::isDigit) },
      label = { Text("PIN") },
      modifier = Modifier.fillMaxWidth(),
      visualTransformation = PasswordVisualTransformation(),
    )
    OutlinedTextField(
      value = confirmPin,
      onValueChange = { if (it.length <= 6) confirmPin = it.filter(Char::isDigit) },
      label = { Text("Confirm PIN") },
      modifier = Modifier.fillMaxWidth(),
      visualTransformation = PasswordVisualTransformation(),
    )
    androidx.compose.foundation.layout.Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
    ) {
      Text("Enable biometric unlock")
      Switch(
        checked = enableBiometric,
        onCheckedChange = {
          enableBiometric = it
          authRepository.setBiometricEnabled(it)
        },
      )
    }
    Button(
      onClick = {
        error = when {
          pin.length !in 4..6 -> "PIN must be 4 to 6 digits."
          pin != confirmPin -> "PINs do not match."
          else -> when (val result = authRepository.savePin(pin)) {
            is NetworkResult.Success -> {
              onPinSaved()
              null
            }
            is NetworkResult.Error -> result.message
            NetworkResult.Loading -> null
          }
        }
      },
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Save PIN")
    }
    TextButton(onClick = onSkip) {
      Text("Skip for now")
    }
  }
}
