package com.afriserve.customer.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.customer.data.repository.AuthRepository
import com.afriserve.customer.utils.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
  val email: String = "",
  val password: String = "",
  val rememberMe: Boolean = true,
  val passwordVisible: Boolean = false,
  val canUseBiometricLogin: Boolean = false,
  val isLoading: Boolean = false,
  val error: String? = null,
  val resetMessage: String? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
  private val authRepository: AuthRepository,
) : ViewModel() {
  private val _uiState = MutableStateFlow(
    LoginUiState(
      canUseBiometricLogin = authRepository.currentUser() != null &&
        authRepository.hasPin() &&
        authRepository.isBiometricEnabled(),
    ),
  )
  val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

  fun updateEmail(value: String) {
    _uiState.update { it.copy(email = value, error = null) }
  }

  fun updatePassword(value: String) {
    _uiState.update { it.copy(password = value, error = null) }
  }

  fun toggleRememberMe() {
    _uiState.update { it.copy(rememberMe = !it.rememberMe) }
  }

  fun togglePasswordVisibility() {
    _uiState.update { it.copy(passwordVisible = !it.passwordVisible) }
  }

  fun dismissError() {
    _uiState.update { it.copy(error = null) }
  }

  fun setError(message: String) {
    _uiState.update { it.copy(error = message) }
  }

  fun login(onSuccess: (requiresPinSetup: Boolean) -> Unit) {
    val state = _uiState.value
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null) }
      when (val result = authRepository.login(state.email, state.password, state.rememberMe)) {
        is NetworkResult.Success -> {
          _uiState.update { it.copy(isLoading = false) }
          onSuccess(!authRepository.hasPin())
        }
        is NetworkResult.Error -> {
          _uiState.update { it.copy(isLoading = false, error = result.message) }
        }
        NetworkResult.Loading -> Unit
      }
    }
  }

  fun completeBiometricSignIn(onSuccess: (requiresPinSetup: Boolean) -> Unit) {
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null) }
      when (val result = authRepository.validateSession()) {
        is NetworkResult.Success -> {
          authRepository.clearReauthRequirement()
          _uiState.update { it.copy(isLoading = false) }
          onSuccess(false)
        }
        is NetworkResult.Error -> {
          _uiState.update { it.copy(isLoading = false, error = result.message) }
        }
        NetworkResult.Loading -> Unit
      }
    }
  }

  fun requestPasswordReset(email: String) {
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null, resetMessage = null) }
      when (val result = authRepository.requestPasswordReset(email)) {
        is NetworkResult.Success -> {
          _uiState.update { it.copy(isLoading = false, resetMessage = result.data) }
        }
        is NetworkResult.Error -> {
          _uiState.update { it.copy(isLoading = false, error = result.message) }
        }
        NetworkResult.Loading -> Unit
      }
    }
  }
}
