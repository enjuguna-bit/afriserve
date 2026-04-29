package com.afriserve.customer.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.afriserve.customer.ui.theme.ErrorRed
import com.afriserve.customer.ui.theme.ErrorRedLight

@Composable
fun ErrorBanner(
  message: String,
  modifier: Modifier = Modifier,
  onDismiss: (() -> Unit)? = null,
) {
  Card(
    modifier = modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = ErrorRedLight),
    border = BorderStroke(1.dp, ErrorRed.copy(alpha = 0.18f)),
    shape = RoundedCornerShape(16.dp),
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(start = 14.dp, top = 12.dp, end = 6.dp, bottom = 12.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
    ) {
      Row(
        modifier = Modifier.weight(1f),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = ErrorRed)
        Text(
          text = message,
          color = ErrorRed,
          style = MaterialTheme.typography.bodyMedium,
        )
      }
      if (onDismiss != null) {
        IconButton(onClick = onDismiss) {
          Icon(Icons.Outlined.Close, contentDescription = "Dismiss", tint = ErrorRed)
        }
      }
    }
  }
}
