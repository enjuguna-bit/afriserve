package com.afriserve.loanofficer.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = MidnightBlue,
    onPrimary = White,
    primaryContainer = Color(0xFFDCE7F5),
    onPrimaryContainer = MidnightBlue,
    secondary = ForestGreen,
    onSecondary = White,
    secondaryContainer = Color(0xFFDCEFD9),
    onSecondaryContainer = Color(0xFF173C1E),
    tertiary = GoldOchre,
    onTertiary = Color(0xFF332104),
    tertiaryContainer = GoldMist,
    onTertiaryContainer = Color(0xFF4B3613),
    error = ErrorRed,
    errorContainer = Color(0xFFF8DAD8),
    onErrorContainer = Color(0xFF5F1515),
    background = MistSurface,
    onBackground = Ink900,
    surface = White,
    surfaceVariant = SageSurface,
    onSurface = Ink900,
    onSurfaceVariant = HarborBlue,
    outline = SlateLine,
)

private val DarkColors = darkColorScheme(
    primary = White,
    onPrimary = MidnightBlue,
    primaryContainer = HarborBlue,
    onPrimaryContainer = White,
    secondary = MeadowGreen,
    onSecondary = Color(0xFF133118),
    secondaryContainer = Color(0xFF275936),
    onSecondaryContainer = Color(0xFFE0F4DF),
    tertiary = GoldOchre,
    onTertiary = Color(0xFF2D1E05),
    tertiaryContainer = Color(0xFF5F471B),
    onTertiaryContainer = Color(0xFFFFE9C0),
    error = Color(0xFFF29A9A),
    errorContainer = Color(0xFF7E2525),
    onErrorContainer = Color(0xFFFFE6E6),
    background = Color(0xFF081B34),
    onBackground = White,
    surface = Color(0xFF102A49),
    surfaceVariant = Color(0xFF173452),
    onSurface = White,
    onSurfaceVariant = Color(0xFFBDD2DF),
    outline = Color(0xFF7990A4),
)

@Composable
fun AfriserveOfficerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = OfficerTypography,
        content = content,
    )
}
