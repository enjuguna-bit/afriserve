package com.afriserve.customer.ui.loans

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.customer.data.repository.ClientRepository
import com.afriserve.customer.data.repository.LoanRepository
import com.afriserve.customer.domain.model.LoanDetailBundle
import com.afriserve.customer.util.PdfGenerator
import com.afriserve.customer.utils.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class LoanDetailUiState(
  val isLoading: Boolean = true,
  val error: String? = null,
  val bundle: LoanDetailBundle? = null,
  val isGeneratingPdf: Boolean = false,
  val downloadedFile: File? = null,
  val pdfError: String? = null,
)

@HiltViewModel
class LoanDetailViewModel @Inject constructor(
  private val clientRepository: ClientRepository,
  private val loanRepository: LoanRepository,
  savedStateHandle: SavedStateHandle,
) : ViewModel() {
  private val loanId: Long = savedStateHandle.get<String>("loanId")?.toLongOrNull()
    ?: -1L

  private val _uiState = MutableStateFlow(LoanDetailUiState())
  val uiState: StateFlow<LoanDetailUiState> = _uiState.asStateFlow()

  init {
    if (loanId <= 0L) {
      _uiState.update {
        it.copy(
          isLoading = false,
          error = "Invalid loan reference. Please go back and try again.",
        )
      }
    } else {
      refresh()
    }
  }

  fun refresh() {
    if (loanId <= 0L) {
      _uiState.update {
        it.copy(
          isLoading = false,
          error = "Invalid loan reference. Please go back and try again.",
        )
      }
      return
    }
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null) }
      when (val result = loanRepository.getLoanDetail(loanId)) {
        is NetworkResult.Success -> _uiState.update { it.copy(isLoading = false, bundle = result.data) }
        is NetworkResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
        NetworkResult.Loading -> Unit
      }
    }
  }

  fun downloadStatement(context: Context) {
    val bundle = _uiState.value.bundle ?: run {
      _uiState.update { it.copy(pdfError = "Loan statement is not available yet.") }
      return
    }

    viewModelScope.launch {
      _uiState.update { it.copy(isGeneratingPdf = true, pdfError = null) }
      try {
        val profile = clientRepository.getCurrentClientProfile().getOrNull()
          ?: error("Customer profile unavailable")
        val file = withContext(Dispatchers.IO) {
          PdfGenerator.generateLoanStatement(
            context = context.applicationContext,
            profile = profile,
            loan = bundle.loan,
            entries = bundle.statementEntries,
          )
        }
        _uiState.update { it.copy(isGeneratingPdf = false, downloadedFile = file) }
      } catch (e: Exception) {
        _uiState.update {
          it.copy(
            isGeneratingPdf = false,
            pdfError = e.message ?: "PDF generation failed",
          )
        }
      }
    }
  }

  fun clearDownloadedFile() {
    _uiState.update { it.copy(downloadedFile = null) }
  }

  fun clearPdfError() {
    _uiState.update { it.copy(pdfError = null) }
  }
}
