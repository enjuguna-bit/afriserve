package com.afriserve.loanofficer.core.kyc

import android.content.Context
import android.net.Uri
import com.afriserve.loanofficer.domain.model.CaptureStatus
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.tasks.await

data class LivenessResult(
    val status: CaptureStatus,
    val confidenceScore: Double,
)

class LivenessAnalyzer(
    private val appContext: Context,
) {
    suspend fun evaluate(
        photoUri: String,
        blinkConfirmed: Boolean,
        smileConfirmed: Boolean,
    ): Result<LivenessResult> = runCatching {
        val image = InputImage.fromFilePath(appContext, Uri.parse(photoUri))
        val detector = FaceDetection.getClient(DETECTOR_OPTIONS)

        try {
            val faces = detector.process(image).await()
            when {
                faces.isEmpty() -> error("No face was detected. Retake the portrait in better light.")
                faces.size > 1 -> error("Only one customer should be visible during the liveness check.")
            }

            val face = faces.single()
            val imageArea = (image.width * image.height).toDouble().coerceAtLeast(1.0)
            val faceCoverage = (face.boundingBox.width() * face.boundingBox.height()) / imageArea
            val faceIsFrontal = abs(face.headEulerAngleY) <= 18f && abs(face.headEulerAngleZ) <= 12f
            val smilingProbability = face.smilingProbability ?: 0f
            val leftEyeOpen = face.leftEyeOpenProbability ?: 0.5f
            val rightEyeOpen = face.rightEyeOpenProbability ?: 0.5f
            val blinkDetected = leftEyeOpen <= 0.35f || rightEyeOpen <= 0.35f

            var score = 0.36
            if (faceIsFrontal) score += 0.18
            if (faceCoverage in 0.15..0.7) score += 0.16
            score += when {
                smileConfirmed && smilingProbability >= 0.55f -> 0.18
                smileConfirmed -> 0.08
                smilingProbability >= 0.55f -> 0.1
                else -> 0.0
            }
            score += when {
                blinkConfirmed && blinkDetected -> 0.12
                blinkConfirmed -> 0.06
                blinkDetected -> 0.08
                else -> 0.0
            }

            val normalizedScore = score.coerceIn(0.0, 0.98)
            val status = when {
                normalizedScore >= 0.76 -> CaptureStatus.VERIFIED
                normalizedScore >= 0.58 -> CaptureStatus.CAPTURED
                else -> CaptureStatus.FAILED
            }

            LivenessResult(
                status = status,
                confidenceScore = (normalizedScore * 100).roundToInt() / 100.0,
            )
        } finally {
            detector.close()
        }
    }

    private companion object {
        val DETECTOR_OPTIONS: FaceDetectorOptions = FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .build()
    }
}
