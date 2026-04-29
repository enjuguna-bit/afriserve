package com.afriserve.customer.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.afriserve.customer.ui.theme.DividerColor
import com.afriserve.customer.ui.theme.Green50
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.TextSecondary

@Composable
fun EmptyState(
  title: String,
  message: String,
  icon: ImageVector = Icons.Outlined.AccountBalanceWallet,
) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .padding(24.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    shape = RoundedCornerShape(20.dp),
    border = BorderStroke(1.dp, DividerColor),
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Box(
        modifier = Modifier
          .background(Green50, RoundedCornerShape(18.dp))
          .padding(horizontal = 18.dp, vertical = 14.dp),
      ) {
        Icon(
          imageVector = icon,
          contentDescription = null,
          tint = Green700,
        )
      }
      Text(text = title, style = MaterialTheme.typography.titleLarge)
      Text(
        text = message,
        style = MaterialTheme.typography.bodyLarge,
        color = TextSecondary,
      )
    }
  }
}
