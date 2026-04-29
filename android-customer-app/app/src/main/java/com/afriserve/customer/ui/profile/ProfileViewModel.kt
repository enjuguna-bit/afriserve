package com.afriserve.customer.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.customer.data.repository.ClientRepository
import com.afriserve.customer.domain.model.ClientGuarantor
import com.afriserve.customer.domain.model.ClientProfile
import com.afriserve.customer.domain.model.CollateralAsset
import com.afriserve.customer.domain.model.Loan
import com.afriserve.customer.domain.model.OnboardingChecklist
import com.afriserve.customer.domain.model.ProfileVersion
import com.afriserve.customer.domain.model.Repayment
import com.afriserve.customer.utils.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfileUiState(
  val isLoading: Boolean = true,
  val error: String? = null,
  val profile: ClientProfile? = null,
  val onboarding: OnboardingChecklist? = null,
  val loans: List<Loan> = emptyList(),
  val recentRepayments: List<Repayment> = emptyList(),
  val guarantors: List<ClientGuarantor> = emptyList(),
  val collaterals: List<CollateralAsset> = emptyList(),
  val profileVersions: List<ProfileVersion> = emptyList(),
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
  private val clientRepository: ClientRepository,
) : ViewModel() {
  private val _uiState = MutableStateFlow(ProfileUiState())
  val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

  init {
    refresh()
  }

  fun refresh() {
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null) }
      when (val result = clientRepository.getCustomer360()) {
        is NetworkResult.Success -> _uiState.update {
          it.copy(
            isLoading = false,
            profile = result.data.profile,
            onboarding = result.data.onboarding,
            loans = result.data.loans,
            recentRepayments = result.data.recentRepayments,
            guarantors = result.data.guarantors,
            collaterals = result.data.collaterals,
            profileVersions = result.data.profileVersions,
          )
        }
        is NetworkResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
        NetworkResult.Loading -> Unit
      }
    }
  }
}
