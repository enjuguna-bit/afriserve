package com.afriserve.customer.utils

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private val displayFormatter: DateTimeFormatter = DateTimeFormatter
  .ofLocalizedDate(FormatStyle.MEDIUM)
  .withLocale(Locale.ENGLISH)

private val displayDateTimeFormatter: DateTimeFormatter = DateTimeFormatter
  .ofLocalizedDateTime(FormatStyle.MEDIUM)
  .withLocale(Locale.ENGLISH)

fun isoToLocalDate(iso: String?): LocalDate? = runCatching {
  if (iso.isNullOrBlank()) null else Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate()
}.getOrNull()

fun formatIsoDate(iso: String?): String =
  isoToLocalDate(iso)?.format(displayFormatter) ?: "--"

fun formatIsoDateTime(iso: String?): String = runCatching {
  if (iso.isNullOrBlank()) {
    "--"
  } else {
    Instant.parse(iso).atZone(ZoneId.systemDefault()).format(displayDateTimeFormatter)
  }
}.getOrDefault("--")

fun compareIsoDates(left: String?, right: String?): Int =
  when {
    left == null && right == null -> 0
    left == null -> 1
    right == null -> -1
    else -> runCatching {
      Instant.parse(left).compareTo(Instant.parse(right))
    }.getOrDefault(left.compareTo(right))
  }

fun todayIsoDate(): String = LocalDate.now().toString()
