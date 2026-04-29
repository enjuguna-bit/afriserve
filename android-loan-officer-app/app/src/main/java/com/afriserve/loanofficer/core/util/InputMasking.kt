package com.afriserve.loanofficer.core.util

import java.text.NumberFormat
import java.util.Locale

object InputMasking {

    private val currencyFormat = NumberFormat.getCurrencyInstance(Locale("en", "KE")).apply {
        maximumFractionDigits = 0
    }

    fun formatKenyanPhone(raw: String): String =
        editablePhoneDigits(raw).let { digits ->
            when {
                digits.isBlank() -> emptyList()
                digits.startsWith("0") -> listOf(
                    digits.take(4),
                    digits.drop(4).take(3),
                    digits.drop(7).take(3),
                )
                digits.length <= 9 -> listOf(
                    digits.take(3),
                    digits.drop(3).take(3),
                    digits.drop(6).take(3),
                )
                else -> digits.chunked(3)
            }
                .filter { it.isNotBlank() }
                .joinToString(" ")
        }

    fun sanitizeKenyanPhone(raw: String): String = editablePhoneDigits(raw)

    fun normalizeKenyanPhone(raw: String): String? {
        val digits = editablePhoneDigits(raw)
        return when {
            digits.isBlank() -> null
            digits.startsWith("254") && digits.length in 12..12 -> "+$digits"
            digits.startsWith("0") && digits.length == 10 -> "+254${digits.drop(1)}"
            digits.startsWith("7") && digits.length == 9 -> "+254$digits"
            digits.startsWith("1") && digits.length == 9 -> "+254$digits"
            else -> null
        }
    }

    fun formatNationalId(raw: String): String =
        raw.uppercase().filter(Char::isLetterOrDigit).take(50)

    fun maskNationalId(raw: String): String {
        val cleaned = raw.filter(Char::isLetterOrDigit)
        if (cleaned.length <= 4) return cleaned
        return "${"*".repeat(cleaned.length - 4)}${cleaned.takeLast(4)}"
    }

    fun formatCurrency(raw: String): String {
        val digits = raw.filter { it.isDigit() || it == '.' }
        val parsed = digits.toDoubleOrNull() ?: return raw
        return currencyFormat.format(parsed)
    }

    fun digitsOnly(raw: String): String = raw.filter(Char::isDigit)

    private fun editablePhoneDigits(raw: String): String =
        raw.filter(Char::isDigit).take(12)
}
