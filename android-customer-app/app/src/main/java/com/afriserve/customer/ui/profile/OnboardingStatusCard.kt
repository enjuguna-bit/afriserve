package com.afriserve.customer.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.afriserve.customer.domain.model.ClientProfile
import com.afriserve.customer.domain.model.OnboardingChecklist

@Composable
fun OnboardingStatusCard(
  profile: ClientProfile,
  onboarding: OnboardingChecklist,
) {
  Card(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Text("Onboarding")
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        listOf("Registered", "KYC", "Fees", "Active").forEach { label ->
          Text(label)
        }
      }
      Text("Status: ${profile.onboardingStatus.name.replace('_', ' ')}")
      Text("Fee status: ${profile.feePaymentStatus.name}")
      onboarding.nextStep?.let { Text("Next step: ${it.replace('_', ' ')}") }
      if (onboarding.blockers.isNotEmpty()) {
        Text("Pending items: ${onboarding.blockers.joinToString()}")
      }
    }
  }
}
