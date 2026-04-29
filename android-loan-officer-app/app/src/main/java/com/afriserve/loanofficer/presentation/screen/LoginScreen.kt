package com.afriserve.loanofficer.presentation.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.afriserve.loanofficer.BuildConfig
import com.afriserve.loanofficer.presentation.component.AfriserveLogo
import com.afriserve.loanofficer.presentation.component.StatusPill
import com.afriserve.loanofficer.presentation.viewmodel.LoginUiState
import kotlinx.coroutines.delay

@Composable
fun LoginScreen(
    state: LoginUiState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onTenantIdChange: (String) -> Unit,
    onLoginClicked: () -> Unit,
) {
    var passwordVisible by remember { mutableStateOf(false) }
    var visible by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        delay(60)
        visible = true
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colorStops = arrayOf(
                        0.0f to MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                        0.45f to MaterialTheme.colorScheme.background,
                        1.0f to MaterialTheme.colorScheme.secondary.copy(alpha = 0.07f),
                    ),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(400)) + slideInVertically(tween(400)) { -40 },
            ) {
                Surface(
                    shape = RoundedCornerShape(28.dp),
                    tonalElevation = 0.dp,
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 0.dp,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(28.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        AfriserveLogo(
                            modifier = Modifier
                                .fillMaxWidth(0.55f)
                                .height(80.dp),
                        )
                        StatusPill(
                            label = "Field Officer Workspace",
                            backgroundColor = MaterialTheme.colorScheme.tertiaryContainer,
                            contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                        )
                        Text(
                            text = "Onboard clients from the field",
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                            textAlign = TextAlign.Center,
                        )
                        Text(
                            text = "Biometric-ready, offline-resilient and tenant-aware. Uses the same credentials as the Afriserve web system.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }

            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(500, delayMillis = 100)) + slideInVertically(tween(500, delayMillis = 100)) { 40 },
            ) {
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    tonalElevation = 4.dp,
                    color = MaterialTheme.colorScheme.surface,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(22.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Text(
                            text = "Officer sign-in",
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                        )

                        OutlinedTextField(
                            value = state.email,
                            onValueChange = onEmailChange,
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Work email") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            shape = RoundedCornerShape(12.dp),
                        )

                        OutlinedTextField(
                            value = state.password,
                            onValueChange = onPasswordChange,
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Password") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            visualTransformation = if (passwordVisible) {
                                VisualTransformation.None
                            } else {
                                PasswordVisualTransformation()
                            },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            trailingIcon = {
                                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                    Icon(
                                        imageVector = if (passwordVisible) {
                                            Icons.Outlined.VisibilityOff
                                        } else {
                                            Icons.Outlined.Visibility
                                        },
                                        contentDescription = if (passwordVisible) "Hide password" else "Show password",
                                    )
                                }
                            },
                        )

                        OutlinedTextField(
                            value = state.tenantId,
                            onValueChange = onTenantIdChange,
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Tenant ID") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            supportingText = {
                                Text(
                                    "Default for this build: ${BuildConfig.DEFAULT_TENANT_ID}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                        )

                        state.error?.let { error ->
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = MaterialTheme.colorScheme.errorContainer,
                            ) {
                                Text(
                                    text = error,
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onErrorContainer,
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        Button(
                            onClick = onLoginClicked,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp),
                            enabled = !state.isLoading,
                            shape = RoundedCornerShape(14.dp),
                            elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
                        ) {
                            if (state.isLoading) {
                                CircularProgressIndicator(
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(22.dp),
                                )
                            } else {
                                Text(
                                    text = "Open officer workspace",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
