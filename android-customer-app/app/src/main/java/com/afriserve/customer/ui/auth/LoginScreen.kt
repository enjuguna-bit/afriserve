package com.afriserve.customer.ui.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afriserve.customer.BuildConfig
import com.afriserve.customer.R
import com.afriserve.customer.ui.components.ErrorBanner
import com.afriserve.customer.ui.theme.DividerColor
import com.afriserve.customer.ui.theme.Green600
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.Green900
import com.afriserve.customer.ui.theme.TextSecondary

@Composable
fun LoginScreen(
  viewModel: LoginViewModel,
  onForgotPassword: () -> Unit,
  onLoginSuccess: (requiresPinSetup: Boolean) -> Unit,
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()
  val context = LocalContext.current
  val activity = context as? FragmentActivity
  val biometricPromptManager = remember(activity) {
    activity?.let { BiometricPromptManager(it) }
  }

  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(
        brush = Brush.verticalGradient(
          colors = listOf(MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.background),
        ),
      ),
  ) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 24.dp, vertical = 32.dp),
      verticalArrangement = Arrangement.SpaceBetween,
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Spacer(modifier = Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Box(
            modifier = Modifier
              .clip(RoundedCornerShape(28.dp))
              .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.82f))
              .padding(horizontal = 18.dp, vertical = 14.dp),
          ) {
            Image(
              painter = painterResource(id = R.drawable.ic_afriserve_logo),
              contentDescription = "AfriServe",
              modifier = Modifier.width(44.dp),
            )
          }
          Text("AfriServe", style = MaterialTheme.typography.displayLarge, color = Green900)
          Text("Your Financial Partner", style = MaterialTheme.typography.bodyLarge, color = TextSecondary)
          Text(
            text = "If your account is not linked yet, this build will safely fall back to customer #${BuildConfig.DEMO_CLIENT_ID}.",
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
          )
        }

        Column(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(20.dp),
          verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
          uiState.error?.let {
            ErrorBanner(
              message = it,
              onDismiss = viewModel::dismissError,
            )
          }

          OutlinedTextField(
            value = uiState.email,
            onValueChange = viewModel::updateEmail,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Email address") },
            leadingIcon = { Icon(Icons.Outlined.Email, contentDescription = null) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            colors = loginFieldColors(),
          )
          OutlinedTextField(
            value = uiState.password,
            onValueChange = viewModel::updatePassword,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Password") },
            leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) },
            trailingIcon = {
              IconButton(onClick = viewModel::togglePasswordVisibility) {
                Icon(
                  imageVector = if (uiState.passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                  contentDescription = if (uiState.passwordVisible) "Hide password" else "Show password",
                )
              }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            visualTransformation = if (uiState.passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            colors = loginFieldColors(),
          )

          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
          ) {
            TextButton(onClick = onForgotPassword) {
              Text("Forgot password?")
            }
          }

          Button(
            onClick = { viewModel.login(onLoginSuccess) },
            modifier = Modifier
              .fillMaxWidth()
              .height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Green700),
            enabled = !uiState.isLoading,
          ) {
            if (uiState.isLoading) {
              CircularProgressIndicator(
                modifier = Modifier.width(20.dp),
                strokeWidth = 2.5.dp,
                color = MaterialTheme.colorScheme.onPrimary,
              )
            } else {
              Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
              ) {
                Text("Sign In")
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, contentDescription = null)
              }
            }
          }

          Text(
            text = "or sign in faster",
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
            modifier = Modifier.align(Alignment.CenterHorizontally),
          )

          TextButton(
            onClick = {
              val manager = biometricPromptManager
              if (manager != null && manager.canUseBiometrics() && uiState.canUseBiometricLogin) {
                manager.showPrompt(
                  title = "Biometric sign in",
                  subtitle = "Use your fingerprint to unlock AfriServe",
                  onSuccess = { viewModel.completeBiometricSignIn(onLoginSuccess) },
                  onError = viewModel::setError,
                )
              }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = uiState.canUseBiometricLogin && activity != null,
          ) {
            Row(
              horizontalArrangement = Arrangement.spacedBy(10.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Icon(Icons.Outlined.Fingerprint, contentDescription = null)
              Text("Use Biometrics")
            }
          }
        }
      }

      Text(
        text = "v${BuildConfig.VERSION_NAME} · Secured by AfriServe",
        style = MaterialTheme.typography.bodyMedium,
        color = TextSecondary,
        modifier = Modifier.align(Alignment.CenterHorizontally),
      )
    }
  }
}

@Composable
private fun loginFieldColors() = OutlinedTextFieldDefaults.colors(
  focusedBorderColor = Green600,
  unfocusedBorderColor = DividerColor,
  focusedLabelColor = Green700,
  focusedLeadingIconColor = Green700,
  focusedTrailingIconColor = Green700,
)
