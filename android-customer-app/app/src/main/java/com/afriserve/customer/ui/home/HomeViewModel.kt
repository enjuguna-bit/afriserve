package com.afriserve.customer.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.customer.data.repository.ClientRepository
import com.afriserve.customer.data.repository.LoanRepository
import com.afriserve.customer.domain.model.ClientProfile
import com.afriserve.customer.domain.model.KycStatus
import com.afriserve.customer.domain.model.Loan
import com.afriserve.customer.domain.model.LoanInstallment
import com.afriserve.customer.domain.model.LoanStatus
import com.afriserve.customer.domain.model.Repayment
import com.afriserve.customer.utils.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(
  val isLoading: Boolean = true,
  val error: String? = null,
  val clientId: Long? = null,
  val clientName: String = "",
  val profile: ClientProfile? = null,
  val kycStatus: KycStatus = KycStatus.PENDING,
  val activeLoans: List<Loan> = emptyList(),
  val installmentsByLoanId: Map<Long, List<LoanInstallment>> = emptyMap(),
  val overdueInstallments: List<LoanInstallment> = emptyList(),
  val recentRepayments: List<Repayment> = emptyList(),
  val totalOutstanding: Double = 0.0,
  val nextDueDate: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
  private val clientRepository: ClientRepository,
  private val loanRepository: LoanRepository,
) : ViewModel() {
  private val _uiState = MutableStateFlow(HomeUiState())
  val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

  init {
    refresh()
  }

  fun refresh() {
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null) }
      when (val result = clientRepository.getCustomer360()) {
        is NetworkResult.Success -> {
          val loans = result.data.loans
          val installments = loans
            .filter { it.status == LoanStatus.ACTIVE || it.status == LoanStatus.OVERDUE || it.status == LoanStatus.RESTRUCTURED || it.status == LoanStatus.APPROVED }
            .map { loan ->
              async {
                loan.id to (loanRepository.getInstallments(loan.id).getOrNull().orEmpty())
              }
            }
            .awaitAll()
            .toMap()

          val overdueInstallments = installments.values.flatten().filter { it.status.name == "OVERDUE" }
          val activeLoans = activeLoans(loans)
          val nextDueDate = installments.values.flatten()
            .filter { it.status.name == "PENDING" || it.status.name == "PARTIAL" || it.status.name == "OVERDUE" }
            .minByOrNull { it.dueDate }
            ?.dueDate
          _uiState.update {
            it.copy(
              isLoading = false,
              clientId = result.data.profile.id,
              clientName = result.data.profile.fullName,
              profile = result.data.profile,
              kycStatus = result.data.profile.kycStatus,
              activeLoans = activeLoans,
              installmentsByLoanId = installments,
              overdueInstallments = overdueInstallments,
              recentRepayments = result.data.recentRepayments.take(5),
              totalOutstanding = activeLoans.sumOf { loan -> loan.balance },
              nextDueDate = nextDueDate,
            )
          }
        }
        is NetworkResult.Error -> {
          _uiState.update { it.copy(isLoading = false, error = result.message) }
        }
        NetworkResult.Loading -> Unit
      }
    }
  }

  fun activeLoans(loans: List<Loan>): List<Loan> =
    loans.filter {
      it.status == LoanStatus.ACTIVE ||
        it.status == LoanStatus.OVERDUE ||
        it.status == LoanStatus.RESTRUCTURED ||
        it.status == LoanStatus.APPROVED
    }
}
