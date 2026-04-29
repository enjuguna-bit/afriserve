package com.afriserve.loanofficer.presentation.viewmodel

import com.afriserve.loanofficer.BuildConfig
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.loanofficer.data.network.ApiErrorParser
import com.afriserve.loanofficer.domain.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val tenantId: String = BuildConfig.DEFAULT_TENANT_ID,
    val isLoading: Boolean = false,
    val error: String? = null,
    val loginSuccess: Boolean = false,
)

class LoginViewModel(
    private val authRepository: AuthRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, error = null, loginSuccess = false) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, error = null, loginSuccess = false) }
    }

    fun onTenantIdChange(value: String) {
        _uiState.update { it.copy(tenantId = value, error = null, loginSuccess = false) }
    }

    fun onLoginClicked() {
        val state = uiState.value
        if (state.email.isBlank() || state.password.isBlank()) {
            _uiState.update {
                it.copy(
                    error = "Enter both email and password before signing in.",
                    loginSuccess = false,
                )
            }
            return
        }

        val tenantId = state.tenantId.trim().ifBlank { BuildConfig.DEFAULT_TENANT_ID }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = true,
                    error = null,
                    loginSuccess = false,
                )
            }

            runCatching {
                authRepository.login(
                    email = state.email.trim(),
                    password = state.password,
                    tenantId = tenantId,
                )
            }.onSuccess {
                _uiState.update { current ->
                    current.copy(
                        password = "",
                        tenantId = tenantId,
                        isLoading = false,
                        error = null,
                        loginSuccess = true,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = ApiErrorParser.normalize(error).userMessage,
                        loginSuccess = false,
                    )
                }
            }
        }
    }
}
