package com.afriserve.customer.ui.navigation

import android.content.Intent

sealed class Screen(val route: String) {
  data object Splash : Screen("splash")
  data object Login : Screen("login")
  data object PasswordReset : Screen("password_reset")
  data object PinSetup : Screen("pin_setup")
  data object PinLogin : Screen("pin_login")
  data object Home : Screen("home")
  data object Profile : Screen("profile")
  data object LoanList : Screen("loan_list")
  data object LoanDetail : Screen("loan_detail/{loanId}") {
    fun createRoute(loanId: Long) = "loan_detail/$loanId"
  }
  data object Statement : Screen("statement")
  data object Notifications : Screen("notifications")
  data object Settings : Screen("settings")
  data object ChangePassword : Screen("change_password")
}

data class AppLaunchTarget(
  val route: String? = null,
  val loanId: Long? = null,
) {
  companion object {
    const val EXTRA_ROUTE = "afriserve_route"
    const val EXTRA_LOAN_ID = "afriserve_loan_id"

    fun fromIntent(intent: Intent?): AppLaunchTarget =
      AppLaunchTarget(
        route = intent?.getStringExtra(EXTRA_ROUTE),
        loanId = intent?.getLongExtra(EXTRA_LOAN_ID, -1L)?.takeIf { it > 0L },
      )
  }
}
