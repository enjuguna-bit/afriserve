package com.afriserve.loanofficer.presentation.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.afriserve.loanofficer.domain.model.CaptureStatus
import com.afriserve.loanofficer.domain.model.DraftLifecycleStatus

@Composable
fun StatusPill(
    label: String,
    backgroundColor: Color,
    contentColor: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .background(backgroundColor, RoundedCornerShape(999.dp))
            .padding(PaddingValues(horizontal = 12.dp, vertical = 8.dp)),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = contentColor,
        )
    }
}

@Composable
fun DraftStatusPill(
    status: DraftLifecycleStatus,
    modifier: Modifier = Modifier,
) {
    val colors = when (status) {
        DraftLifecycleStatus.DRAFT -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
        DraftLifecycleStatus.PENDING_SYNC -> MaterialTheme.colorScheme.tertiaryContainer to MaterialTheme.colorScheme.onTertiaryContainer
        DraftLifecycleStatus.SYNCING -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        DraftLifecycleStatus.SYNCED -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.onSecondaryContainer
        DraftLifecycleStatus.FAILED -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
        DraftLifecycleStatus.COMPLETED -> MaterialTheme.colorScheme.secondary to MaterialTheme.colorScheme.onSecondary
    }

    StatusPill(
        label = status.name.replace('_', ' '),
        backgroundColor = colors.first,
        contentColor = colors.second,
        modifier = modifier,
    )
}

@Composable
fun CaptureStatusPill(
    status: CaptureStatus,
    modifier: Modifier = Modifier,
) {
    val colors = when (status) {
        CaptureStatus.NOT_STARTED -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
        CaptureStatus.CAPTURED -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        CaptureStatus.VERIFIED -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.onSecondaryContainer
        CaptureStatus.FAILED -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
    }

    StatusPill(
        label = status.name.replace('_', ' '),
        backgroundColor = colors.first,
        contentColor = colors.second,
        modifier = modifier,
    )
}
