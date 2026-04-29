package com.afriserve.customer.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.afriserve.customer.domain.model.InstallmentStatus
import com.afriserve.customer.domain.model.LoanInstallment
import com.afriserve.customer.ui.theme.DividerColor
import com.afriserve.customer.ui.theme.ErrorRed
import com.afriserve.customer.ui.theme.ErrorRedLight
import com.afriserve.customer.ui.theme.Gray500
import com.afriserve.customer.ui.theme.Green50
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.SurfaceCard
import com.afriserve.customer.ui.theme.TextSecondary
import com.afriserve.customer.utils.formatIsoDate
import com.afriserve.customer.utils.formatKes

@Composable
fun InstallmentRow(
  installment: LoanInstallment,
  modifier: Modifier = Modifier,
) {
  val overdue = installment.status == InstallmentStatus.OVERDUE
  val paid = installment.status == InstallmentStatus.PAID
  Card(
    modifier = modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = if (overdue) ErrorRedLight else SurfaceCard),
    border = BorderStroke(1.dp, if (overdue) ErrorRed.copy(alpha = 0.18f) else DividerColor),
    shape = RoundedCornerShape(18.dp),
    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(14.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Box(
        modifier = Modifier
          .background(if (overdue) ErrorRed else androidx.compose.ui.graphics.Color.Transparent)
          .padding(vertical = 0.dp),
      ) {
        Box(
          modifier = Modifier
            .padding(top = 18.dp)
            .background(if (paid) Green50 else MaterialTheme.colorScheme.primaryContainer, CircleShape)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
          Text(
            text = installment.installmentNumber.toString(),
            style = MaterialTheme.typography.labelLarge,
            color = if (paid) Green700 else MaterialTheme.colorScheme.primary,
          )
        }
      }
      Column(
        modifier = Modifier
          .weight(1f)
          .padding(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
      ) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
              text = formatIsoDate(installment.dueDate),
              style = MaterialTheme.typography.titleMedium,
              textDecoration = if (paid) TextDecoration.LineThrough else null,
              color = if (paid) Gray500 else MaterialTheme.colorScheme.onSurface,
            )
            Text(
              text = "Amount due ${formatKes(installment.amountDue)}",
              style = MaterialTheme.typography.bodyMedium,
              color = TextSecondary,
            )
          }
          Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            StatusChip(
              text = "PAID ${formatKes(installment.amountPaid)}",
              containerColor = Green50,
              contentColor = Green700,
            )
            InstallmentStatusChip(installment.status)
          }
        }
        if (paid) {
          Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = Green700)
            Text(
              text = "Settled",
              style = MaterialTheme.typography.bodyMedium,
              color = Gray500,
            )
          }
        } else if (installment.penaltyAmountAccrued > 0.0) {
          Text(
            text = "Penalty accrued ${formatKes(installment.penaltyAmountAccrued)}",
            style = MaterialTheme.typography.bodyMedium,
            color = if (overdue) ErrorRed else TextSecondary,
          )
        }
      }
    }
  }
}
