package com.afriserve.customer.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val AfriServeColorScheme = lightColorScheme(
  primary = Green700,
  onPrimary = Color.White,
  primaryContainer = Green50,
  onPrimaryContainer = Green900,
  secondary = Gold500,
  onSecondary = Color.White,
  secondaryContainer = Gold100,
  onSecondaryContainer = Gold600,
  surface = Surface,
  onSurface = OnSurface,
  surfaceVariant = Color(0xFFF0F4F0),
  background = Color(0xFFF5F7F5),
  error = ErrorRed,
  outline = Color(0xFFCDD5D0),
)

@Composable
fun AfriServeTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = AfriServeColorScheme,
    typography = AfriServeTypography,
    content = content,
  )
}

@Composable
fun AfriServeCustomerTheme(content: @Composable () -> Unit) {
  AfriServeTheme(content = content)
}
