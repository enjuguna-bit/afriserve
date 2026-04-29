package com.afriserve.customer.ui.statement

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.customer.data.repository.ClientRepository
import com.afriserve.customer.data.repository.LoanRepository
import com.afriserve.customer.domain.model.StatementEntry
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

data class StatementUiState(
  val isLoading: Boolean = true,
  val error: String? = null,
  val entries: List<StatementEntry> = emptyList(),
  val isGeneratingPdf: Boolean = false,
  val downloadedFile: File? = null,
  val pdfError: String? = null,
)

@HiltViewModel
class StatementViewModel @Inject constructor(
  private val clientRepository: ClientRepository,
  private val loanRepository: LoanRepository,
) : ViewModel() {
  private val _uiState = MutableStateFlow(StatementUiState())
  val uiState: StateFlow<StatementUiState> = _uiState.asStateFlow()

  init {
    refresh()
  }

  fun refresh() {
    viewModelScope.launch {
      _uiState.update { it.copy(isLoading = true, error = null) }
      when (val loansResult = clientRepository.getClientLoans()) {
        is NetworkResult.Success -> {
          when (val statementResult = loanRepository.getCrossLoanStatement(loansResult.data)) {
            is NetworkResult.Success -> _uiState.update { it.copy(isLoading = false, entries = statementResult.data) }
            is NetworkResult.Error -> _uiState.update { it.copy(isLoading = false, error = statementResult.message) }
            NetworkResult.Loading -> Unit
          }
        }
        is NetworkResult.Error -> _uiState.update { it.copy(isLoading = false, error = loansResult.message) }
        NetworkResult.Loading -> Unit
      }
    }
  }

  fun downloadStatement(context: Context) {
    viewModelScope.launch {
      _uiState.update { it.copy(isGeneratingPdf = true, pdfError = null) }
      try {
        val profile = clientRepository.getCurrentClientProfile().getOrNull()
          ?: error("Customer profile unavailable")
        val entries = _uiState.value.entries
        val file = withContext(Dispatchers.IO) {
          PdfGenerator.generateCrossLoanStatement(
            context = context.applicationContext,
            profile = profile,
            entries = entries,
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
