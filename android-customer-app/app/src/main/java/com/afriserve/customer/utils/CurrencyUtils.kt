package com.afriserve.customer.utils

import java.text.NumberFormat
import java.util.Locale

private val kenyaLocale = Locale("en", "KE")
private val kesFormatter: NumberFormat = NumberFormat.getNumberInstance(kenyaLocale).apply {
  minimumFractionDigits = 2
  maximumFractionDigits = 2
}

fun formatKes(amount: Double?): String = "KES ${kesFormatter.format(amount ?: 0.0)}"
