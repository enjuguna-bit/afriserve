package com.afriserve.customer.ui.loans

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afriserve.customer.domain.model.Loan
import com.afriserve.customer.domain.model.LoanStatus
import com.afriserve.customer.ui.components.AfriServeTopBar
import com.afriserve.customer.ui.components.AfriServeTopBarStyle
import com.afriserve.customer.ui.components.EmptyState
import com.afriserve.customer.ui.components.ErrorState
import com.afriserve.customer.ui.components.LoanStatusChip
import com.afriserve.customer.ui.components.ShimmerBox
import com.afriserve.customer.ui.theme.Green100
import com.afriserve.customer.ui.theme.Green500
import com.afriserve.customer.ui.theme.Green900
import com.afriserve.customer.ui.theme.SurfaceCard
import com.afriserve.customer.ui.theme.TextSecondary
import com.afriserve.customer.utils.formatIsoDate
import com.afriserve.customer.utils.formatKes
import kotlinx.coroutines.launch

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class, ExperimentalMaterialApi::class)
@Composable
fun LoanListScreen(
  viewModel: LoanListViewModel,
  unreadCount: Int,
  onOpenLoan: (Long) -> Unit,
  onOpenNotifications: () -> Unit,
  onOpenSettings: () -> Unit,
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()
  val scope = rememberCoroutineScope()
  val pagerState = rememberPagerState(
    initialPage = uiState.selectedTab.ordinal,
    pageCount = { LoanFilterTab.entries.size },
  )
  val pullRefreshState = rememberPullRefreshState(
    refreshing = uiState.isLoading,
    onRefresh = viewModel::refresh,
  )

  LaunchedEffect(pagerState.currentPage) {
    viewModel.selectTab(LoanFilterTab.entries[pagerState.currentPage])
  }

  when {
    uiState.isLoading && uiState.loans.isEmpty() -> LoanListShimmer()
    uiState.error != null && uiState.loans.isEmpty() -> ErrorState(message = uiState.error.orEmpty(), onRetry = viewModel::refresh)
    else -> {
      Column(modifier = Modifier.fillMaxSize()) {
        AfriServeTopBar(
          title = "Loans",
          style = AfriServeTopBarStyle.Compact,
          unreadCount = unreadCount,
          onNotificationsClick = onOpenNotifications,
          onSettingsClick = onOpenSettings,
        )
        ScrollableTabRow(selectedTabIndex = pagerState.currentPage) {
          LoanFilterTab.entries.forEachIndexed { index, tab ->
            Tab(
              selected = pagerState.currentPage == index,
              onClick = {
                scope.launch { pagerState.animateScrollToPage(index) }
                viewModel.selectTab(tab)
              },
              text = { Text(tabLabel(tab)) },
            )
          }
        }
        Box(
          modifier = Modifier
            .fillMaxSize()
            .pullRefresh(pullRefreshState),
        ) {
          HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
          ) { page ->
            val loans = filterLoans(uiState.loans, LoanFilterTab.entries[page])
            if (loans.isEmpty()) {
              EmptyState(
                title = "No loans in this category",
                message = "We'll place matching loans here as soon as their status changes.",
              )
            } else {
              LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
              ) {
                items(loans, key = { it.id }) { loan ->
                  LoanListItem(loan = loan, onOpenLoan = onOpenLoan)
                }
              }
            }
          }

          PullRefreshIndicator(
            refreshing = uiState.isLoading,
            state = pullRefreshState,
            modifier = Modifier.align(Alignment.TopCenter),
            backgroundColor = Color.White,
            contentColor = Green900,
          )
        }
      }
    }
  }
}

@Composable
private fun LoanListItem(
  loan: Loan,
  onOpenLoan: (Long) -> Unit,
) {
  val progress = if (loan.expectedTotal > 0.0) {
    (loan.repaidTotal / loan.expectedTotal).toFloat().coerceIn(0f, 1f)
  } else {
    0f
  }
  Box(
    modifier = Modifier
      .fillMaxWidth()
      .clickable { onOpenLoan(loan.id) },
  ) {
    Box(
      modifier = Modifier
        .align(Alignment.CenterStart)
        .fillMaxHeight()
        .width(5.dp)
        .padding(vertical = 8.dp)
        .background(
          brush = Brush.verticalGradient(listOf(Color(0xFF1B5E20), Color(0xFFF9A825))),
          shape = RoundedCornerShape(20.dp),
        ),
    )
    Card(
      modifier = Modifier
        .fillMaxWidth()
        .padding(start = 4.dp),
      colors = CardDefaults.cardColors(containerColor = SurfaceCard),
      shape = RoundedCornerShape(20.dp),
    ) {
      Column(
        modifier = Modifier.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        androidx.compose.foundation.layout.Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
        ) {
          androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Outlined.AccountBalance, contentDescription = null, tint = Green900)
            Column {
              Text(loan.productName ?: loan.purpose ?: "Business Loan", style = MaterialTheme.typography.titleLarge)
              Text("#LN-${loan.id.toString().padStart(4, '0')}", color = TextSecondary)
            }
          }
          LoanStatusChip(loan.status)
        }
        Text("Principal  ${formatKes(loan.principal)}", style = MaterialTheme.typography.bodyLarge)
        Text("Balance    ${formatKes(loan.balance)}", style = MaterialTheme.typography.bodyLarge)
        LinearProgressIndicator(
          progress = { progress },
          modifier = Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(999.dp)),
          color = Green500,
          trackColor = Green100,
        )
        Text("Disbursed  ${formatIsoDate(loan.disbursedAt)}", color = TextSecondary)
        Text("Term       ${loan.termWeeks ?: loan.termMonths} ${if ((loan.termWeeks ?: 0) > 0) "weeks" else "months"}", color = TextSecondary)
        Text("View Details ->", color = Green900, style = MaterialTheme.typography.labelLarge)
      }
    }
  }
}

@Composable
private fun LoanListShimmer() {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    items(4) {
      ShimmerBox(width = 360.dp, height = 170.dp, radius = 20.dp)
    }
  }
}

private fun tabLabel(tab: LoanFilterTab): String = when (tab) {
  LoanFilterTab.ALL -> "All"
  LoanFilterTab.ACTIVE -> "Active"
  LoanFilterTab.PENDING -> "Pending"
  LoanFilterTab.CLOSED -> "Closed"
  LoanFilterTab.OVERDUE -> "Overdue"
}

private fun filterLoans(loans: List<Loan>, tab: LoanFilterTab): List<Loan> = when (tab) {
  LoanFilterTab.ALL -> loans
  LoanFilterTab.ACTIVE -> loans.filter {
    it.status == LoanStatus.ACTIVE ||
      it.status == LoanStatus.OVERDUE ||
      it.status == LoanStatus.RESTRUCTURED ||
      it.status == LoanStatus.APPROVED
  }
  LoanFilterTab.PENDING -> loans.filter { it.status == LoanStatus.PENDING_APPROVAL }
  LoanFilterTab.CLOSED -> loans.filter { it.status == LoanStatus.CLOSED || it.status == LoanStatus.WRITTEN_OFF || it.status == LoanStatus.REJECTED }
  LoanFilterTab.OVERDUE -> loans.filter { it.status == LoanStatus.OVERDUE || it.overdueInstallmentCount > 0 || it.overdueAmount > 0.0 }
}
