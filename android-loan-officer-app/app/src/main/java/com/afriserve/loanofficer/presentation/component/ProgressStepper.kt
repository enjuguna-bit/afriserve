package com.afriserve.loanofficer.presentation.component

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.afriserve.loanofficer.domain.model.OnboardingStep

@Composable
fun ProgressStepper(
    currentStep: OnboardingStep,
    modifier: Modifier = Modifier,
) {
    val steps = OnboardingStep.entries

    Column(modifier = modifier.fillMaxWidth()) {
        // ── circles + connector row ─────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            steps.forEachIndexed { index, step ->
                val done = step.position < currentStep.position
                val active = step == currentStep

                val circleColor by animateColorAsState(
                    targetValue = when {
                        done || active -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    },
                    animationSpec = tween(300),
                    label = "stepper_circle_$index",
                )
                val contentColor by animateColorAsState(
                    targetValue = when {
                        done || active -> MaterialTheme.colorScheme.onPrimary
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    animationSpec = tween(300),
                    label = "stepper_content_$index",
                )

                // connector line before each step except the first
                if (index > 0) {
                    val connectorColor by animateColorAsState(
                        targetValue = if (done || active) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)
                        } else {
                            MaterialTheme.colorScheme.outlineVariant
                        },
                        animationSpec = tween(300),
                        label = "stepper_connector_$index",
                    )
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(2.dp)
                            .background(connectorColor),
                    )
                }

                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(circleColor),
                    contentAlignment = Alignment.Center,
                ) {
                    if (done) {
                        Icon(
                            imageVector = Icons.Outlined.Check,
                            contentDescription = "${step.label} complete",
                            tint = contentColor,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text(
                            text = step.position.toString(),
                            color = contentColor,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // ── labels row ──────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            steps.forEachIndexed { index, step ->
                val active = step == currentStep
                val done = step.position < currentStep.position

                // spacer weight to match connector lines
                if (index > 0) {
                    Spacer(modifier = Modifier.width(8.dp))
                }

                Text(
                    text = step.label,
                    style = MaterialTheme.typography.labelLarge,
                    textAlign = TextAlign.Center,
                    color = when {
                        active -> MaterialTheme.colorScheme.primary
                        done -> MaterialTheme.colorScheme.onSurface
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 2.dp),
                )
            }
        }
    }
}
