package com.afriserve.loanofficer.presentation.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PendingActions
import androidx.compose.material.icons.outlined.SyncAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afriserve.loanofficer.domain.model.DraftLifecycleStatus
import com.afriserve.loanofficer.presentation.component.AfriserveLogo
import com.afriserve.loanofficer.presentation.component.DraftStatusPill
import com.afriserve.loanofficer.presentation.component.MetricCard
import com.afriserve.loanofficer.presentation.component.MetricRow
import com.afriserve.loanofficer.presentation.component.StatusPill
import com.afriserve.loanofficer.presentation.viewmodel.DashboardUiState
import kotlinx.coroutines.delay

@Composable
fun DashboardScreen(
    state: DashboardUiState,
    onCreateDraft: () -> Unit,
    onOpenDraft: (String) -> Unit,
    onLogout: () -> Unit,
    onBiometricToggled: (Boolean) -> Unit,
    onClearDrafts: () -> Unit,
    biometricAvailable: Boolean,
) {
    var visible by remember { mutableStateOf(false) }
    var showClearDraftsDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        delay(80)
        visible = true
    }

    if (showClearDraftsDialog && state.dashboard.clearableDrafts > 0) {
        AlertDialog(
            onDismissRequest = { showClearDraftsDialog = false },
            title = { Text("Clear local drafts") },
            text = {
                Text(
                    "This removes ${state.dashboard.clearableDrafts} local draft(s) that are not actively syncing. " +
                        "Queued uploads stay in place.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showClearDraftsDialog = false
                        onClearDrafts()
                    },
                ) {
                    Text("Clear drafts")
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearDraftsDialog = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn() + slideInVertically(initialOffsetY = { -24 }),
            ) {
                Card(
                    shape = RoundedCornerShape(24.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top,
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Card(
                                    shape = RoundedCornerShape(16.dp),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                                    ),
                                    elevation = CardDefaults.cardElevation(0.dp),
                                ) {
                                    AfriserveLogo(
                                        modifier = Modifier
                                            .padding(10.dp)
                                            .size(48.dp),
                                        showWordmark = false,
                                    )
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        text = "Good day,",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
                                    )
                                    Text(
                                        text = state.officer?.fullName?.substringBefore(' ') ?: "Officer",
                                        style = MaterialTheme.typography.headlineMedium,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                            IconButton(onClick = onLogout) {
                                Icon(
                                    Icons.AutoMirrored.Outlined.Logout,
                                    contentDescription = "Logout",
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            state.officer?.role?.takeIf { it.isNotBlank() }?.let { role ->
                                StatusPill(
                                    label = role.toDisplayLabel(),
                                    backgroundColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.18f),
                                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                            }
                            state.officer?.branchId?.let { branchId ->
                                StatusPill(
                                    label = "Branch $branchId",
                                    backgroundColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                            }
                        }
                    }
                }
            }
        }

        state.error?.takeIf { it.isNotBlank() }?.let { error ->
            item {
                AnimatedVisibility(
                    visible = visible,
                    enter = fadeIn() + slideInVertically(initialOffsetY = { 12 }),
                ) {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                        elevation = CardDefaults.cardElevation(0.dp),
                    ) {
                        Text(
                            text = error,
                            modifier = Modifier.padding(16.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
            }
        }

        state.bannerMessage?.takeIf { it.isNotBlank() }?.let { message ->
            item {
                AnimatedVisibility(
                    visible = visible,
                    enter = fadeIn() + slideInVertically(initialOffsetY = { 14 }),
                ) {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        ),
                        elevation = CardDefaults.cardElevation(0.dp),
                    ) {
                        Text(
                            text = message,
                            modifier = Modifier.padding(16.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                    }
                }
            }
        }

        if (state.dashboard.pendingSync > 0) {
            item {
                AnimatedVisibility(
                    visible = visible,
                    enter = fadeIn() + slideInVertically(initialOffsetY = { 16 }),
                ) {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                        ),
                        elevation = CardDefaults.cardElevation(0.dp),
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                Icons.Outlined.SyncAlt,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onTertiaryContainer,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(
                                text = "${state.dashboard.pendingSync} draft(s) queued for sync - will retry when connectivity returns.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onTertiaryContainer,
                            )
                        }
                    }
                }
            }
        }

        item {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn() + slideInVertically(initialOffsetY = { 32 }),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    MetricRow {
                        MetricCard(
                            title = "Pending",
                            value = state.dashboard.pendingOnboardings.toString(),
                            supportingText = "Awaiting follow-up",
                            icon = Icons.Outlined.PendingActions,
                            highlight = state.dashboard.pendingOnboardings > 0,
                            modifier = Modifier.weight(1f),
                        )
                        MetricCard(
                            title = "Drafts",
                            value = state.dashboard.drafts.toString(),
                            supportingText = "Saved offline",
                            icon = Icons.Outlined.HourglassEmpty,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    MetricRow {
                        MetricCard(
                            title = "Completed today",
                            value = state.dashboard.completedToday.toString(),
                            supportingText = "Loan-ready clients",
                            icon = Icons.Outlined.CheckCircle,
                            modifier = Modifier.weight(1f),
                        )
                        MetricCard(
                            title = "Syncing",
                            value = state.dashboard.pendingSync.toString(),
                            supportingText = "In upload queue",
                            icon = Icons.Outlined.SyncAlt,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }

        item {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn() + slideInVertically(initialOffsetY = { 40 }),
            ) {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            modifier = Modifier.weight(1f),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                Icons.Outlined.Lock,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(22.dp),
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = "Biometric unlock",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    text = if (biometricAvailable) {
                                        "Fingerprint or face scan after the 2-minute inactivity window."
                                    } else {
                                        "Enroll fingerprint or face on this device to turn secure re-entry on."
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        Switch(
                            checked = state.officer?.biometricEnabled == true,
                            onCheckedChange = onBiometricToggled,
                            enabled = biometricAvailable,
                        )
                    }
                }
            }
        }

        item {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn() + slideInVertically(initialOffsetY = { 48 }),
            ) {
                Button(
                    onClick = onCreateDraft,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    contentPadding = PaddingValues(vertical = 16.dp, horizontal = 20.dp),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
                ) {
                    Icon(
                        Icons.Outlined.Add,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                    )
                    Text(
                        text = "Start new onboarding",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(start = 10.dp),
                    )
                }
            }
        }

        if (state.dashboard.recentDrafts.isNotEmpty() || state.dashboard.clearableDrafts > 0) {
            item {
                AnimatedVisibility(
                    visible = visible,
                    enter = fadeIn(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Recent drafts",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        if (state.dashboard.clearableDrafts > 0) {
                            OutlinedButton(onClick = { showClearDraftsDialog = true }) {
                                Text("Clear drafts")
                            }
                        }
                    }
                }
            }
        }

        if (state.dashboard.recentDrafts.isNotEmpty()) {
            itemsIndexed(
                items = state.dashboard.recentDrafts,
                key = { _, draft -> draft.localId },
            ) { index, draft ->
                AnimatedVisibility(
                    visible = visible,
                    enter = fadeIn() + slideInVertically(initialOffsetY = { 24 + index * 8 }),
                ) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenDraft(draft.localId) },
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = when (draft.status) {
                                DraftLifecycleStatus.FAILED -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f)
                                DraftLifecycleStatus.COMPLETED, DraftLifecycleStatus.SYNCED -> MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.4f)
                                else -> MaterialTheme.colorScheme.surfaceVariant
                            },
                        ),
                        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                    ) {
                        Column(
                            modifier = Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(3.dp),
                                ) {
                                    Text(
                                        text = draft.customerName,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = draft.maskedPhone,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                DraftStatusPill(status = draft.status)
                            }

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "Step ${draft.activeStep.position} of 5",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    text = "-",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    text = draft.activeStep.label,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }

                            draft.syncError?.takeIf { it.isNotBlank() }?.let { error ->
                                Text(
                                    text = error,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }
            }
        } else if (visible) {
            item {
                AnimatedVisibility(
                    visible = visible,
                    enter = fadeIn(),
                ) {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        ),
                        elevation = CardDefaults.cardElevation(0.dp),
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                text = if (state.dashboard.clearableDrafts > 0) {
                                    "No drafts need attention"
                                } else {
                                    "No drafts yet"
                                },
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = if (state.dashboard.clearableDrafts > 0) {
                                    "Completed onboardings stay off this list. Use \"Clear drafts\" to remove local history."
                                } else {
                                    "Tap \"Start new onboarding\" to begin your first client capture."
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun String.toDisplayLabel(): String =
    split('_')
        .filter { it.isNotBlank() }
        .joinToString(" ") { part ->
            part.replaceFirstChar { c ->
                if (c.isLowerCase()) c.titlecase() else c.toString()
            }
        }
