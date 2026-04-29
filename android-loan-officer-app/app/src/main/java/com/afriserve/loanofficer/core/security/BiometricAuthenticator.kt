package com.afriserve.loanofficer.core.security

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import com.afriserve.loanofficer.R
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.Executor
import kotlin.coroutines.resume

class BiometricAuthenticator(
    private val executor: Executor,
) {

    fun canAuthenticate(activity: FragmentActivity): Boolean {
        val biometricManager = BiometricManager.from(activity)
        return biometricManager.canAuthenticate(ALLOWED_AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS
    }

    suspend fun authenticate(
        activity: FragmentActivity,
        title: String,
        subtitle: String,
    ): Boolean = suspendCancellableCoroutine { continuation ->
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    if (continuation.isActive) continuation.resume(true)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    if (continuation.isActive) continuation.resume(false)
                }

                override fun onAuthenticationFailed() {
                    // Keep the prompt open for a retry.
                }
            },
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setConfirmationRequired(false)
            .setAllowedAuthenticators(ALLOWED_AUTHENTICATORS)
            .setNegativeButtonText(activity.getString(R.string.biometric_cancel))
            .build()

        prompt.authenticate(promptInfo)
    }

    private companion object {
        const val ALLOWED_AUTHENTICATORS =
            BiometricManager.Authenticators.BIOMETRIC_WEAK
    }
}
