package com.afriserve.customer.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.afriserve.customer.ui.theme.DividerColor
import com.afriserve.customer.ui.theme.SurfaceCard

@Composable
fun ShimmerBox(
  width: Dp,
  height: Dp,
  radius: Dp = 16.dp,
  modifier: Modifier = Modifier,
) {
  val transition = rememberInfiniteTransition(label = "shimmer")
  val offset by transition.animateFloat(
    initialValue = 0f,
    targetValue = 1000f,
    animationSpec = infiniteRepeatable(
      animation = tween(durationMillis = 1200, easing = LinearEasing),
      repeatMode = RepeatMode.Restart,
    ),
    label = "shimmerOffset",
  )
  val brush = Brush.linearGradient(
    colors = listOf(DividerColor, SurfaceCard, DividerColor),
    start = Offset(offset - 250f, offset - 250f),
    end = Offset(offset, offset),
  )
  Box(
    modifier = modifier
      .width(width)
      .height(height)
      .clip(RoundedCornerShape(radius))
      .background(brush),
  )
}

@Composable
fun ShimmerText(
  width: Dp,
  modifier: Modifier = Modifier,
) {
  ShimmerBox(
    width = width,
    height = 14.dp,
    radius = 12.dp,
    modifier = modifier,
  )
}
