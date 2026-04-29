package com.afriserve.customer.ui.loans

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afriserve.customer.domain.model.ClientGuarantor
import com.afriserve.customer.domain.model.CollateralAsset
import com.afriserve.customer.domain.model.Loan
import com.afriserve.customer.domain.model.LoanInstallment
import com.afriserve.customer.domain.model.Repayment
import com.afriserve.customer.domain.model.StatementEntry
import com.afriserve.customer.ui.components.AfriServeTopBar
import com.afriserve.customer.ui.components.AfriServeTopBarStyle
import com.afriserve.customer.ui.components.EmptyState
import com.afriserve.customer.ui.components.ErrorState
import com.afriserve.customer.ui.components.InstallmentRow
import com.afriserve.customer.ui.components.LoanStatusChip
import com.afriserve.customer.ui.components.MetricCard
import com.afriserve.customer.ui.components.ShimmerBox
import com.afriserve.customer.ui.theme.Green100
import com.afriserve.customer.ui.theme.Green500
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.Green900
import com.afriserve.customer.ui.theme.SurfaceCard
import com.afriserve.customer.ui.theme.TextSecondary
import com.afriserve.customer.utils.formatIsoDate
import com.afriserve.customer.utils.formatKes
import kotlinx.coroutines.launch

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun LoanDetailScreen(
  viewModel: LoanDetailViewModel,
  onBack: () -> Unit,
  onOpenStatement: () -> Unit,
  showSnackbar: (String) -> Unit,
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()
  val pagerState = rememberPagerState(pageCount = { 4 })
  val scope = rememberCoroutineScope()
  val clipboardManager = LocalClipboardManager.current
  val context = LocalContext.current

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

  when {
    uiState.isLoading && uiState.bundle == null -> LoanDetailShimmer()
    uiState.error != null && uiState.bundle == null -> ErrorState(message = uiState.error.orEmpty(), onRetry = viewModel::refresh)
    uiState.bundle == null -> EmptyState(
      title = "Loan detail unavailable",
      message = "We could not load this loan right now.",
    )
    else -> {
      val bundle = requireNotNull(uiState.bundle)
      val loan = bundle.loan
      val progress = if (loan.expectedTotal > 0.0) {
        (loan.repaidTotal / loan.expectedTotal).toFloat().coerceIn(0f, 1f)
      } else {
        0f
      }
      Column(modifier = Modifier.fillMaxSize()) {
        AfriServeTopBar(
          title = "Loan #LN-${loan.id.toString().padStart(4, '0')}",
          style = AfriServeTopBarStyle.Compact,
          showBack = true,
          onBackClick = onBack,
        )
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Green900, Green700)))
            .padding(16.dp),
        ) {
          Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(loan.productName ?: loan.purpose ?: "Business Loan", color = Color.White, style = MaterialTheme.typography.headlineLarge)
                Text("${formatKes(loan.principal)} principal", color = Color.White.copy(alpha = 0.82f))
              }
              LoanStatusChip(loan.status)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
              MetricCard("Bal.", formatKes(loan.balance), modifier = Modifier.weight(1f))
              MetricCard("Repaid", formatKes(loan.repaidTotal), modifier = Modifier.weight(1f))
              MetricCard("Total", formatKes(loan.expectedTotal), modifier = Modifier.weight(1f))
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
              androidx.compose.material3.LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                  .fillMaxWidth()
                  .height(8.dp)
                  .clip(RoundedCornerShape(999.dp)),
                color = Green500,
                trackColor = Green100,
              )
              Text("${(progress * 100).toInt()}% repaid", color = Color.White.copy(alpha = 0.85f))
            }
          }
        }

        ScrollableTabRow(selectedTabIndex = pagerState.currentPage) {
          listOf("Schedule", "Repayments", "Statement", "Security").forEachIndexed { index, label ->
            Tab(
              selected = pagerState.currentPage == index,
              onClick = { scope.launch { pagerState.animateScrollToPage(index) } },
              text = { Text(label) },
            )
          }
        }

        HorizontalPager(
          state = pagerState,
          modifier = Modifier
            .fillMaxWidth()
            .weight(1f),
        ) { page ->
          when (page) {
            0 -> ScheduleTab(bundle.installments)
            1 -> RepaymentsTab(
              repayments = bundle.repayments,
              onCopy = { receipt ->
                clipboardManager.setText(AnnotatedString(receipt))
                showSnackbar("Receipt copied")
              },
            )
            2 -> StatementTab(
              entries = bundle.statementEntries,
              isGeneratingPdf = uiState.isGeneratingPdf,
              onDownload = { viewModel.downloadStatement(context) },
              onOpenStatement = onOpenStatement,
            )
            else -> SecurityTab(
              loan = loan,
              guarantors = bundle.guarantors,
              collaterals = bundle.collaterals,
            )
          }
        }
      }
    }
  }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ScheduleTab(installments: List<LoanInstallment>) {
  val paidCount = installments.count { it.amountPaid >= it.amountDue && it.amountDue > 0.0 }
  val overdue = installments.filter { it.status.name == "OVERDUE" }
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    stickyHeader {
      Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
      ) {
        Text(
          text = "$paidCount of ${installments.size} installments paid",
          modifier = Modifier.padding(12.dp),
          style = MaterialTheme.typography.titleMedium,
        )
      }
    }
    items(installments, key = { it.id }) { installment ->
      InstallmentRow(installment = installment)
    }
    item {
      Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard),
        shape = RoundedCornerShape(20.dp),
      ) {
        Text(
          text = "Outstanding: ${formatKes(overdue.sumOf { (it.amountDue - it.amountPaid + it.penaltyAmountAccrued).coerceAtLeast(0.0) })} across ${overdue.size} overdue",
          modifier = Modifier.padding(16.dp),
          style = MaterialTheme.typography.titleMedium,
        )
      }
    }
  }
}

@Composable
private fun RepaymentsTab(
  repayments: List<Repayment>,
  onCopy: (String) -> Unit,
) {
  if (repayments.isEmpty()) {
    EmptyState("No repayments", "Repayment activity will appear here.")
    return
  }
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    items(repayments, key = { it.id }) { repayment ->
      Card(colors = CardDefaults.cardColors(containerColor = SurfaceCard), shape = RoundedCornerShape(20.dp)) {
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
          horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
          Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(formatIsoDate(repayment.paidAt), style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
            Box(
              modifier = Modifier
                .padding(top = 8.dp)
                .size(width = 2.dp, height = 52.dp)
                .background(MaterialTheme.colorScheme.primary),
            )
          }
          Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(formatKes(repayment.amount), style = MaterialTheme.typography.titleLarge)
            Text(repayment.paymentChannel.ifBlank { "Manual" }, color = TextSecondary)
            repayment.externalReceipt?.let { receipt ->
              Row(verticalAlignment = Alignment.CenterVertically) {
                Text(receipt, style = MaterialTheme.typography.bodyMedium)
                IconButton(onClick = { onCopy(receipt) }) {
                  Icon(Icons.Outlined.ContentCopy, contentDescription = "Copy receipt")
                }
              }
            }
          }
        }
      }
    }
  }
}

@Composable
private fun StatementTab(
  entries: List<StatementEntry>,
  isGeneratingPdf: Boolean,
  onDownload: () -> Unit,
  onOpenStatement: () -> Unit,
) {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    item {
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Date", style = MaterialTheme.typography.labelLarge)
        Text("Debit", style = MaterialTheme.typography.labelLarge)
        Text("Credit", style = MaterialTheme.typography.labelLarge)
        Text("Balance", style = MaterialTheme.typography.labelLarge)
      }
    }
    if (entries.isEmpty()) {
      item {
        EmptyState("No statement entries", "Statement activity will appear here once this loan has transactions.")
      }
    } else {
      items(entries, key = { "${it.date}-${it.reference}-${it.description}" }) { entry ->
        Card(colors = CardDefaults.cardColors(containerColor = SurfaceCard), shape = RoundedCornerShape(16.dp)) {
          Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(entry.description, style = MaterialTheme.typography.titleMedium)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
              Text(formatIsoDate(entry.date), style = MaterialTheme.typography.bodyMedium)
              Text(formatKes(entry.debit), style = MaterialTheme.typography.bodyMedium)
              Text(formatKes(entry.credit), style = MaterialTheme.typography.bodyMedium, color = Green700)
              Text(formatKes(entry.runningBalance), style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
            }
          }
        }
      }
    }
    item {
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        FilledTonalButton(onClick = onOpenStatement, modifier = Modifier.weight(1f)) {
          Text("Open Statement")
        }
        Button(
          onClick = onDownload,
          modifier = Modifier.weight(1f),
          enabled = !isGeneratingPdf,
        ) {
          if (isGeneratingPdf) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            Text("Generating...", modifier = Modifier.padding(start = 8.dp))
          } else {
            Icon(Icons.Outlined.Download, contentDescription = null)
            Text("Download PDF", modifier = Modifier.padding(start = 8.dp))
          }
        }
      }
    }
  }
}

@Composable
private fun SecurityTab(
  loan: Loan,
  guarantors: List<ClientGuarantor>,
  collaterals: List<CollateralAsset>,
) {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    item { Text("Guarantors", style = MaterialTheme.typography.headlineMedium) }
    if (guarantors.isEmpty()) {
      item { EmptyState("No guarantors", "Linked guarantors will appear here.") }
    } else {
      items(guarantors, key = { it.id }) { guarantor ->
        val coverage = if (loan.balance > 0.0) (guarantor.guaranteeAmount / loan.balance).toFloat().coerceIn(0f, 1f) else 0f
        Card(colors = CardDefaults.cardColors(containerColor = SurfaceCard), shape = RoundedCornerShape(18.dp)) {
          Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(guarantor.name, style = MaterialTheme.typography.titleLarge)
            Text(guarantor.phone ?: "--", color = TextSecondary)
            androidx.compose.material3.LinearProgressIndicator(
              progress = { coverage },
              modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(999.dp)),
            )
            Text(formatKes(guarantor.guaranteeAmount), style = MaterialTheme.typography.labelLarge)
          }
        }
      }
    }
    item { Text("Collateral", style = MaterialTheme.typography.headlineMedium) }
    if (collaterals.isEmpty()) {
      item { EmptyState("No collateral", "Collateral assets will appear here.") }
    } else {
      items(collaterals, key = { it.id }) { collateral ->
        Card(colors = CardDefaults.cardColors(containerColor = SurfaceCard), shape = RoundedCornerShape(18.dp)) {
          Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(collateral.assetType, style = MaterialTheme.typography.titleLarge)
            Text(collateral.description ?: collateral.status ?: "--", color = TextSecondary)
            Text(formatKes(collateral.estimatedValue), style = MaterialTheme.typography.labelLarge)
          }
        }
      }
    }
  }
}

@Composable
private fun LoanDetailShimmer() {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    item { ShimmerBox(width = 360.dp, height = 220.dp, radius = 24.dp) }
    items(4) { ShimmerBox(width = 360.dp, height = 120.dp, radius = 18.dp) }
  }
}
