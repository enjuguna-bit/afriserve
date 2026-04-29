package com.afriserve.customer.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afriserve.customer.ui.theme.ErrorRed
import com.afriserve.customer.ui.theme.Green200
import com.afriserve.customer.ui.theme.Green900
import com.afriserve.customer.ui.theme.SurfaceCard
import com.afriserve.customer.ui.theme.TextSecondary

@Composable
fun MetricCard(
  label: String,
  value: String,
  modifier: Modifier = Modifier,
  subtitle: String? = null,
  trendPercent: String? = null,
  isTrendPositive: Boolean = true,
) {
  Card(
    modifier = modifier,
    colors = CardDefaults.cardColors(containerColor = SurfaceCard),
    border = BorderStroke(1.dp, Green200),
    shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
  ) {
    Column(
      modifier = Modifier.padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(
        text = label.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = TextSecondary,
      )
      Text(
        text = value,
        style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.SemiBold),
        color = Green900,
      )
      if (subtitle != null || trendPercent != null) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
        ) {
          subtitle?.let {
            Text(text = it, style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
          }
          trendPercent?.let {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
              Icon(
                imageVector = if (isTrendPositive) Icons.AutoMirrored.Outlined.TrendingUp else Icons.AutoMirrored.Outlined.TrendingDown,
                contentDescription = null,
                tint = if (isTrendPositive) Green900 else ErrorRed,
              )
              Text(
                text = it,
                style = MaterialTheme.typography.labelLarge,
                color = if (isTrendPositive) Green900 else ErrorRed,
              )
            }
          }
        }
      }
    }
  }
}
