package com.afriserve.customer.ui.home

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afriserve.customer.domain.model.InstallmentStatus
import com.afriserve.customer.domain.model.Loan
import com.afriserve.customer.domain.model.LoanInstallment
import com.afriserve.customer.domain.model.Repayment
import com.afriserve.customer.ui.components.EmptyState
import com.afriserve.customer.ui.components.ErrorState
import com.afriserve.customer.ui.components.KycStatusChip
import com.afriserve.customer.ui.components.LoanStatusChip
import com.afriserve.customer.ui.components.ShimmerBox
import com.afriserve.customer.ui.components.ShimmerText
import com.afriserve.customer.ui.theme.ErrorRed
import com.afriserve.customer.ui.theme.ErrorRedLight
import com.afriserve.customer.ui.theme.Green100
import com.afriserve.customer.ui.theme.Green500
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.Green900
import com.afriserve.customer.ui.theme.SurfaceCard
import com.afriserve.customer.ui.theme.TextSecondary
import com.afriserve.customer.ui.theme.TextTertiary
import com.afriserve.customer.utils.formatIsoDate
import com.afriserve.customer.utils.formatKes
import java.time.LocalTime

@OptIn(ExperimentalMaterialApi::class)
@Composable
fun HomeScreen(
  viewModel: HomeViewModel,
  unreadCount: Int,
  onOpenLoan: (Long) -> Unit,
  onOpenStatement: () -> Unit,
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

  when {
    uiState.isLoading && uiState.profile == null -> HomeShimmer()
    uiState.error != null && uiState.profile == null -> ErrorState(
      message = uiState.error.orEmpty(),
      onRetry = viewModel::refresh,
    )
    uiState.profile == null -> EmptyState(
      title = "Dashboard unavailable",
      message = "We could not prepare your latest customer summary.",
    )
    else -> {
      val overdueAmount = uiState.overdueInstallments.sumOf { installment ->
        (installment.amountDue - installment.amountPaid + installment.penaltyAmountAccrued).coerceAtLeast(0.0)
      }
      Box(
        modifier = Modifier
          .fillMaxSize()
          .pullRefresh(pullRefreshState),
      ) {
        LazyColumn(
          modifier = Modifier.fillMaxSize(),
          contentPadding = PaddingValues(bottom = 24.dp),
          verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
          item {
            Box {
              HomeHeader(
                greeting = greetingText(),
                clientName = uiState.clientName,
                unreadCount = unreadCount,
                kycBadge = { KycStatusChip(uiState.kycStatus) },
                onOpenNotifications = onOpenNotifications,
                onOpenSettings = onOpenSettings,
              )
              SummaryCard(
                totalOutstanding = uiState.totalOutstanding,
                activeLoans = uiState.activeLoans,
                overdueInstallments = uiState.overdueInstallments,
                nextDueDate = uiState.nextDueDate,
                modifier = Modifier
                  .padding(horizontal = 16.dp)
                  .align(Alignment.BottomCenter)
                  .offset(y = 40.dp),
              )
            }
            Spacer(modifier = Modifier.height(54.dp))
          }

          if (uiState.overdueInstallments.isNotEmpty()) {
            item {
              Card(
                modifier = Modifier
                  .fillMaxWidth()
                  .padding(horizontal = 16.dp)
                  .clickable(onClick = onOpenStatement),
                colors = CardDefaults.cardColors(containerColor = ErrorRedLight),
                shape = RoundedCornerShape(20.dp),
              ) {
                Column(
                  modifier = Modifier.padding(18.dp),
                  verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                  Text("OVERDUE ALERT", color = ErrorRed, style = MaterialTheme.typography.labelLarge)
                  Text(
                    "${uiState.overdueInstallments.size} installment overdue - ${formatKes(overdueAmount)}",
                    style = MaterialTheme.typography.titleLarge,
                  )
                  Text("View details ->", color = ErrorRed, style = MaterialTheme.typography.bodyMedium)
                }
              }
            }
          }

          item {
            SectionTitle("Active Loans")
          }

          if (uiState.activeLoans.isEmpty()) {
            item {
              EmptyState(
                title = "No active loans",
                message = "Your active lending products will appear here as soon as they are approved.",
              )
            }
          } else {
            items(uiState.activeLoans, key = { it.id }) { loan ->
              HomeLoanCard(
                loan = loan,
                nextInstallment = uiState.installmentsByLoanId[loan.id]
                  ?.filter { installment ->
                    installment.status == InstallmentStatus.PENDING ||
                      installment.status == InstallmentStatus.PARTIAL ||
                      installment.status == InstallmentStatus.OVERDUE
                  }
                  ?.minByOrNull { it.dueDate },
                modifier = Modifier.padding(horizontal = 16.dp),
                onClick = { onOpenLoan(loan.id) },
              )
            }
          }

          item {
            SectionTitle("Quick Actions")
          }
          item {
            LazyRow(
              contentPadding = PaddingValues(horizontal = 16.dp),
              horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
              item {
                QuickActionButton("Statement", Icons.AutoMirrored.Outlined.ReceiptLong, onOpenStatement)
              }
              item {
                QuickActionButton("History", Icons.Outlined.History, onOpenStatement)
              }
              item {
                QuickActionButton("Support", Icons.Outlined.Call) {
                  val phone = uiState.profile?.branchPhone
                  if (phone.isNullOrBlank()) {
                    showSnackbar("Support contact is not available yet.")
                  } else {
                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                  }
                }
              }
              item {
                QuickActionButton("Password", Icons.Outlined.Lock, onOpenSettings)
              }
            }
          }

          item {
            SectionTitle("Recent Activity")
          }
          if (uiState.recentRepayments.isEmpty()) {
            item {
              EmptyState(
                title = "No recent repayments",
                message = "Your most recent repayments will appear here once they are recorded.",
              )
            }
          } else {
            items(uiState.recentRepayments, key = { it.id }) { repayment ->
              RecentActivityRow(
                repayment = repayment,
                modifier = Modifier.padding(horizontal = 16.dp),
              )
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

@Composable
private fun HomeHeader(
  greeting: String,
  clientName: String,
  unreadCount: Int,
  kycBadge: @Composable () -> Unit,
  onOpenNotifications: () -> Unit,
  onOpenSettings: () -> Unit,
) {
  Box(
    modifier = Modifier
      .fillMaxWidth()
      .height(230.dp)
      .background(Brush.verticalGradient(listOf(Green900, Green700))),
  ) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 16.dp, vertical = 20.dp),
      verticalArrangement = Arrangement.SpaceBetween,
    ) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
      ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text(greeting, color = Color.White.copy(alpha = 0.8f), style = MaterialTheme.typography.bodyLarge)
          Text(
            text = clientName.ifBlank { "AfriServe Customer" },
            style = MaterialTheme.typography.displayLarge.copy(fontWeight = FontWeight.Bold),
            color = Color.White,
          )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          IconButton(onClick = onOpenNotifications) {
            Box {
              Icon(Icons.Outlined.Notifications, contentDescription = "Notifications", tint = Color.White)
              if (unreadCount > 0) {
                Box(
                  modifier = Modifier
                    .align(Alignment.TopEnd)
                    .clip(RoundedCornerShape(999.dp))
                    .background(MaterialTheme.colorScheme.secondary)
                    .padding(horizontal = 6.dp, vertical = 2.dp),
                ) {
                  Text(
                    unreadCount.coerceAtMost(9).toString(),
                    color = Color.White,
                    style = MaterialTheme.typography.labelSmall,
                  )
                }
              }
            }
          }
          IconButton(onClick = onOpenSettings) {
            Icon(Icons.Outlined.Settings, contentDescription = "Settings", tint = Color.White)
          }
        }
      }
      kycBadge()
    }
  }
}

@Composable
private fun SummaryCard(
  totalOutstanding: Double,
  activeLoans: List<Loan>,
  overdueInstallments: List<LoanInstallment>,
  nextDueDate: String?,
  modifier: Modifier = Modifier,
) {
  val animatedBalance by animateFloatAsState(
    targetValue = totalOutstanding.toFloat(),
    animationSpec = tween(durationMillis = 800, easing = FastOutSlowInEasing),
    label = "balance_counter",
  )
  Card(
    modifier = modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = SurfaceCard),
    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
    shape = RoundedCornerShape(24.dp),
  ) {
    Column(
      modifier = Modifier.padding(18.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("Total Outstanding", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
      Text(
        text = formatKes(animatedBalance.toDouble()),
        style = MaterialTheme.typography.displayLarge.copy(fontWeight = FontWeight.Bold),
        color = Green900,
      )
      Text(
        text = "Across ${activeLoans.size} active loans",
        style = MaterialTheme.typography.bodyMedium,
        color = TextSecondary,
      )
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        SummaryMiniStat("Next Due", nextDueDate?.let(::formatIsoDate) ?: "--")
        SummaryMiniStat("Status", if (overdueInstallments.isEmpty()) "On Time" else "${overdueInstallments.size} due")
        SummaryMiniStat("Loans", activeLoans.size.toString())
      }
    }
  }
}

@Composable
private fun SummaryMiniStat(label: String, value: String) {
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Text(label, style = MaterialTheme.typography.labelSmall, color = TextTertiary)
    Text(value, style = MaterialTheme.typography.titleMedium, color = Green900)
  }
}

@Composable
private fun HomeLoanCard(
  loan: Loan,
  nextInstallment: LoanInstallment?,
  modifier: Modifier = Modifier,
  onClick: () -> Unit,
) {
  val progress = if (loan.expectedTotal > 0.0) {
    (loan.repaidTotal / loan.expectedTotal).toFloat().coerceIn(0f, 1f)
  } else {
    0f
  }
  Box(
    modifier = modifier
      .fillMaxWidth()
      .clickable(onClick = onClick),
  ) {
    Box(
      modifier = Modifier
        .align(Alignment.CenterStart)
        .fillMaxHeight()
        .width(5.dp)
        .padding(vertical = 8.dp)
        .background(
          brush = Brush.verticalGradient(listOf(Color(0xFF1B5E20), Color(0xFFF9A825))),
          shape = RoundedCornerShape(22.dp),
        ),
    )
    Card(
      modifier = Modifier
        .fillMaxWidth()
        .padding(start = 4.dp),
      colors = CardDefaults.cardColors(containerColor = SurfaceCard),
      shape = RoundedCornerShape(22.dp),
    ) {
      Column(
        modifier = Modifier.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(loan.productName ?: loan.purpose ?: "Business Loan", style = MaterialTheme.typography.titleLarge)
            Text("#LN-${loan.id.toString().padStart(4, '0')}", color = TextSecondary)
          }
          LoanStatusChip(loan.status)
        }
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
        ) {
          Text(formatKes(loan.principal), style = MaterialTheme.typography.titleLarge, color = Green900)
          Text("Balance: ${formatKes(loan.balance)}", color = TextSecondary)
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
          LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
              .fillMaxWidth()
              .height(8.dp)
              .clip(RoundedCornerShape(999.dp)),
            color = Green500,
            trackColor = Green100,
          )
          Text("${(progress * 100).toInt()}% repaid", color = TextSecondary, style = MaterialTheme.typography.bodyMedium)
        }
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Column {
            Text(
              text = "Next payment: ${nextInstallment?.dueDate?.let(::formatIsoDate) ?: "No upcoming due date"}",
              style = MaterialTheme.typography.bodyMedium,
            )
            nextInstallment?.let {
              Text(formatKes(it.amountDue), style = MaterialTheme.typography.titleMedium, color = Green900)
            }
          }
          Text("Pay History", color = Green700, style = MaterialTheme.typography.labelLarge)
        }
      }
    }
  }
}

@Composable
private fun QuickActionButton(
  label: String,
  icon: androidx.compose.ui.graphics.vector.ImageVector,
  onClick: () -> Unit,
) {
  FilledTonalButton(
    onClick = onClick,
    shape = RoundedCornerShape(18.dp),
    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
  ) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Icon(icon, contentDescription = null)
      Text(label)
    }
  }
}

@Composable
private fun RecentActivityRow(
  repayment: Repayment,
  modifier: Modifier = Modifier,
) {
  val channel = repayment.paymentChannel.ifBlank { "Manual" }
  val badgeColor = when (channel.lowercase()) {
    "mpesa", "m-pesa" -> Color(0xFFF57C00)
    "cash" -> Green700
    else -> TextTertiary
  }
  Card(
    modifier = modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = SurfaceCard),
    shape = RoundedCornerShape(18.dp),
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp),
      horizontalArrangement = Arrangement.spacedBy(14.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Box(
        modifier = Modifier
          .clip(RoundedCornerShape(14.dp))
          .background(badgeColor.copy(alpha = 0.14f))
          .padding(horizontal = 12.dp, vertical = 10.dp),
      ) {
        Text(channel.take(1).uppercase(), color = badgeColor, style = MaterialTheme.typography.titleMedium)
      }
      Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(formatKes(repayment.amount), style = MaterialTheme.typography.titleMedium)
        Text(formatIsoDate(repayment.paidAt), style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
      }
      Text(channel, color = TextSecondary, style = MaterialTheme.typography.bodyMedium)
    }
  }
}

@Composable
private fun SectionTitle(title: String) {
  Text(
    text = title,
    style = MaterialTheme.typography.headlineMedium,
    color = Green900,
    modifier = Modifier.padding(horizontal = 16.dp),
  )
}

@Composable
private fun HomeShimmer() {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    verticalArrangement = Arrangement.spacedBy(18.dp),
  ) {
    item {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .height(230.dp)
          .background(Brush.verticalGradient(listOf(Green900, Green700))),
      ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
          ShimmerText(width = 120.dp)
          ShimmerText(width = 180.dp)
        }
      }
      Box(modifier = Modifier.offset(y = (-40).dp).padding(horizontal = 16.dp)) {
        ShimmerBox(width = 360.dp, height = 180.dp, radius = 24.dp)
      }
      Spacer(modifier = Modifier.height(20.dp))
    }
    items(3) {
      ShimmerBox(
        width = 360.dp,
        height = 180.dp,
        radius = 22.dp,
        modifier = Modifier.padding(horizontal = 16.dp),
      )
    }
  }
}

private fun greetingText(): String = when (LocalTime.now().hour) {
  in 0..11 -> "Good morning,"
  in 12..16 -> "Good afternoon,"
  else -> "Good evening,"
}
