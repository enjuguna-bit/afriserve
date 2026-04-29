package com.afriserve.customer.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
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
import com.afriserve.customer.ui.theme.SurfaceCard
import com.afriserve.customer.ui.theme.TextSecondary

@Composable
fun SectionCard(
  title: String,
  icon: ImageVector,
  expanded: Boolean,
  onToggle: () -> Unit,
  modifier: Modifier = Modifier,
  badgeText: String? = null,
  content: @Composable () -> Unit,
) {
  Card(
    modifier = modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = SurfaceCard),
    border = BorderStroke(1.dp, DividerColor),
    shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
  ) {
    Column {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .clickable(onClick = onToggle)
          .padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
          Text(text = title, style = MaterialTheme.typography.titleMedium)
          if (badgeText != null) {
            Text(
              text = badgeText,
              style = MaterialTheme.typography.labelSmall,
              color = TextSecondary,
            )
          }
        }
        Icon(
          imageVector = if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
          contentDescription = if (expanded) "Collapse" else "Expand",
        )
      }
      AnimatedVisibility(
        visible = expanded,
        enter = fadeIn() + expandVertically(),
        exit = fadeOut() + shrinkVertically(),
      ) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
          content()
        }
      }
    }
  }
}
