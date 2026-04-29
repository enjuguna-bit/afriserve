package com.afriserve.customer.ui.theme

import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.text.googlefonts.GoogleFont.Provider
import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import com.afriserve.customer.R
import androidx.compose.ui.unit.sp

private val fontProvider = Provider(
  providerAuthority = "com.google.android.gms.fonts",
  providerPackage = "com.google.android.gms",
  certificates = R.array.com_google_android_gms_fonts_certs,
)

private val inter = GoogleFont("Inter")
private val InterFontFamily = FontFamily(
  Font(googleFont = inter, fontProvider = fontProvider, weight = FontWeight.Normal),
  Font(googleFont = inter, fontProvider = fontProvider, weight = FontWeight.Medium),
  Font(googleFont = inter, fontProvider = fontProvider, weight = FontWeight.SemiBold),
  Font(googleFont = inter, fontProvider = fontProvider, weight = FontWeight.Bold),
)

val AfriServeTypography = Typography(
  displayLarge = TextStyle(
    fontFamily = InterFontFamily,
    fontSize = 32.sp,
    fontWeight = FontWeight.Bold,
    letterSpacing = (-0.5).sp,
  ),
  headlineLarge = TextStyle(
    fontFamily = InterFontFamily,
    fontSize = 24.sp,
    fontWeight = FontWeight.SemiBold,
  ),
  headlineMedium = TextStyle(
    fontFamily = InterFontFamily,
    fontSize = 20.sp,
    fontWeight = FontWeight.SemiBold,
  ),
  titleLarge = TextStyle(
    fontFamily = InterFontFamily,
    fontSize = 18.sp,
    fontWeight = FontWeight.SemiBold,
  ),
  titleMedium = TextStyle(
    fontFamily = InterFontFamily,
    fontSize = 15.sp,
    fontWeight = FontWeight.Medium,
  ),
  bodyLarge = TextStyle(
    fontFamily = InterFontFamily,
    fontSize = 15.sp,
    fontWeight = FontWeight.Normal,
    lineHeight = 22.sp,
  ),
  bodyMedium = TextStyle(
    fontFamily = InterFontFamily,
    fontSize = 13.sp,
    fontWeight = FontWeight.Normal,
    lineHeight = 20.sp,
  ),
  labelLarge = TextStyle(
    fontFamily = InterFontFamily,
    fontSize = 13.sp,
    fontWeight = FontWeight.SemiBold,
    letterSpacing = 0.2.sp,
  ),
  labelSmall = TextStyle(
    fontFamily = InterFontFamily,
    fontSize = 11.sp,
    fontWeight = FontWeight.Medium,
    letterSpacing = 0.4.sp,
  ),
)
