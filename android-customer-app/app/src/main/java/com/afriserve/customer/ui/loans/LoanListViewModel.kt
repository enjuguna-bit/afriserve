package com.afriserve.customer.ui.loans

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.customer.data.repository.ClientRepository
import com.afriserve.customer.domain.model.Loan
import com.afriserve.customer.domain.model.LoanStatus
import com.afriserve.customer.utils.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class LoanFilterTab { ALL, ACTIVE, PENDING, CLOSED, OVERDUE }

data class LoanListUiState(
  val isLoading: Boolean = true,
  val error: String? = null,
  val loans: List<Loan> = emptyList(),
  val selectedTab: LoanFilterTab = LoanFilterTab.ALL,
)

@HiltViewModel
class LoanListViewModel @Inject constructor(
  private val clientRepository: ClientRepository,
) : ViewModel() {
  private val _uiState = MutableStateFlow(LoanListUiState())
  val uiState: StateFlow<LoanListUiState> = _uiState.asStateFlow()

  init {
    refresh()
  }

  fun refresh() {
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null) }
      when (val result = clientRepository.getClientLoans()) {
        is NetworkResult.Success -> _uiState.update { it.copy(isLoading = false, loans = result.data) }
        is NetworkResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
        NetworkResult.Loading -> Unit
      }
    }
  }

  fun selectTab(tab: LoanFilterTab) {
    _uiState.update { it.copy(selectedTab = tab) }
  }

  fun filteredLoans(): List<Loan> = when (uiState.value.selectedTab) {
    LoanFilterTab.ALL -> uiState.value.loans
    LoanFilterTab.ACTIVE -> uiState.value.loans.filter {
      it.status == LoanStatus.ACTIVE ||
        it.status == LoanStatus.APPROVED ||
        it.status == LoanStatus.OVERDUE ||
        it.status == LoanStatus.RESTRUCTURED
    }
    LoanFilterTab.PENDING -> uiState.value.loans.filter { it.status == LoanStatus.PENDING_APPROVAL }
    LoanFilterTab.CLOSED -> uiState.value.loans.filter { it.status == LoanStatus.CLOSED || it.status == LoanStatus.WRITTEN_OFF || it.status == LoanStatus.REJECTED }
    LoanFilterTab.OVERDUE -> uiState.value.loans.filter { it.status == LoanStatus.OVERDUE || it.overdueInstallmentCount > 0 || it.overdueAmount > 0.0 }
  }
}
