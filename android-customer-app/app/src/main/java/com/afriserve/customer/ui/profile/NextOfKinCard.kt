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

@Composable
fun NextOfKinCard(profile: ClientProfile) {
  Card(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text("Next of kin")
      Text(profile.nextOfKinName ?: "--")
      Text(profile.nextOfKinPhone ?: "--")
      Text(profile.nextOfKinRelation ?: "--")
    }
  }
}
