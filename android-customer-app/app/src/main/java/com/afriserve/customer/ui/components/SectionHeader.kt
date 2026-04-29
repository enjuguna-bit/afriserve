package com.afriserve.customer.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SectionHeader(
  title: String,
  trailing: String? = null,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(vertical = 8.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
  ) {
    Text(text = title, style = MaterialTheme.typography.titleLarge)
    if (trailing != null) {
      Text(text = trailing, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
    }
  }
}
