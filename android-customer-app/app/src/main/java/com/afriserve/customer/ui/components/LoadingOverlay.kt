package com.afriserve.customer.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.afriserve.customer.ui.theme.Green50
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.TextSecondary

@Composable
fun LoadingOverlay(message: String = "Loading...") {
  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)),
    contentAlignment = Alignment.Center,
  ) {
    Column(
      modifier = Modifier
        .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(28.dp))
        .padding(horizontal = 28.dp, vertical = 24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
      Box(
        modifier = Modifier
          .background(Green50, CircleShape)
          .padding(14.dp),
      ) {
        CircularProgressIndicator(color = Green700, strokeWidth = 3.dp)
      }
      Text(
        text = "AfriServe",
        style = MaterialTheme.typography.titleLarge,
        color = Green700,
      )
      Text(text = message, color = TextSecondary)
    }
  }
}
