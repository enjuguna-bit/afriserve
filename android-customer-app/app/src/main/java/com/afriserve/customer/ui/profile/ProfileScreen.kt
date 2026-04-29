package com.afriserve.customer.ui.profile

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.EventNote
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.afriserve.customer.domain.model.ClientGuarantor
import com.afriserve.customer.domain.model.ClientProfile
import com.afriserve.customer.domain.model.CollateralAsset
import com.afriserve.customer.domain.model.FeePaymentStatus
import com.afriserve.customer.domain.model.OnboardingChecklist
import com.afriserve.customer.domain.model.OnboardingStatus
import com.afriserve.customer.domain.model.ProfileVersion
import com.afriserve.customer.ui.components.EmptyState
import com.afriserve.customer.ui.components.ErrorState
import com.afriserve.customer.ui.components.FeePaymentStatusChip
import com.afriserve.customer.ui.components.KycStatusChip
import com.afriserve.customer.ui.components.LoadingOverlay
import com.afriserve.customer.ui.components.OnboardingStatusChip
import com.afriserve.customer.ui.components.SectionCard
import com.afriserve.customer.ui.theme.Gold500
import com.afriserve.customer.ui.theme.Gray200
import com.afriserve.customer.ui.theme.Green50
import com.afriserve.customer.ui.theme.Green700
import com.afriserve.customer.ui.theme.Green900
import com.afriserve.customer.ui.theme.SurfaceCard
import com.afriserve.customer.ui.theme.TextSecondary
import com.afriserve.customer.ui.theme.TextTertiary
import com.afriserve.customer.utils.formatIsoDate
import com.afriserve.customer.utils.formatKes

@OptIn(ExperimentalMaterialApi::class)
@Composable
fun ProfileScreen(
  viewModel: ProfileViewModel,
  unreadCount: Int,
  onOpenNotifications: () -> Unit,
  onOpenSettings: () -> Unit,
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()
  val profile = uiState.profile
  val onboarding = uiState.onboarding
  val pullRefreshState = rememberPullRefreshState(
    refreshing = uiState.isLoading,
    onRefresh = viewModel::refresh,
  )

  when {
    uiState.isLoading && (profile == null || onboarding == null) -> LoadingOverlay(message = "Loading your customer profile...")
    uiState.error != null && (profile == null || onboarding == null) -> ErrorState(message = uiState.error.orEmpty(), onRetry = viewModel::refresh)
    profile == null || onboarding == null -> EmptyState(
      title = "Profile unavailable",
      message = "We could not load your Customer 360 profile right now.",
    )
    else -> {
      Box(
        modifier = Modifier
          .fillMaxSize()
          .pullRefresh(pullRefreshState),
      ) {
        ProfileContent(
          profile = profile,
          onboarding = onboarding,
          guarantors = uiState.guarantors,
          collaterals = uiState.collaterals,
          profileVersions = uiState.profileVersions,
          unreadCount = unreadCount,
          onOpenNotifications = onOpenNotifications,
          onOpenSettings = onOpenSettings,
        )
        PullRefreshIndicator(
          refreshing = uiState.isLoading,
          state = pullRefreshState,
          modifier = Modifier.align(Alignment.TopCenter),
          backgroundColor = Color.White,
          contentColor = Green700,
        )
      }
    }
  }
}

@Composable
private fun ProfileContent(
  profile: ClientProfile,
  onboarding: OnboardingChecklist,
  guarantors: List<ClientGuarantor>,
  collaterals: List<CollateralAsset>,
  profileVersions: List<ProfileVersion>,
  unreadCount: Int,
  onOpenNotifications: () -> Unit,
  onOpenSettings: () -> Unit,
) {
  val context = LocalContext.current
  var personalExpanded by rememberSaveable { mutableStateOf(true) }
  var businessExpanded by rememberSaveable { mutableStateOf(true) }
  var onboardingExpanded by rememberSaveable { mutableStateOf(true) }
  var kinExpanded by rememberSaveable { mutableStateOf(true) }
  var officerExpanded by rememberSaveable { mutableStateOf(true) }
  var guarantorExpanded by rememberSaveable { mutableStateOf(true) }
  var collateralExpanded by rememberSaveable { mutableStateOf(true) }
  var historyExpanded by rememberSaveable { mutableStateOf(true) }

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(bottom = 24.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    item {
      Box {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .background(Brush.verticalGradient(listOf(Green900, Green700))),
        ) {
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 16.dp, vertical = 20.dp),
            horizontalArrangement = Arrangement.End,
          ) {
            NotificationSettingsActions(
              unreadCount = unreadCount,
              onOpenNotifications = onOpenNotifications,
              onOpenSettings = onOpenSettings,
            )
          }
        }
        Card(
          modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .offset(y = 110.dp),
          colors = CardDefaults.cardColors(containerColor = SurfaceCard),
          shape = RoundedCornerShape(24.dp),
        ) {
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .padding(18.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            ProfileAvatar(profile = profile, modifier = Modifier.size(72.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
              Text(profile.fullName, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold))
              Text(profile.phone ?: "Phone number unavailable", color = TextSecondary)
              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KycStatusChip(profile.kycStatus)
                OnboardingStatusChip(profile.onboardingStatus)
              }
            }
          }
        }
      }
      Spacer(modifier = Modifier.height(118.dp))
    }

    item {
      SectionCard(
        title = "Personal Details",
        icon = Icons.Outlined.Person,
        expanded = personalExpanded,
        onToggle = { personalExpanded = !personalExpanded },
        modifier = Modifier.padding(horizontal = 16.dp),
      ) {
        ProfileField("Name", profile.fullName)
        ProfileField("National ID", profile.nationalId ?: "--")
        ProfileField("KRA PIN", profile.kraPin ?: "--")
        ProfileField("Phone", profile.phone ?: "--")
        ProfileField("Residential Address", profile.residentialAddress ?: "Address not provided")
        if (profile.latitude != null && profile.longitude != null) {
          ProfileField("Map Pin", "${profile.latitude}, ${profile.longitude}")
        }
      }
    }

    item {
      SectionCard(
        title = "Business Profile",
        icon = Icons.Outlined.Business,
        expanded = businessExpanded,
        onToggle = { businessExpanded = !businessExpanded },
        modifier = Modifier.padding(horizontal = 16.dp),
      ) {
        ProfileField("Business Type", profile.businessType ?: "--")
        ProfileField("Years", profile.businessYears?.toString() ?: "--")
        ProfileField("Location", profile.businessLocation ?: "--")
        ProfileField("Business Address", profile.businessLocation ?: "Business address unavailable")
      }
    }

    item {
      SectionCard(
        title = "KYC & Onboarding",
        icon = Icons.Outlined.VerifiedUser,
        expanded = onboardingExpanded,
        onToggle = { onboardingExpanded = !onboardingExpanded },
        modifier = Modifier.padding(horizontal = 16.dp),
      ) {
        OnboardingStepIndicator(currentStep = currentStep(profile.onboardingStatus, profile.feePaymentStatus))
        Spacer(modifier = Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          KycStatusChip(profile.kycStatus)
          FeePaymentStatusChip(profile.feePaymentStatus)
        }
        if (!profile.idDocumentUrl.isNullOrBlank()) {
          Button(
            onClick = {
              context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(profile.idDocumentUrl)))
            },
            modifier = Modifier.padding(top = 16.dp),
          ) {
            Text("View ID Document")
          }
        }
      }
    }

    item {
      SectionCard(
        title = "Next of Kin",
        icon = Icons.Outlined.Badge,
        expanded = kinExpanded,
        onToggle = { kinExpanded = !kinExpanded },
        modifier = Modifier.padding(horizontal = 16.dp),
      ) {
        if (profile.nextOfKinName.isNullOrBlank() &&
          profile.nextOfKinPhone.isNullOrBlank() &&
          profile.nextOfKinRelation.isNullOrBlank()
        ) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(vertical = 12.dp),
          ) {
            Icon(
              Icons.Outlined.Info,
              contentDescription = null,
              tint = TextTertiary,
              modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.size(10.dp))
            Text(
              "Next of kin details have not been recorded yet.",
              color = TextTertiary,
              style = MaterialTheme.typography.bodyMedium,
            )
          }
        } else {
          profile.nextOfKinName?.takeIf { it.isNotBlank() }?.let { ProfileField("Name", it) }
          profile.nextOfKinPhone?.takeIf { it.isNotBlank() }?.let { ProfileField("Phone", it) }
          profile.nextOfKinRelation?.takeIf { it.isNotBlank() }?.let { ProfileField("Relationship", it) }
        }
      }
    }

    item {
      SectionCard(
        title = "Loan Officer",
        icon = Icons.Outlined.Shield,
        expanded = officerExpanded,
        onToggle = { officerExpanded = !officerExpanded },
        modifier = Modifier.padding(horizontal = 16.dp),
      ) {
        ProfileField("Officer", profile.officerName ?: "Assigned officer unavailable")
        ProfileField("Branch", profile.branchName ?: "Branch unavailable")
        ProfileField("Branch Phone", profile.branchPhone ?: "Branch contact unavailable")
      }
    }

    item {
      SectionCard(
        title = "Guarantors",
        icon = Icons.Outlined.Groups,
        expanded = guarantorExpanded,
        onToggle = { guarantorExpanded = !guarantorExpanded },
        badgeText = guarantors.size.toString(),
        modifier = Modifier.padding(horizontal = 16.dp),
      ) {
        if (guarantors.isEmpty()) {
          EmptyState("No guarantors", "Linked guarantors will appear here.")
        } else {
          guarantors.forEach { guarantor ->
            CompactInfoCard(
              title = guarantor.name,
              subtitle = guarantor.relationship ?: guarantor.phone ?: "--",
              trailing = formatKes(guarantor.guaranteeAmount),
            )
          }
        }
      }
    }

    item {
      SectionCard(
        title = "Collateral Assets",
        icon = Icons.Outlined.Map,
        expanded = collateralExpanded,
        onToggle = { collateralExpanded = !collateralExpanded },
        badgeText = collaterals.size.toString(),
        modifier = Modifier.padding(horizontal = 16.dp),
      ) {
        if (collaterals.isEmpty()) {
          EmptyState("No collateral", "Collateral assets will show up here once they are linked.")
        } else {
          collaterals.forEach { collateral ->
            CompactInfoCard(
              title = collateral.assetType,
              subtitle = collateral.description ?: collateral.status ?: "--",
              trailing = formatKes(collateral.estimatedValue),
            )
          }
        }
      }
    }

    item {
      SectionCard(
        title = "Profile History",
        icon = Icons.AutoMirrored.Outlined.EventNote,
        expanded = historyExpanded,
        onToggle = { historyExpanded = !historyExpanded },
        modifier = Modifier.padding(horizontal = 16.dp),
      ) {
        if (profileVersions.isEmpty()) {
          EmptyState("No profile history", "Profile version changes will appear here.")
        } else {
          profileVersions.forEach { version ->
            CompactInfoCard(
              title = "Version ${version.versionNumber}",
              subtitle = version.note ?: "Profile revision recorded",
              trailing = formatIsoDate(version.effectiveDate ?: version.createdAt),
            )
          }
        }
      }
    }
  }
}

@Composable
private fun NotificationSettingsActions(
  unreadCount: Int,
  onOpenNotifications: () -> Unit,
  onOpenSettings: () -> Unit,
) {
  Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    androidx.compose.material3.IconButton(onClick = onOpenNotifications) {
      Box {
        Icon(Icons.Outlined.Notifications, contentDescription = "Notifications", tint = Color.White)
        if (unreadCount > 0) {
          Box(
            modifier = Modifier
              .align(Alignment.TopEnd)
              .clip(RoundedCornerShape(999.dp))
              .background(MaterialTheme.colorScheme.secondary)
              .padding(horizontal = 6.dp, vertical = 2.dp),
          ) {
            Text(unreadCount.coerceAtMost(9).toString(), color = Color.White, style = MaterialTheme.typography.labelSmall)
          }
        }
      }
    }
    androidx.compose.material3.IconButton(onClick = onOpenSettings) {
      Icon(Icons.Outlined.Settings, contentDescription = "Settings", tint = Color.White)
    }
  }
}

@Composable
private fun ProfileAvatar(
  profile: ClientProfile,
  modifier: Modifier = Modifier,
) {
  if (!profile.photoUrl.isNullOrBlank()) {
    AsyncImage(
      model = profile.photoUrl,
      contentDescription = profile.fullName,
      modifier = modifier.clip(CircleShape),
      contentScale = ContentScale.Crop,
    )
  } else {
    Box(
      modifier = modifier
        .clip(CircleShape)
        .background(Green50),
      contentAlignment = Alignment.Center,
    ) {
      Text(
        text = initials(profile.fullName),
        color = Green700,
        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
      )
    }
  }
}

@Composable
private fun ProfileField(label: String, value: String) {
  Column(modifier = Modifier.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = TextSecondary)
    Text(value, style = MaterialTheme.typography.bodyLarge)
  }
}

@Composable
private fun CompactInfoCard(
  title: String,
  subtitle: String,
  trailing: String,
) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .padding(top = 10.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    shape = RoundedCornerShape(16.dp),
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(14.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
      }
      Text(trailing, style = MaterialTheme.typography.labelLarge, color = Green900)
    }
  }
}

@Composable
fun OnboardingStepIndicator(currentStep: Int) {
  val steps = listOf("Registered", "KYC", "Fees", "Active")
  Row(
    modifier = Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    steps.forEachIndexed { index, label ->
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
          modifier = Modifier
            .size(28.dp)
            .clip(CircleShape)
            .background(
              when {
                index < currentStep -> Green700
                index == currentStep -> Gold500
                else -> Gray200
              },
            ),
          contentAlignment = Alignment.Center,
        ) {
          Text(
            if (index < currentStep) "OK" else "${index + 1}",
            color = if (index < currentStep || index == currentStep) Color.White else Green700,
            style = MaterialTheme.typography.labelLarge,
          )
        }
        Text(
          label,
          modifier = Modifier.padding(top = 6.dp),
          style = MaterialTheme.typography.bodyMedium,
          color = TextSecondary,
        )
      }
      if (index < steps.lastIndex) {
        Box(
          modifier = Modifier
            .weight(1f)
            .height(2.dp)
            .background(if (index < currentStep) Green700 else Gray200),
        )
      }
    }
  }
}

private fun initials(fullName: String): String =
  fullName
    .split(" ")
    .filter { it.isNotBlank() }
    .take(2)
    .joinToString("") { it.take(1).uppercase() }
    .ifBlank { "A" }

private fun currentStep(onboardingStatus: OnboardingStatus, feeStatus: FeePaymentStatus): Int =
  when {
    onboardingStatus == OnboardingStatus.ACTIVE -> 3
    onboardingStatus == OnboardingStatus.FEES_PAID || feeStatus == FeePaymentStatus.PAID -> 2
    onboardingStatus == OnboardingStatus.KYC_SUBMITTED -> 1
    else -> 0
  }
