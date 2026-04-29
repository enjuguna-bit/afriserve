package com.afriserve.customer.ui.auth

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

class BiometricPromptManager(
  private val activity: FragmentActivity,
) {
  fun canUseBiometrics(): Boolean =
    BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
      BiometricManager.BIOMETRIC_SUCCESS

  fun showPrompt(
    title: String,
    subtitle: String,
    onSuccess: () -> Unit,
    onError: (String) -> Unit,
  ) {
    val executor = ContextCompat.getMainExecutor(activity)
    val biometricPrompt = BiometricPrompt(
      activity,
      executor,
      object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
          onSuccess()
        }

        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
          onError(errString.toString())
        }

        override fun onAuthenticationFailed() {
          onError("Biometric authentication failed.")
        }
      },
    )

    biometricPrompt.authenticate(
      BiometricPrompt.PromptInfo.Builder()
        .setTitle(title)
        .setSubtitle(subtitle)
        .setNegativeButtonText("Use PIN")
        .build(),
    )
  }
}
