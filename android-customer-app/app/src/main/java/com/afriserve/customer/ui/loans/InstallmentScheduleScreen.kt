package com.afriserve.customer.ui.loans

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.afriserve.customer.domain.model.LoanInstallment
import com.afriserve.customer.ui.components.InstallmentStatusChip
import com.afriserve.customer.utils.formatIsoDate
import com.afriserve.customer.utils.formatKes

@Composable
fun InstallmentScheduleScreen(installments: List<LoanInstallment>) {
  LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    items(installments, key = { it.id }) { installment ->
      Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Text("Installment ${installment.installmentNumber}", style = MaterialTheme.typography.titleLarge)
          Text("Due: ${formatIsoDate(installment.dueDate)}")
          Text("Amount due: ${formatKes(installment.amountDue)}")
          Text("Paid: ${formatKes(installment.amountPaid)}")
          Text("Penalty: ${formatKes(installment.penaltyAmountAccrued)}")
          InstallmentStatusChip(installment.status)
        }
      }
    }
  }
}
