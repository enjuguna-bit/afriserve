package com.afriserve.customer.ui.statement

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afriserve.customer.domain.model.StatementEntryType
import com.afriserve.customer.ui.components.AfriServeTopBar
import com.afriserve.customer.ui.components.AfriServeTopBarStyle
import com.afriserve.customer.ui.components.EmptyState
import com.afriserve.customer.ui.components.ErrorState
import com.afriserve.customer.ui.components.ShimmerBox
import com.afriserve.customer.ui.theme.ErrorRed
import com.afriserve.customer.ui.theme.Green50
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.Green900
import com.afriserve.customer.ui.theme.SurfaceCard
import com.afriserve.customer.ui.theme.TextSecondary
import com.afriserve.customer.ui.theme.TextTertiary
import com.afriserve.customer.utils.compareIsoDates
import com.afriserve.customer.utils.formatIsoDate
import com.afriserve.customer.utils.formatKes
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class, ExperimentalMaterialApi::class)
@Composable
fun StatementScreen(
  viewModel: StatementViewModel,
  unreadCount: Int,
  onOpenNotifications: () -> Unit,
  onOpenSettings: () -> Unit,
  showSnackbar: (String) -> Unit,
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()
  val context = LocalContext.current
  val pullRefreshState = rememberPullRefreshState(
    refreshing = uiState.isLoading,
    onRefresh = viewModel::refresh,
  )
  var selectedType by remember { mutableStateOf(StatementEntryType.ALL) }
  var startDate by remember { mutableStateOf<LocalDate?>(null) }
  var endDate by remember { mutableStateOf<LocalDate?>(null) }
  var openStartPicker by remember { mutableStateOf(false) }
  var openEndPicker by remember { mutableStateOf(false) }

  LaunchedEffect(uiState.downloadedFile) {
    uiState.downloadedFile?.let { file ->
      try {
        val uri = FileProvider.getUriForFile(
          context,
          "${context.packageName}.fileprovider",
          file,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/pdf")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Open Statement PDF"))
      } catch (_: ActivityNotFoundException) {
        showSnackbar("No PDF viewer found on this device.")
      } finally {
        viewModel.clearDownloadedFile()
      }
    }
  }

  LaunchedEffect(uiState.pdfError) {
    uiState.pdfError?.let { message ->
      showSnackbar(message)
      viewModel.clearPdfError()
    }
  }

  val filteredEntries = uiState.entries.filter { entry ->
    val typeMatches = selectedType == StatementEntryType.ALL || entry.type == selectedType
    val startMatches = startDate == null || compareIsoDates(entry.date, startDate.toString()) >= 0
    val endMatches = endDate == null || compareIsoDates(entry.date, endDate.toString()) <= 0
    typeMatches && startMatches && endMatches
  }
  val totalDebits = filteredEntries.sumOf { it.debit }
  val totalCredits = filteredEntries.sumOf { it.credit }
  val groupedByCycle = filteredEntries
    .groupBy { it.loanId ?: 0L }
    .entries
    .sortedBy { group -> group.value.minOfOrNull { it.date } ?: "" }

  when {
    uiState.isLoading && uiState.entries.isEmpty() -> StatementShimmer()
    uiState.error != null && uiState.entries.isEmpty() -> ErrorState(message = uiState.error.orEmpty(), onRetry = viewModel::refresh)
    else -> {
      Column(modifier = Modifier.fillMaxSize()) {
        AfriServeTopBar(
          title = "Account Statement",
          style = AfriServeTopBarStyle.Compact,
          unreadCount = unreadCount,
          onNotificationsClick = onOpenNotifications,
          onSettingsClick = onOpenSettings,
        )
        Text(
          text = "Customer | All Loans",
          modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
          style = MaterialTheme.typography.bodyMedium,
          color = TextSecondary,
        )
        Box(
          modifier = Modifier
            .fillMaxSize()
            .pullRefresh(pullRefreshState),
        ) {
          LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 24.dp),
          ) {
            stickyHeader {
              Column(
                modifier = Modifier
                  .fillMaxWidth()
                  .background(MaterialTheme.colorScheme.background)
                  .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
              ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                  AssistChip(
                    onClick = { openStartPicker = true },
                    label = { Text(startDate?.toString() ?: "Date Range") },
                    leadingIcon = { Icon(Icons.Outlined.CalendarMonth, contentDescription = null) },
                  )
                  AssistChip(
                    onClick = { openEndPicker = true },
                    label = { Text(endDate?.toString() ?: "To") },
                  )
                  OutlinedButton(
                    onClick = { viewModel.downloadStatement(context) },
                    enabled = !uiState.isGeneratingPdf,
                  ) {
                    if (uiState.isGeneratingPdf) {
                      CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                      Spacer(Modifier.size(8.dp))
                      Text("Generating...")
                    } else {
                      Icon(Icons.Outlined.Download, contentDescription = null)
                      Spacer(Modifier.size(8.dp))
                      Text("Download PDF")
                    }
                  }
                }
                ScrollableTabRow(selectedTabIndex = statementTypes().indexOf(selectedType)) {
                  statementTypes().forEachIndexed { index, type ->
                    Tab(
                      selected = statementTypes()[index] == selectedType,
                      onClick = { selectedType = type },
                      text = { Text(statementTypeLabel(type)) },
                    )
                  }
                }
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                  Text("Total Debits: ${formatKes(totalDebits)}", color = ErrorRed)
                  Text("Total Credits: ${formatKes(totalCredits)}", color = Green700)
                }
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                  Text("Date", style = MaterialTheme.typography.labelLarge)
                  Text("Description", style = MaterialTheme.typography.labelLarge)
                  Text("Debit", style = MaterialTheme.typography.labelLarge)
                  Text("Credit", style = MaterialTheme.typography.labelLarge)
                  Text("Balance", style = MaterialTheme.typography.labelLarge)
                }
              }
            }

            if (groupedByCycle.isEmpty()) {
              item {
                EmptyState(
                  title = "No statement entries",
                  message = "Try a different date range or filter to widen the results.",
                )
              }
            } else {
              groupedByCycle.forEach { (loanId, cycleEntries) ->
                val cycleLabel = if (loanId > 0L) loanId.toString().padStart(4, '0') else "UNKNOWN"
                stickyHeader(key = "cycle-header-$loanId") {
                  val disbEntry = cycleEntries.firstOrNull { it.type == StatementEntryType.DISBURSEMENT }
                  Row(
                    modifier = Modifier
                      .fillMaxWidth()
                      .background(Green50)
                      .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                  ) {
                    Column {
                      Text(
                        text = "LOAN CYCLE | #LN-$cycleLabel",
                        style = MaterialTheme.typography.labelLarge,
                        color = Green700,
                      )
                      if (disbEntry != null) {
                        Text(
                          "Disbursed ${disbEntry.date.take(10)} | KES ${formatKes(disbEntry.debit)}",
                          style = MaterialTheme.typography.bodyMedium,
                          color = TextSecondary,
                        )
                      }
                    }
                    Text(
                      "${cycleEntries.size} transactions",
                      style = MaterialTheme.typography.labelSmall,
                      color = TextTertiary,
                    )
                  }
                }

                itemsIndexed(
                  items = cycleEntries,
                  key = { _, entry -> "${loanId}-${entry.date}-${entry.reference}-${entry.description}" },
                ) { index, entry ->
                  val backgroundColor = if (index % 2 == 0) {
                    SurfaceCard
                  } else {
                    MaterialTheme.colorScheme.surfaceVariant
                  }
                  Row(
                    modifier = Modifier
                      .fillMaxWidth()
                      .background(backgroundColor)
                      .padding(horizontal = 16.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                  ) {
                    Column(modifier = Modifier.weight(1f)) {
                      Text(formatIsoDate(entry.date), style = MaterialTheme.typography.bodyMedium)
                      Text(
                        entry.description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        maxLines = 2,
                      )
                    }
                    Text(
                      if (entry.debit > 0.0) formatKes(entry.debit) else "--",
                      color = if (entry.debit > 0.0) ErrorRed else TextTertiary,
                      style = MaterialTheme.typography.bodyMedium,
                      modifier = Modifier.padding(horizontal = 6.dp),
                    )
                    Text(
                      if (entry.credit > 0.0) formatKes(entry.credit) else "--",
                      color = if (entry.credit > 0.0) Green700 else TextTertiary,
                      style = MaterialTheme.typography.bodyMedium,
                      modifier = Modifier.padding(horizontal = 6.dp),
                    )
                    Text(
                      formatKes(entry.runningBalance),
                      style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    )
                  }
                }

                item(key = "cycle-total-$loanId") {
                  Row(
                    modifier = Modifier
                      .fillMaxWidth()
                      .background(Green900.copy(alpha = 0.06f))
                      .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                  ) {
                    Text("Cycle total", style = MaterialTheme.typography.labelMedium, color = TextSecondary)
                    Text(formatKes(cycleEntries.sumOf { it.debit }), color = ErrorRed, style = MaterialTheme.typography.labelMedium)
                    Text(formatKes(cycleEntries.sumOf { it.credit }), color = Green700, style = MaterialTheme.typography.labelMedium)
                    Text(
                      formatKes(cycleEntries.lastOrNull()?.runningBalance ?: 0.0),
                      style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    )
                  }
                }
              }

              stickyHeader(key = "grand-totals-footer") {
                Surface(color = Green900, modifier = Modifier.fillMaxWidth()) {
                  Row(
                    modifier = Modifier
                      .fillMaxWidth()
                      .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                  ) {
                    Column {
                      Text("Total Debits", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
                      Text(formatKes(totalDebits), color = Color(0xFFEF9A9A), style = MaterialTheme.typography.titleMedium)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                      val net = totalCredits - totalDebits
                      Text("Net", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
                      Text(
                        formatKes(net),
                        color = if (net >= 0) Color(0xFFA5D6A7) else Color(0xFFEF9A9A),
                        style = MaterialTheme.typography.titleMedium,
                      )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                      Text("Total Credits", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
                      Text(formatKes(totalCredits), color = Color(0xFFA5D6A7), style = MaterialTheme.typography.titleMedium)
                    }
                  }
                }
              }
            }
          }

          PullRefreshIndicator(
            refreshing = uiState.isLoading,
            state = pullRefreshState,
            modifier = Modifier.align(Alignment.TopCenter),
            backgroundColor = Color.White,
            contentColor = Green700,
          )
        }
      }
    }
  }

  if (openStartPicker) {
    StatementDatePicker(
      initialDate = startDate,
      onDismiss = { openStartPicker = false },
      onConfirm = {
        startDate = it
        openStartPicker = false
      },
    )
  }
  if (openEndPicker) {
    StatementDatePicker(
      initialDate = endDate,
      onDismiss = { openEndPicker = false },
      onConfirm = {
        endDate = it
        openEndPicker = false
      },
    )
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StatementDatePicker(
  initialDate: LocalDate?,
  onDismiss: () -> Unit,
  onConfirm: (LocalDate) -> Unit,
) {
  val millis = initialDate
    ?.atStartOfDay(ZoneId.systemDefault())
    ?.toInstant()
    ?.toEpochMilli()
  val state = rememberDatePickerState(initialSelectedDateMillis = millis)
  DatePickerDialog(
    onDismissRequest = onDismiss,
    confirmButton = {
      TextButton(
        onClick = {
          state.selectedDateMillis?.let { value ->
            onConfirm(Instant.ofEpochMilli(value).atZone(ZoneId.systemDefault()).toLocalDate())
          } ?: onDismiss()
        },
      ) {
        Text("Apply")
      }
    },
    dismissButton = {
      TextButton(onClick = onDismiss) { Text("Cancel") }
    },
  ) {
    DatePicker(state = state)
  }
}

@Composable
private fun StatementShimmer() {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    items(6) {
      ShimmerBox(width = 360.dp, height = 76.dp, radius = 16.dp)
    }
  }
}

private fun statementTypes(): List<StatementEntryType> = listOf(
  StatementEntryType.ALL,
  StatementEntryType.REPAYMENT,
  StatementEntryType.DISBURSEMENT,
  StatementEntryType.FEE,
  StatementEntryType.PENALTY,
)

private fun statementTypeLabel(type: StatementEntryType): String = when (type) {
  StatementEntryType.ALL -> "All"
  StatementEntryType.REPAYMENT -> "Repayments"
  StatementEntryType.DISBURSEMENT -> "Disbursements"
  StatementEntryType.FEE -> "Fees"
  StatementEntryType.PENALTY -> "Penalties"
}
