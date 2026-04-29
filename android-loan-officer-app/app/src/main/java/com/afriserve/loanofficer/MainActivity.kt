package com.afriserve.loanofficer

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.afriserve.loanofficer.core.security.BiometricAuthenticator
import com.afriserve.loanofficer.core.ui.theme.AfriserveOfficerTheme
import com.afriserve.loanofficer.presentation.OfficerViewModelFactory
import com.afriserve.loanofficer.presentation.screen.DashboardScreen
import com.afriserve.loanofficer.presentation.screen.LoginScreen
import com.afriserve.loanofficer.presentation.screen.OnboardingScreen
import com.afriserve.loanofficer.presentation.viewmodel.DashboardEvent
import com.afriserve.loanofficer.presentation.viewmodel.DashboardViewModel
import com.afriserve.loanofficer.presentation.viewmodel.LoginViewModel
import com.afriserve.loanofficer.presentation.viewmodel.OnboardingViewModel
import kotlinx.coroutines.launch

private const val LOGIN_ROUTE = "login"
private const val DASHBOARD_ROUTE = "dashboard"
private const val ONBOARDING_ROUTE = "onboarding"
private const val ONBOARDING_ROUTE_PATTERN = "$ONBOARDING_ROUTE/{localId}"
private const val WORKSPACE_INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000L

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as AfriserveLoanOfficerApp
        setContent {
            AfriserveOfficerTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    OfficerApp(
                        activity = this,
                        appContainer = app.appContainer,
                    )
                }
            }
        }
    }
}

@Composable
private fun OfficerApp(
    activity: FragmentActivity,
    appContainer: AppContainer,
) {
    val session by appContainer.sessionStore.currentSession.collectAsStateWithLifecycle()
    val sessionLoaded by appContainer.sessionStore.isLoaded.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val viewModelFactory = remember(appContainer) { OfficerViewModelFactory(appContainer) }
    val biometricAuthenticator = remember(activity) {
        BiometricAuthenticator(ContextCompat.getMainExecutor(activity))
    }

    var unlocked by remember(session?.officerId) {
        mutableStateOf(true)
    }
    var biometricPromptVersion by remember(session?.officerId) {
        mutableIntStateOf(0)
    }

    DisposableEffect(lifecycleOwner, session?.officerId, session?.biometricEnabled) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> {
                    if (session != null) {
                        scope.launch {
                            appContainer.sessionStore.markAppBackgrounded()
                        }
                    }
                }
                Lifecycle.Event.ON_START -> {
                    if (session != null) {
                        scope.launch {
                            val sessionExpired = appContainer.sessionStore.hasExceededInactivityTimeout(
                                timeoutMillis = WORKSPACE_INACTIVITY_TIMEOUT_MS,
                            )
                            if (!sessionExpired) {
                                unlocked = true
                                return@launch
                            }

                            if (session?.biometricEnabled == true && biometricAuthenticator.canAuthenticate(activity)) {
                                unlocked = false
                                biometricPromptVersion += 1
                            } else {
                                appContainer.authRepository.logout()
                            }
                        }
                    }
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(session?.officerId) {
        if (session == null) {
            unlocked = true
            biometricPromptVersion = 0
        }
    }

    LaunchedEffect(sessionLoaded, session?.officerId, biometricPromptVersion) {
        if (!sessionLoaded) {
            return@LaunchedEffect
        }

        if (session == null) {
            unlocked = true
            return@LaunchedEffect
        }

        if (unlocked) {
            return@LaunchedEffect
        }

        unlocked = if (session?.biometricEnabled == true && biometricAuthenticator.canAuthenticate(activity)) {
            biometricAuthenticator.authenticate(
                activity = activity,
                title = "Unlock officer workspace",
                subtitle = "Confirm your identity before accessing customer records.",
            )
        } else {
            false
        }

        if (unlocked) {
            appContainer.sessionStore.clearBackgroundedAt()
        }
    }

    if (!sessionLoaded) {
        LoadingWorkspaceScreen()
        return
    }

    LaunchedEffect(sessionLoaded, session?.officerId, currentBackStackEntry?.destination?.route) {
        if (!sessionLoaded) {
            return@LaunchedEffect
        }

        if (session == null) {
            if (currentBackStackEntry?.destination?.route != LOGIN_ROUTE) {
                navController.navigate(LOGIN_ROUTE) {
                    popUpTo(navController.graph.startDestinationId) { inclusive = true }
                    launchSingleTop = true
                }
            }
        } else if (currentBackStackEntry?.destination?.route == LOGIN_ROUTE) {
            navController.navigate(DASHBOARD_ROUTE) {
                popUpTo(navController.graph.startDestinationId) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = if (session != null) DASHBOARD_ROUTE else LOGIN_ROUTE,
    ) {
        composable(LOGIN_ROUTE) {
            val loginViewModel: LoginViewModel = viewModel(factory = viewModelFactory)
            val state by loginViewModel.uiState.collectAsStateWithLifecycle()

            LoginScreen(
                state = state,
                onEmailChange = loginViewModel::onEmailChange,
                onPasswordChange = loginViewModel::onPasswordChange,
                onTenantIdChange = loginViewModel::onTenantIdChange,
                onLoginClicked = loginViewModel::onLoginClicked,
            )
        }

        composable(DASHBOARD_ROUTE) {
            if (session != null && !unlocked) {
                LockedWorkspaceScreen(
                    onRetry = { biometricPromptVersion += 1 },
                    onLogout = {
                        scope.launch { appContainer.authRepository.logout() }
                    },
                )
            } else {
                val dashboardViewModel: DashboardViewModel = viewModel(factory = viewModelFactory)
                val state by dashboardViewModel.uiState.collectAsStateWithLifecycle()

                LaunchedEffect(dashboardViewModel) {
                    dashboardViewModel.events.collect { event ->
                        when (event) {
                            is DashboardEvent.OpenDraft -> {
                                navController.navigate("$ONBOARDING_ROUTE/${event.localId}")
                            }
                        }
                    }
                }

                DashboardScreen(
                    state = state,
                    onCreateDraft = dashboardViewModel::onCreateDraft,
                    onOpenDraft = dashboardViewModel::onOpenDraft,
                    onLogout = dashboardViewModel::onLogout,
                    onBiometricToggled = dashboardViewModel::onBiometricToggled,
                    onClearDrafts = dashboardViewModel::onClearDrafts,
                    biometricAvailable = biometricAuthenticator.canAuthenticate(activity),
                )
            }
        }

        composable(
            route = ONBOARDING_ROUTE_PATTERN,
            arguments = listOf(navArgument("localId") { type = NavType.StringType }),
        ) { backStackEntry ->
            if (session != null && !unlocked) {
                LockedWorkspaceScreen(
                    onRetry = { biometricPromptVersion += 1 },
                    onLogout = {
                        scope.launch { appContainer.authRepository.logout() }
                    },
                )
            } else {
                val onboardingViewModel: OnboardingViewModel = viewModel(
                    viewModelStoreOwner = backStackEntry,
                    factory = viewModelFactory,
                )
                val state by onboardingViewModel.uiState.collectAsStateWithLifecycle()

                OnboardingScreen(
                    state = state,
                    onBack = { navController.popBackStack() },
                    onSetStep = onboardingViewModel::onSetStep,
                    onUpdateDraft = onboardingViewModel::onUpdateDraft,
                    onToggleHandoff = onboardingViewModel::onToggleHandoff,
                    onSetCustomerPin = onboardingViewModel::onSetCustomerPin,
                    onSetOfficerNotes = onboardingViewModel::onSetOfficerNotes,
                    onSetIdDocumentUri = onboardingViewModel::onSetIdDocumentUri,
                    onCaptureVerifiedFace = onboardingViewModel::onCaptureVerifiedFace,
                    onCaptureIdDocumentAndScan = onboardingViewModel::onCaptureIdDocumentAndScan,
                    onSetKycReviewNote = onboardingViewModel::onSetKycReviewNote,
                    onCaptureLocation = onboardingViewModel::onCaptureLocation,
                    onRunOcr = onboardingViewModel::onRunOcr,
                    onCommitSignature = onboardingViewModel::onCommitSignature,
                    onAddGuarantor = onboardingViewModel::onAddGuarantor,
                    onUpdateGuarantor = onboardingViewModel::onUpdateGuarantor,
                    onRemoveGuarantor = onboardingViewModel::onRemoveGuarantor,
                    onAddCollateral = onboardingViewModel::onAddCollateral,
                    onUpdateCollateral = onboardingViewModel::onUpdateCollateral,
                    onRemoveCollateral = onboardingViewModel::onRemoveCollateral,
                    onSaveDraft = onboardingViewModel::onSaveDraft,
                    onSyncNow = onboardingViewModel::onSyncNow,
                )
            }
        }
    }
}

@Composable
private fun LoadingWorkspaceScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Loading officer workspace",
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            text = "Restoring your secure session and preparing the onboarding tools.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LockedWorkspaceScreen(
    onRetry: () -> Unit,
    onLogout: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Workspace locked",
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            text = "Use fingerprint, Face ID, or device credentials to reopen the onboarding workspace.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
            Text("Retry biometric unlock")
        }
        Button(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Sign out")
        }
    }
}
