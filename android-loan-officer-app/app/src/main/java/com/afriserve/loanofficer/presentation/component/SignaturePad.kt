package com.afriserve.loanofficer.presentation.component

import android.view.MotionEvent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInteropFilter
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.hypot

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun SignaturePad(
    modifier: Modifier = Modifier,
    hasSavedSignature: Boolean = false,
    onSignatureChanged: (List<Offset>) -> Unit,
) {
    var points by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    val hostView = LocalView.current
    val strokeColor = MaterialTheme.colorScheme.primary
    val shape = RoundedCornerShape(24.dp)
    val analysis = remember(points, canvasSize) { analyzeSignature(points, canvasSize) }

    Column(
        modifier = modifier
            .fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .clip(shape)
                .background(
                    color = MaterialTheme.colorScheme.surface,
                    shape = shape,
                )
                .border(
                    width = 1.dp,
                    color = if (analysis.isValid) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.outlineVariant
                    },
                    shape = shape,
                )
                .onSizeChanged { canvasSize = it }
                .pointerInteropFilter { motionEvent ->
                    when (motionEvent.actionMasked) {
                        MotionEvent.ACTION_DOWN -> {
                            hostView.parent?.requestDisallowInterceptTouchEvent(true)
                            points = appendStrokeStart(
                                existingPoints = points,
                                start = Offset(motionEvent.x, motionEvent.y).boundTo(canvasSize),
                            )
                            true
                        }

                        MotionEvent.ACTION_MOVE -> {
                            hostView.parent?.requestDisallowInterceptTouchEvent(true)
                            points = appendStrokeSamples(
                                existingPoints = points,
                                motionEvent = motionEvent,
                                canvasSize = canvasSize,
                            )
                            true
                        }

                        MotionEvent.ACTION_UP -> {
                            hostView.parent?.requestDisallowInterceptTouchEvent(false)
                            points = appendStrokeEnd(
                                existingPoints = points,
                                end = Offset(motionEvent.x, motionEvent.y).boundTo(canvasSize),
                            )
                            true
                        }

                        MotionEvent.ACTION_CANCEL -> {
                            hostView.parent?.requestDisallowInterceptTouchEvent(false)
                            true
                        }

                        else -> false
                    }
                },
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                points.windowed(size = 2, step = 1, partialWindows = false).forEach { segment ->
                    if (segment.any { !it.isSpecifiedOffset() }) {
                        return@forEach
                    }
                    drawLine(
                        color = strokeColor,
                        start = segment.first(),
                        end = segment.last(),
                        strokeWidth = 5f,
                        cap = StrokeCap.Round,
                    )
                }
            }
        }

        Text(
            text = when {
                analysis.isValid -> "Signature stroke detected. Save to confirm consent."
                hasSavedSignature && points.isEmpty() -> "A signature is already saved. Draw again only if you want to replace it."
                else -> "Draw a full signature inside the box. Save unlocks after the stroke is long enough."
            },
            style = MaterialTheme.typography.bodySmall,
            color = if (analysis.isValid) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = {
                    points = emptyList()
                    onSignatureChanged(emptyList())
                },
                enabled = points.isNotEmpty() || hasSavedSignature,
                modifier = Modifier.weight(1f),
            ) {
                Text("Clear")
            }
            Button(
                onClick = { onSignatureChanged(points) },
                enabled = analysis.isValid,
                modifier = Modifier.weight(1f),
            ) {
                Text("Save")
            }
        }
    }
}

private data class SignatureAnalysis(
    val isValid: Boolean,
)

private fun analyzeSignature(
    points: List<Offset>,
    size: IntSize,
): SignatureAnalysis {
    if (size == IntSize.Zero || points.isEmpty()) {
        return SignatureAnalysis(isValid = false)
    }

    val specifiedPoints = points.filter(Offset::isSpecifiedOffset)
    if (specifiedPoints.size < 12) {
        return SignatureAnalysis(isValid = false)
    }

    val minX = specifiedPoints.minOf { it.x }
    val maxX = specifiedPoints.maxOf { it.x }
    val minY = specifiedPoints.minOf { it.y }
    val maxY = specifiedPoints.maxOf { it.y }
    val width = maxX - minX
    val height = maxY - minY
    val totalLength = points
        .windowed(size = 2, step = 1, partialWindows = false)
        .filter { segment -> segment.all(Offset::isSpecifiedOffset) }
        .sumOf { segment ->
            hypot(
                (segment[1].x - segment[0].x).toDouble(),
                (segment[1].y - segment[0].y).toDouble(),
            )
        }

    val isWithinBounds = minX >= 0f && minY >= 0f &&
        maxX <= size.width.toFloat() &&
        maxY <= size.height.toFloat()

    return SignatureAnalysis(
        isValid = isWithinBounds &&
            width >= size.width * 0.16f &&
            height >= size.height * 0.08f &&
            totalLength >= size.width * 0.32f,
    )
}

private fun Offset.boundTo(size: IntSize): Offset {
    if (size == IntSize.Zero) {
        return this
    }

    return Offset(
        x = x.coerceIn(0f, size.width.toFloat()),
        y = y.coerceIn(0f, size.height.toFloat()),
    )
}

private fun Offset.isSpecifiedOffset(): Boolean =
    x.isFinite() && y.isFinite()

private fun appendStrokeStart(
    existingPoints: List<Offset>,
    start: Offset,
): List<Offset> = buildList {
    addAll(existingPoints)
    if (existingPoints.isNotEmpty() && existingPoints.lastOrNull()?.isSpecifiedOffset() == true) {
        add(Offset.Unspecified)
    }
    add(start)
}

private fun appendStrokeSamples(
    existingPoints: List<Offset>,
    motionEvent: MotionEvent,
    canvasSize: IntSize,
): List<Offset> = buildList {
    addAll(existingPoints)
    repeat(motionEvent.historySize) { index ->
        add(
            Offset(
                motionEvent.getHistoricalX(index),
                motionEvent.getHistoricalY(index),
            ).boundTo(canvasSize),
        )
    }
    add(Offset(motionEvent.x, motionEvent.y).boundTo(canvasSize))
}

private fun appendStrokeEnd(
    existingPoints: List<Offset>,
    end: Offset,
): List<Offset> {
    val lastPoint = existingPoints.lastOrNull()
    return if (lastPoint != null && lastPoint.isSpecifiedOffset() && lastPoint == end) {
        existingPoints
    } else {
        existingPoints + end
    }
}
