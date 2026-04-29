package com.afriserve.loanofficer.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.loanofficer.data.local.SessionStore
import com.afriserve.loanofficer.data.network.ApiErrorParser
import com.afriserve.loanofficer.domain.model.DashboardSnapshot
import com.afriserve.loanofficer.domain.model.OfficerSession
import com.afriserve.loanofficer.domain.repository.AuthRepository
import com.afriserve.loanofficer.domain.repository.OnboardingRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class DashboardUiState(
    val officer: OfficerSession? = null,
    val dashboard: DashboardSnapshot = DashboardSnapshot(
        pendingOnboardings = 0,
        drafts = 0,
        completedToday = 0,
        pendingSync = 0,
        clearableDrafts = 0,
        recentDrafts = emptyList(),
    ),
    val isLoading: Boolean = false,
    val error: String? = null,
    val bannerMessage: String? = null,
)

sealed interface DashboardEvent {
    data class OpenDraft(val localId: String) : DashboardEvent
}

class DashboardViewModel(
    private val authRepository: AuthRepository,
    private val onboardingRepository: OnboardingRepository,
    private val sessionStore: SessionStore,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DashboardUiState(isLoading = true))
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<DashboardEvent>()
    val events: SharedFlow<DashboardEvent> = _events.asSharedFlow()

    init {
        viewModelScope.launch {
            authRepository.observeSession().collect { officer ->
                _uiState.update {
                    it.copy(
                        officer = officer,
                        isLoading = false,
                    )
                }
            }
        }

        viewModelScope.launch {
            onboardingRepository.observeDashboard().collect { dashboard ->
                _uiState.update {
                    it.copy(
                        dashboard = dashboard,
                        isLoading = false,
                    )
                }
            }
        }
    }

    fun onLogout() {
        viewModelScope.launch {
            runCatching { authRepository.logout() }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(error = ApiErrorParser.normalize(error).userMessage)
                    }
                }
        }
    }

    fun onBiometricToggled(enabled: Boolean) {
        viewModelScope.launch {
            runCatching { sessionStore.updateBiometricEnabled(enabled) }
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            error = null,
                            bannerMessage = if (enabled) {
                                "Biometric re-entry is now enabled."
                            } else {
                                "Biometric re-entry is off. After the inactivity window, officers will sign in again."
                            },
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(error = ApiErrorParser.normalize(error).userMessage)
                    }
                }
        }
    }

    fun onCreateDraft() {
        val officer = uiState.value.officer ?: sessionStore.snapshot()
        if (officer == null) {
            _uiState.update {
                it.copy(error = "Your session is no longer available. Sign in again to start onboarding.")
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                withContext(Dispatchers.IO) {
                    onboardingRepository.createDraft(officer)
                }
            }.onSuccess { draft ->
                _uiState.update { it.copy(isLoading = false) }
                _events.emit(DashboardEvent.OpenDraft(draft.localId))
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = ApiErrorParser.normalize(error).userMessage,
                    )
                }
            }
        }
    }

    fun onClearDrafts() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                withContext(Dispatchers.IO) {
                    onboardingRepository.clearLocalDrafts()
                }
            }.onSuccess { clearedCount ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = null,
                        bannerMessage = when (clearedCount) {
                            0 -> "There were no clearable local drafts."
                            1 -> "1 local draft was cleared."
                            else -> "$clearedCount local drafts were cleared."
                        },
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = ApiErrorParser.normalize(error).userMessage,
                    )
                }
            }
        }
    }

    fun onOpenDraft(localId: String) {
        viewModelScope.launch {
            _events.emit(DashboardEvent.OpenDraft(localId))
        }
    }
}
