package com.afriserve.customer.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.afriserve.customer.domain.model.ClientProfile
import com.afriserve.customer.ui.components.KycStatusChip

@Composable
fun KycStatusCard(profile: ClientProfile) {
  Card(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text("KYC Status")
      KycStatusChip(profile.kycStatus)
      Text(
        when (profile.kycStatus.name) {
          "VERIFIED" -> "Your identity has been verified."
          "PENDING" -> "We are still reviewing your KYC documents."
          "REJECTED" -> "Your KYC submission needs attention."
          else -> "KYC status is currently unavailable."
        },
      )
    }
  }
}
