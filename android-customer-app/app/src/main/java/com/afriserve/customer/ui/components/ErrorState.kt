package com.afriserve.customer.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ErrorState(
  message: String,
  onRetry: () -> Unit,
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    ErrorBanner(message = message)
    Button(onClick = onRetry, modifier = Modifier.padding(top = 16.dp)) {
      Text("Try again")
    }
    Text(
      text = "We’ll keep your session and retry the latest data.",
      style = MaterialTheme.typography.bodyMedium,
      modifier = Modifier.padding(top = 12.dp),
    )
  }
}
