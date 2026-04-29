package com.afriserve.loanofficer.core.kyc

import androidx.compose.ui.geometry.Offset

object SignaturePathEncoder {
    fun encode(points: List<Offset>): String {
        if (points.isEmpty()) return ""
        return buildString {
            var startNewStroke = true
            points.forEach { offset ->
                if (!offset.isSpecifiedOffset()) {
                    startNewStroke = true
                    return@forEach
                }

                append(if (startNewStroke) "M" else " L")
                append(offset.x.toInt())
                append(",")
                append(offset.y.toInt())
                startNewStroke = false
            }
        }
    }
}

private fun Offset.isSpecifiedOffset(): Boolean =
    x.isFinite() && y.isFinite()
