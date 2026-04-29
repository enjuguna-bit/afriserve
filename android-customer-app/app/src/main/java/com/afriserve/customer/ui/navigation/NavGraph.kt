package com.afriserve.customer.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.afriserve.customer.data.repository.AuthEvent
import com.afriserve.customer.data.repository.AuthRepository
import com.afriserve.customer.ui.auth.LoginScreen
import com.afriserve.customer.ui.auth.LoginViewModel
import com.afriserve.customer.ui.auth.PasswordResetScreen
import com.afriserve.customer.ui.auth.PinLoginScreen
import com.afriserve.customer.ui.auth.PinSetupScreen
import com.afriserve.customer.ui.home.HomeScreen
import com.afriserve.customer.ui.home.HomeViewModel
import com.afriserve.customer.ui.loans.LoanDetailScreen
import com.afriserve.customer.ui.loans.LoanDetailViewModel
import com.afriserve.customer.ui.loans.LoanListScreen
import com.afriserve.customer.ui.loans.LoanListViewModel
import com.afriserve.customer.ui.notifications.NotificationsScreen
import com.afriserve.customer.ui.notifications.NotificationsViewModel
import com.afriserve.customer.ui.profile.ProfileScreen
import com.afriserve.customer.ui.profile.ProfileViewModel
import com.afriserve.customer.ui.settings.ChangePasswordScreen
import com.afriserve.customer.ui.settings.SettingsScreen
import com.afriserve.customer.ui.settings.SettingsViewModel
import com.afriserve.customer.ui.statement.StatementScreen
import com.afriserve.customer.ui.statement.StatementViewModel
import com.afriserve.customer.ui.theme.Green50
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.Green900
import com.afriserve.customer.ui.theme.TextTertiary
import kotlinx.coroutines.launch

@Composable
fun NavGraph(
  authRepository: AuthRepository,
  launchTarget: AppLaunchTarget,
) {
  val navController = rememberNavController()
  val snackbarHostState = remember { SnackbarHostState() }
  val notificationsViewModel: NotificationsViewModel = hiltViewModel()
  val notificationsUiState by notificationsViewModel.uiState.collectAsStateWithLifecycle()
  val navBackStackEntry by navController.currentBackStackEntryAsState()
  val currentDestination = navBackStackEntry?.destination
  val bottomBarRoutes = setOf(Screen.Home.route, Screen.LoanList.route, Screen.Statement.route, Screen.Profile.route)
  val showBottomBar = currentDestination?.route in bottomBarRoutes
  val scope = rememberCoroutineScope()

  LaunchedEffect(authRepository.authEvents) {
    authRepository.authEvents.collect { event ->
      if (event == AuthEvent.SessionExpired) {
        navController.navigate(Screen.Login.route) {
          popUpTo(0)
        }
        authRepository.clearAuthEvent()
        scope.launch {
          snackbarHostState.showSnackbar("Your session has expired. Please sign in again.")
        }
      }
    }
  }

  LaunchedEffect(launchTarget.route, launchTarget.loanId) {
    when (launchTarget.route) {
      Screen.Notifications.route -> navController.navigate(Screen.Notifications.route)
      Screen.Profile.route -> navController.navigate(Screen.Profile.route)
      Screen.Statement.route -> navController.navigate(Screen.Statement.route)
      Screen.LoanDetail.route -> launchTarget.loanId?.let { navController.navigate(Screen.LoanDetail.createRoute(it)) }
    }
  }

  Scaffold(
    bottomBar = {
      if (showBottomBar) {
        NavigationBar(
          containerColor = Color.White,
          tonalElevation = 0.dp,
          modifier = Modifier.shadow(
            elevation = 12.dp,
            ambientColor = Color.Transparent,
            spotColor = Color(0x1F1B3A2D),
          ),
        ) {
          val items = listOf(
            Triple(Screen.Home.route, "Home", Icons.Outlined.Home),
            Triple(Screen.LoanList.route, "Loans", Icons.AutoMirrored.Outlined.ViewList),
            Triple(Screen.Statement.route, "Statement", Icons.AutoMirrored.Outlined.ReceiptLong),
            Triple(Screen.Profile.route, "Profile", Icons.Outlined.Person),
          )
          items.forEach { (route, label, icon) ->
            NavigationBarItem(
              selected = currentDestination?.hierarchy?.any { it.route == route } == true,
              onClick = {
                navController.navigate(route) {
                  launchSingleTop = true
                  popUpTo(Screen.Home.route) { saveState = true }
                  restoreState = true
                }
              },
              icon = {
                if (route == Screen.Profile.route && notificationsUiState.unreadCount > 0) {
                  BadgedBox(
                    badge = { Badge { androidx.compose.material3.Text(notificationsUiState.unreadCount.coerceAtMost(9).toString()) } },
                  ) {
                    Icon(icon, contentDescription = label)
                  }
                } else {
                  Icon(icon, contentDescription = label)
                }
              },
              label = { androidx.compose.material3.Text(label) },
              colors = androidx.compose.material3.NavigationBarItemDefaults.colors(
                selectedIconColor = Green700,
                selectedTextColor = Green700,
                indicatorColor = Green50,
                unselectedIconColor = TextTertiary,
                unselectedTextColor = TextTertiary,
              ),
            )
          }
        }
      }
    },
    snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
  ) { innerPadding ->
    NavHost(
      navController = navController,
      startDestination = Screen.Splash.route,
      modifier = Modifier.padding(innerPadding),
    ) {
      composable(Screen.Splash.route) {
        SplashRoute(
          authRepository = authRepository,
          navigateToLogin = { navController.navigate(Screen.Login.route) { popUpTo(0) } },
          navigateToPin = { navController.navigate(Screen.PinLogin.route) { popUpTo(0) } },
          navigateToHome = { navController.navigate(Screen.Home.route) { popUpTo(0) } },
        )
      }
      composable(Screen.Login.route) {
        val viewModel: LoginViewModel = hiltViewModel()
        LoginScreen(
          viewModel = viewModel,
          onForgotPassword = { navController.navigate(Screen.PasswordReset.route) },
          onLoginSuccess = { requiresPinSetup ->
            navController.navigate(if (requiresPinSetup) Screen.PinSetup.route else Screen.Home.route) {
              popUpTo(Screen.Login.route) { inclusive = true }
            }
          },
        )
      }
      composable(Screen.PasswordReset.route) {
        val viewModel: LoginViewModel = hiltViewModel()
        PasswordResetScreen(
          viewModel = viewModel,
          onBack = { navController.popBackStack() },
        )
      }
      composable(Screen.PinSetup.route) {
        PinSetupScreen(
          authRepository = authRepository,
          onSkip = { navController.navigate(Screen.Home.route) { popUpTo(0) } },
          onPinSaved = { navController.navigate(Screen.Home.route) { popUpTo(0) } },
        )
      }
      composable(Screen.PinLogin.route) {
        PinLoginScreen(
          authRepository = authRepository,
          onUnlockSuccess = { navController.navigate(Screen.Home.route) { popUpTo(0) } },
          onUsePassword = { navController.navigate(Screen.Login.route) { popUpTo(0) } },
        )
      }
      composable(Screen.Home.route) {
        val viewModel: HomeViewModel = hiltViewModel()
        HomeScreen(
          viewModel = viewModel,
          unreadCount = notificationsUiState.unreadCount,
          onOpenLoan = { navController.navigate(Screen.LoanDetail.createRoute(it)) },
          onOpenStatement = { navController.navigate(Screen.Statement.route) },
          onOpenNotifications = { navController.navigate(Screen.Notifications.route) },
          onOpenSettings = { navController.navigate(Screen.Settings.route) },
          showSnackbar = { scope.launch { snackbarHostState.showSnackbar(it) } },
        )
      }
      composable(Screen.Profile.route) {
        val viewModel: ProfileViewModel = hiltViewModel()
        ProfileScreen(
          viewModel = viewModel,
          unreadCount = notificationsUiState.unreadCount,
          onOpenNotifications = { navController.navigate(Screen.Notifications.route) },
          onOpenSettings = { navController.navigate(Screen.Settings.route) },
        )
      }
      composable(Screen.LoanList.route) {
        val viewModel: LoanListViewModel = hiltViewModel()
        LoanListScreen(
          viewModel = viewModel,
          unreadCount = notificationsUiState.unreadCount,
          onOpenLoan = { navController.navigate(Screen.LoanDetail.createRoute(it)) },
          onOpenNotifications = { navController.navigate(Screen.Notifications.route) },
          onOpenSettings = { navController.navigate(Screen.Settings.route) },
        )
      }
      composable(
        route = Screen.LoanDetail.route,
        arguments = listOf(
          navArgument("loanId") {
            type = NavType.StringType
            nullable = false
          },
        ),
      ) {
        val viewModel: LoanDetailViewModel = hiltViewModel()
        LoanDetailScreen(
          viewModel = viewModel,
          onBack = { navController.popBackStack() },
          onOpenStatement = { navController.navigate(Screen.Statement.route) },
          showSnackbar = { scope.launch { snackbarHostState.showSnackbar(it) } },
        )
      }
      composable(Screen.Statement.route) {
        val viewModel: StatementViewModel = hiltViewModel()
        StatementScreen(
          viewModel = viewModel,
          unreadCount = notificationsUiState.unreadCount,
          onOpenNotifications = { navController.navigate(Screen.Notifications.route) },
          onOpenSettings = { navController.navigate(Screen.Settings.route) },
          showSnackbar = { scope.launch { snackbarHostState.showSnackbar(it) } },
        )
      }
      composable(Screen.Notifications.route) {
        NotificationsScreen(
          viewModel = notificationsViewModel,
          onBack = { navController.popBackStack() },
        )
      }
      composable(Screen.Settings.route) {
        val viewModel: SettingsViewModel = hiltViewModel()
        SettingsScreen(
          viewModel = viewModel,
          onBack = { navController.popBackStack() },
          onOpenChangePassword = { navController.navigate(Screen.ChangePassword.route) },
          onOpenProfile = { navController.navigate(Screen.Profile.route) },
          onLoggedOut = { navController.navigate(Screen.Login.route) { popUpTo(0) } },
          showSnackbar = { scope.launch { snackbarHostState.showSnackbar(it) } },
        )
      }
      composable(Screen.ChangePassword.route) {
        val viewModel: SettingsViewModel = hiltViewModel()
        ChangePasswordScreen(
          viewModel = viewModel,
          onBack = { navController.popBackStack() },
        )
      }
    }
  }
}

@Composable
private fun SplashRoute(
  authRepository: AuthRepository,
  navigateToLogin: () -> Unit,
  navigateToPin: () -> Unit,
  navigateToHome: () -> Unit,
) {
  LaunchedEffect(Unit) {
    if (authRepository.currentUser() == null) {
      navigateToLogin()
      return@LaunchedEffect
    }

    if (authRepository.isReauthRequired() && authRepository.hasPin()) {
      navigateToPin()
      return@LaunchedEffect
    }

    when (authRepository.validateSession()) {
      is com.afriserve.customer.utils.NetworkResult.Success -> navigateToHome()
      else -> navigateToLogin()
    }
  }

  com.afriserve.customer.ui.components.LoadingOverlay(message = "Checking your session...")
}
