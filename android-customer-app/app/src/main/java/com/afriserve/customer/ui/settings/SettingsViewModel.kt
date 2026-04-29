package com.afriserve.customer.ui.settings

import com.afriserve.customer.BuildConfig
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.customer.data.local.TokenStore
import com.afriserve.customer.data.repository.AuthRepository
import com.afriserve.customer.utils.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SettingsUiState(
  val accountName: String = "",
  val accountEmail: String = "",
  val biometricEnabled: Boolean = false,
  val notificationsEnabled: Boolean = true,
  val apiEndpoint: String = BuildConfig.API_BASE_URL,
  val isLoading: Boolean = false,
  val message: String? = null,
  val error: String? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
  private val authRepository: AuthRepository,
  private val tokenStore: TokenStore,
) : ViewModel() {
  private val _uiState = MutableStateFlow(
    SettingsUiState(
      accountName = authRepository.currentUser()?.fullName.orEmpty(),
      accountEmail = authRepository.currentUser()?.email.orEmpty(),
      biometricEnabled = authRepository.isBiometricEnabled(),
      notificationsEnabled = tokenStore.isNotificationsEnabled(),
    ),
  )
  val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

  fun toggleBiometric(enabled: Boolean) {
    authRepository.setBiometricEnabled(enabled)
    _uiState.update { it.copy(biometricEnabled = enabled) }
  }

  fun toggleNotifications(enabled: Boolean) {
    tokenStore.setNotificationsEnabled(enabled)
    _uiState.update { it.copy(notificationsEnabled = enabled) }
  }

  fun logout(onLoggedOut: () -> Unit) {
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null) }
      authRepository.logout()
      _uiState.update { it.copy(isLoading = false) }
      onLoggedOut()
    }
  }

  fun clearAppData(onCleared: () -> Unit) {
    tokenStore.clearAll()
    onCleared()
  }

  fun changePassword(currentPassword: String, newPassword: String) {
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null, message = null) }
      when (val result = authRepository.changePassword(currentPassword, newPassword)) {
        is NetworkResult.Success -> {
          _uiState.update { it.copy(isLoading = false, message = result.data) }
        }
        is NetworkResult.Error -> {
          _uiState.update { it.copy(isLoading = false, error = result.message) }
        }
        NetworkResult.Loading -> Unit
      }
    }
  }
}
