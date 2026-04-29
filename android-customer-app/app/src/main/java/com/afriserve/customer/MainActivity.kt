package com.afriserve.customer

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.fragment.app.FragmentActivity
import com.afriserve.customer.data.repository.AuthRepository
import com.afriserve.customer.ui.navigation.AppLaunchTarget
import com.afriserve.customer.ui.navigation.NavGraph
import com.afriserve.customer.ui.theme.AfriServeCustomerTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : FragmentActivity() {
  @Inject lateinit var authRepository: AuthRepository

  private var launchTarget by mutableStateOf(AppLaunchTarget.fromIntent(intent))

  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

    setContent {
      AfriServeCustomerTheme {
        NavGraph(
          authRepository = authRepository,
          launchTarget = launchTarget,
        )
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    launchTarget = AppLaunchTarget.fromIntent(intent)
  }
}
