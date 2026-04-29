package com.afriserve.loanofficer.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.CreationExtras
import com.afriserve.loanofficer.AppContainer
import com.afriserve.loanofficer.presentation.viewmodel.DashboardViewModel
import com.afriserve.loanofficer.presentation.viewmodel.LoginViewModel
import com.afriserve.loanofficer.presentation.viewmodel.OnboardingViewModel

class OfficerViewModelFactory(
    private val appContainer: AppContainer,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(
        modelClass: Class<T>,
        extras: CreationExtras,
    ): T =
        when {
            modelClass.isAssignableFrom(LoginViewModel::class.java) -> {
                LoginViewModel(
                    authRepository = appContainer.authRepository,
                ) as T
            }

            modelClass.isAssignableFrom(DashboardViewModel::class.java) -> {
                DashboardViewModel(
                    authRepository = appContainer.authRepository,
                    onboardingRepository = appContainer.onboardingRepository,
                    sessionStore = appContainer.sessionStore,
                ) as T
            }

            modelClass.isAssignableFrom(OnboardingViewModel::class.java) -> {
                OnboardingViewModel(
                    savedStateHandle = extras.createSavedStateHandle(),
                    onboardingRepository = appContainer.onboardingRepository,
                    ocrScanner = appContainer.ocrScanner,
                    livenessAnalyzer = appContainer.livenessAnalyzer,
                    fieldLocationClient = appContainer.fieldLocationClient,
                ) as T
            }

            else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
}
