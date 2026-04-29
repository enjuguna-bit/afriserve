package com.afriserve.loanofficer.presentation.component

import android.graphics.Rect
import android.net.Uri
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.text.Text as MlKitText
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs

@Composable
fun FaceLivenessCaptureStudio(
    modifier: Modifier = Modifier,
    onVerifiedCapture: (uri: String, confidenceScore: Double) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val onVerifiedCaptureState by rememberUpdatedState(onVerifiedCapture)
    val controller = remember {
        LifecycleCameraController(context).apply {
            cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA
            setEnabledUseCases(CameraController.IMAGE_CAPTURE or CameraController.IMAGE_ANALYSIS)
        }
    }
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val mainExecutor = remember(context) { ContextCompat.getMainExecutor(context) }
    val processingFrame = remember { AtomicBoolean(false) }
    val detector = remember {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                .build(),
        )
    }
    var faceState by remember { mutableStateOf(FaceLivenessUiState()) }
    var isCapturing by remember { mutableStateOf(false) }

    DisposableEffect(controller, lifecycleOwner, detector) {
        controller.bindToLifecycle(lifecycleOwner)
        controller.setImageAnalysisAnalyzer(cameraExecutor) { imageProxy ->
            if (!processingFrame.compareAndSet(false, true)) {
                imageProxy.close()
                return@setImageAnalysisAnalyzer
            }

            val mediaImage = imageProxy.image
            if (mediaImage == null) {
                processingFrame.set(false)
                imageProxy.close()
                return@setImageAnalysisAnalyzer
            }

            val inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            detector.process(inputImage)
                .addOnSuccessListener { faces ->
                    val nextState = evaluateFaceLiveness(
                        previous = faceState,
                        faces = faces,
                        imageWidth = inputImage.width,
                        imageHeight = inputImage.height,
                    )
                    mainExecutor.execute {
                        faceState = nextState
                    }
                }
                .addOnFailureListener { error ->
                    mainExecutor.execute {
                        faceState = FaceLivenessUiState(
                            prompt = error.message ?: "Unable to analyze the live face frame.",
                            detail = "Check light and camera focus, then keep the face within the guide.",
                        )
                    }
                }
                .addOnCompleteListener {
                    processingFrame.set(false)
                    imageProxy.close()
                }
        }

        onDispose {
            controller.clearImageAnalysisAnalyzer()
            detector.close()
            cameraExecutor.shutdown()
        }
    }

    LaunchedEffect(faceState.verified, isCapturing) {
        if (faceState.verified && !isCapturing) {
            isCapturing = true
            capturePhotoToCache(
                context = context,
                controller = controller,
                prefix = "kyc-face",
                executor = mainExecutor,
                onSaved = { uri ->
                    faceState = faceState.copy(detail = "Portrait saved. Moving to ID capture.")
                    onVerifiedCaptureState(uri, faceState.confidenceScore)
                    isCapturing = false
                },
                onError = { message ->
                    faceState = faceState.copy(
                        verified = false,
                        prompt = message,
                        detail = "Retry the liveness prompt once the camera is stable again.",
                    )
                    isCapturing = false
                },
            )
        }
    }

    CameraGuideCard(
        modifier = modifier,
        title = "Phase 1: Facial liveness",
        subtitle = "The camera opens immediately and only captures the portrait after the live challenge is verified.",
        prompt = faceState.prompt,
        detail = faceState.detail,
        accentColor = if (faceState.verified) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.outline
        },
        trailing = {
            if (isCapturing) {
                CircularProgressIndicator(
                    modifier = Modifier.height(22.dp),
                    strokeWidth = 2.dp,
                )
            } else {
                StatusPill(
                    label = if (faceState.verified) "Verified" else "Live",
                    backgroundColor = if (faceState.verified) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    contentColor = if (faceState.verified) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        },
    ) {
        CameraPreviewSurface(
            controller = controller,
            overlayColor = if (faceState.verified) Color(0xCC2A8640) else Color(0xB3FFFFFF),
        )
    }
}

@Composable
fun DocumentAutoScanStudio(
    modifier: Modifier = Modifier,
    onDocumentCaptured: (uri: String) -> Unit,
    onManualAttachFallback: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val onDocumentCapturedState by rememberUpdatedState(onDocumentCaptured)
    val controller = remember {
        LifecycleCameraController(context).apply {
            cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
            setEnabledUseCases(CameraController.IMAGE_CAPTURE or CameraController.IMAGE_ANALYSIS)
        }
    }
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val mainExecutor = remember(context) { ContextCompat.getMainExecutor(context) }
    val processingFrame = remember { AtomicBoolean(false) }
    val recognizer = remember { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    var documentState by remember { mutableStateOf(DocumentAutoScanUiState()) }
    var isCapturing by remember { mutableStateOf(false) }
    val frameCounter = remember { AtomicInteger(0) }

    DisposableEffect(controller, lifecycleOwner, recognizer) {
        controller.bindToLifecycle(lifecycleOwner)
        controller.setImageAnalysisAnalyzer(cameraExecutor) { imageProxy ->
            if (!processingFrame.compareAndSet(false, true)) {
                imageProxy.close()
                return@setImageAnalysisAnalyzer
            }

            if (frameCounter.incrementAndGet() % 3 != 0) {
                processingFrame.set(false)
                imageProxy.close()
                return@setImageAnalysisAnalyzer
            }

            val mediaImage = imageProxy.image
            if (mediaImage == null) {
                processingFrame.set(false)
                imageProxy.close()
                return@setImageAnalysisAnalyzer
            }

            val inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            recognizer.process(inputImage)
                .addOnSuccessListener { visionText ->
                    val nextState = evaluateDocumentFrameRelaxed(
                        previous = documentState,
                        blocks = visionText.textBlocks,
                        imageWidth = inputImage.width,
                        imageHeight = inputImage.height,
                        imageProxy = imageProxy,
                    )
                    mainExecutor.execute {
                        documentState = nextState
                    }
                }
                .addOnFailureListener { error ->
                    mainExecutor.execute {
                        documentState = DocumentAutoScanUiState(
                            prompt = error.message ?: "Unable to detect the ID frame yet.",
                            detail = "Keep the full card inside the guide and reduce glare.",
                        )
                    }
                }
                .addOnCompleteListener {
                    processingFrame.set(false)
                    imageProxy.close()
                }
        }

        onDispose {
            controller.clearImageAnalysisAnalyzer()
            recognizer.close()
            cameraExecutor.shutdown()
        }
    }

    LaunchedEffect(documentState.readyToCapture, isCapturing) {
        if (documentState.readyToCapture && !isCapturing) {
            isCapturing = true
            capturePhotoToCache(
                context = context,
                controller = controller,
                prefix = "kyc-id",
                executor = mainExecutor,
                onSaved = { uri ->
                    documentState = documentState.copy(detail = "ID captured. Auto-scan is running.")
                    onDocumentCapturedState(uri)
                    isCapturing = false
                },
                onError = { message ->
                    documentState = documentState.copy(
                        readyToCapture = false,
                        stableFrames = 0,
                        prompt = message,
                        detail = "Hold the ID steady and try again.",
                    )
                    isCapturing = false
                },
            )
        }
    }

    CameraGuideCard(
        modifier = modifier,
        title = "Phase 2: ID capture and scan",
        subtitle = "Once the full card is aligned inside the guide, the app auto-captures and scans it.",
        prompt = documentState.prompt,
        detail = documentState.detail,
        accentColor = if (documentState.readyToCapture) {
            Color(0xCC2A8640)
        } else {
            Color(0xB3FFFFFF)
        },
        trailing = {
            if (isCapturing) {
                CircularProgressIndicator(
                    modifier = Modifier.height(22.dp),
                    strokeWidth = 2.dp,
                )
            } else {
                StatusPill(
                    label = if (documentState.readyToCapture) "Auto-scan" else "Align ID",
                    backgroundColor = if (documentState.readyToCapture) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    contentColor = if (documentState.readyToCapture) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        },
        footer = {
            if (onManualAttachFallback != null) {
                OutlinedButton(onClick = onManualAttachFallback) {
                    Text("Use gallery fallback")
                }
            }
        },
    ) {
        CameraPreviewSurface(
            controller = controller,
            overlayColor = if (documentState.readyToCapture) Color(0xCC2A8640) else Color(0xB3FFFFFF),
            overlayAspectRatio = 1.58f,
        )
    }
}

@Composable
private fun CameraGuideCard(
    modifier: Modifier = Modifier,
    title: String,
    subtitle: String,
    prompt: String,
    detail: String,
    accentColor: Color,
    trailing: @Composable () -> Unit,
    footer: @Composable (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        tonalElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(title, style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                trailing()
            }

            content()

            Surface(
                shape = RoundedCornerShape(18.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = prompt,
                        style = MaterialTheme.typography.titleSmall,
                        color = accentColor,
                    )
                    Text(
                        text = detail,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            footer?.invoke()
        }
    }
}

@Composable
private fun CameraPreviewSurface(
    controller: LifecycleCameraController,
    overlayColor: Color,
    overlayAspectRatio: Float = 0.74f,
) {
    val shape = RoundedCornerShape(22.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.74f)
            .background(Color.Black, shape)
            .border(width = 1.dp, color = MaterialTheme.colorScheme.outlineVariant, shape = shape),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                PreviewView(context).apply {
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    this.controller = controller
                }
            },
            update = { previewView ->
                previewView.controller = controller
            },
        )

        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth(0.82f)
                .aspectRatio(overlayAspectRatio)
                .border(width = 2.dp, color = overlayColor, shape = RoundedCornerShape(18.dp)),
        )
    }
}

private data class FaceLivenessUiState(
    val prompt: String = "Center one face inside the guide.",
    val detail: String = "Hold still, then blink once or turn your head slightly to verify liveness.",
    val stableFrames: Int = 0,
    val sawEyesOpen: Boolean = false,
    val sawBlink: Boolean = false,
    val sawHeadTurn: Boolean = false,
    val verified: Boolean = false,
    val confidenceScore: Double = 0.0,
)

private data class DocumentAutoScanUiState(
    val prompt: String = "Place the full ID card inside the guide.",
    val detail: String = "The app will auto-capture once the card edges and text look stable.",
    val stableFrames: Int = 0,
    val readyToCapture: Boolean = false,
)

private fun evaluateFaceLiveness(
    previous: FaceLivenessUiState,
    faces: List<Face>,
    imageWidth: Int,
    imageHeight: Int,
): FaceLivenessUiState {
    if (faces.isEmpty()) {
        return FaceLivenessUiState(
            prompt = "Center one face inside the guide.",
            detail = "Move closer to the camera and improve the lighting.",
        )
    }

    if (faces.size > 1) {
        return FaceLivenessUiState(
            prompt = "Only one customer should be in frame.",
            detail = "Ask everyone else to step out of the camera view.",
        )
    }

    val face = faces.single()
    val box = face.boundingBox
    val imageArea = (imageWidth * imageHeight).toDouble().coerceAtLeast(1.0)
    val faceCoverage = (box.width() * box.height()) / imageArea
    val centeredX = abs(box.exactCenterX() - (imageWidth / 2f)) <= imageWidth * 0.18f
    val centeredY = abs(box.exactCenterY() - (imageHeight / 2f)) <= imageHeight * 0.22f
    val straightPose = abs(face.headEulerAngleY) <= 16f && abs(face.headEulerAngleZ) <= 14f
    val uprightPose = abs(face.headEulerAngleZ) <= 18f

    if (!centeredX || !centeredY || faceCoverage !in 0.10..0.58) {
        return previous.copy(
            stableFrames = 0,
            prompt = "Center the face inside the guide.",
            detail = "Keep the forehead, chin, and both cheeks visible before the liveness challenge begins.",
            verified = false,
        )
    }

    if (!previous.sawEyesOpen && !straightPose) {
        return previous.copy(
            stableFrames = 0,
            prompt = "Look straight at the camera first.",
            detail = "Start from a straight pose, then blink once or turn slightly when prompted.",
            verified = false,
        )
    }

    if (!uprightPose) {
        return previous.copy(
            stableFrames = 0,
            prompt = "Keep the phone level and your face upright.",
            detail = "A slight turn is okay, but keep the face centered and avoid tilting your head.",
            verified = false,
        )
    }

    val stableFrames = if (straightPose) previous.stableFrames + 1 else previous.stableFrames
    val leftEyeOpen = face.leftEyeOpenProbability ?: 0.5f
    val rightEyeOpen = face.rightEyeOpenProbability ?: 0.5f
    val eyesOpen = leftEyeOpen >= 0.60f && rightEyeOpen >= 0.60f
    val blinkDetected = leftEyeOpen <= 0.45f || rightEyeOpen <= 0.45f
    val headTurnDetected = abs(face.headEulerAngleY) >= 10f

    val sawEyesOpen = previous.sawEyesOpen || (stableFrames >= 1 && eyesOpen)
    val sawBlink = previous.sawBlink || (sawEyesOpen && blinkDetected)
    val sawHeadTurn = previous.sawHeadTurn || (sawEyesOpen && headTurnDetected)
    val verified = previous.verified || ((sawBlink && eyesOpen) || sawHeadTurn)

    val confidence = (
        0.38 +
            if (stableFrames >= 3) 0.18 else 0.0 +
            if (faceCoverage in 0.12..0.50) 0.14 else 0.0 +
            if (straightPose) 0.12 else 0.0 +
            if (sawBlink) 0.12 else 0.0 +
            if (sawHeadTurn) 0.08 else 0.0
        ).coerceIn(0.0, 0.98)

    val prompt = when {
        verified -> "Liveness verified. Capturing portrait…"
        !sawEyesOpen -> "Hold still and look straight at the camera."
        !sawBlink && !sawHeadTurn -> "Blink once or turn your head slightly."
        sawBlink -> "Open your eyes again to finish the challenge."
        else -> "Hold steady while liveness is verified."
    }

    val detail = when {
        verified -> "Face capture will save automatically as soon as the camera frame is stable."
        !sawEyesOpen -> "We need a stable, centered face before the live challenge starts."
        !sawBlink && !sawHeadTurn -> "Either challenge is acceptable. The portrait will only be captured after one of them is confirmed."
        else -> "Keep the face inside the guide until the card turns green."
    }

    return FaceLivenessUiState(
        prompt = prompt,
        detail = detail,
        stableFrames = stableFrames,
        sawEyesOpen = sawEyesOpen,
        sawBlink = sawBlink,
        sawHeadTurn = sawHeadTurn,
        verified = verified,
        confidenceScore = confidence,
    )
}

private fun evaluateDocumentFrame(
    previous: DocumentAutoScanUiState,
    blocks: List<MlKitText.TextBlock>,
    imageWidth: Int,
    imageHeight: Int,
    imageProxy: ImageProxy,
): DocumentAutoScanUiState {
    val textBlocks = blocks.mapNotNull { block -> block.boundingBox?.takeIf { !block.text.isNullOrBlank() } }
    if (textBlocks.isEmpty()) {
        return DocumentAutoScanUiState(
            prompt = "Place the full ID card inside the guide.",
            detail = "Move closer until the card text becomes readable and all four edges are visible.",
        )
    }

    val overlay = Rect(
        (imageWidth * 0.14f).toInt(),
        (imageHeight * 0.28f).toInt(),
        (imageWidth * 0.86f).toInt(),
        (imageHeight * 0.72f).toInt(),
    )
    val textBounds = textBlocks.fold(textBlocks.first().let(::Rect)) { acc, rect ->
        acc.apply { union(rect) }
    }
    val coverage = (textBounds.width().toDouble() * textBounds.height().toDouble()) /
        (overlay.width().toDouble() * overlay.height().toDouble()).coerceAtLeast(1.0)
    val centered = overlay.contains(textBounds.centerX(), textBounds.centerY())
    val aspectRatio = textBounds.width().toDouble() / textBounds.height().coerceAtLeast(1).toDouble()
    val edgeScore = estimateEdgeScore(imageProxy)
    val looksReady = centered &&
        coverage in 0.18..0.92 &&
        aspectRatio in 1.2..3.3 &&
        edgeScore >= 0.09

    val stableFrames = if (looksReady) previous.stableFrames + 1 else 0
    val ready = stableFrames >= 3

    val prompt = when {
        ready -> "ID aligned. Capturing…"
        !centered -> "Center the ID card inside the guide."
        coverage < 0.18 -> "Move the ID card closer."
        coverage > 0.92 -> "Move the ID card slightly back."
        edgeScore < 0.09 -> "Keep all four ID edges inside the guide."
        else -> "Hold the ID steady for auto-scan."
    }

    val detail = when {
        ready -> "The card is stable enough to auto-capture and send into OCR."
        edgeScore < 0.09 -> "Reduce glare and keep the full card visible before the scan starts."
        else -> "Once alignment stays stable for a moment, capture will happen automatically."
    }

    return DocumentAutoScanUiState(
        prompt = prompt,
        detail = detail,
        stableFrames = stableFrames,
        readyToCapture = ready,
    )
}

private fun evaluateDocumentFrameRelaxed(
    previous: DocumentAutoScanUiState,
    blocks: List<MlKitText.TextBlock>,
    imageWidth: Int,
    imageHeight: Int,
    imageProxy: ImageProxy,
): DocumentAutoScanUiState {
    val textBlocks = blocks.mapNotNull { block -> block.boundingBox?.takeIf { !block.text.isNullOrBlank() } }
    if (textBlocks.isEmpty()) {
        return DocumentAutoScanUiState(
            prompt = "Place the full ID card inside the guide.",
            detail = "Tilt the card slightly to reduce glare, then hold steady until the text becomes readable.",
        )
    }

    val overlay = Rect(
        (imageWidth * 0.10f).toInt(),
        (imageHeight * 0.24f).toInt(),
        (imageWidth * 0.90f).toInt(),
        (imageHeight * 0.76f).toInt(),
    )
    val textBounds = textBlocks.fold(textBlocks.first().let(::Rect)) { acc, rect ->
        acc.apply { union(rect) }
    }
    val centeredWindow = Rect(overlay).apply {
        inset(
            -(overlay.width() * 0.08f).toInt(),
            -(overlay.height() * 0.10f).toInt(),
        )
    }
    val coverage = (textBounds.width().toDouble() * textBounds.height().toDouble()) /
        (overlay.width().toDouble() * overlay.height().toDouble()).coerceAtLeast(1.0)
    val centered = centeredWindow.contains(textBounds.centerX(), textBounds.centerY())
    val aspectRatio = textBounds.width().toDouble() / textBounds.height().coerceAtLeast(1).toDouble()
    val edgeScore = estimateEdgeScore(imageProxy)
    val readableText = textBlocks.size >= 2 || coverage >= 0.06
    val lowGlareEnough = edgeScore >= 0.04 || (readableText && coverage >= 0.08)
    val looksReady = centered &&
        coverage in 0.06..1.08 &&
        aspectRatio in 1.0..4.2 &&
        lowGlareEnough

    val stableFrames = when {
        looksReady -> previous.stableFrames + 1
        centered && readableText -> (previous.stableFrames - 1).coerceAtLeast(0)
        else -> 0
    }
    val ready = stableFrames >= 2

    val prompt = when {
        ready -> "ID aligned. Capturing..."
        !centered -> "Center the ID card inside the guide."
        coverage < 0.06 -> "Move the ID card a little closer."
        coverage > 1.08 -> "Move the ID card slightly back."
        !readableText -> "Hold the ID steady so the text sharpens."
        !lowGlareEnough -> "Tilt the ID slightly to cut glare."
        else -> "Hold the ID steady for auto-scan."
    }

    val detail = when {
        ready -> "The card is stable enough to auto-capture and send into OCR."
        !readableText -> "The scan begins once the card text is readable and the card stays mostly inside the guide."
        !lowGlareEnough -> "Perfect edge contrast is no longer required, but a slight tilt still helps if glare washes out the card."
        else -> "Once the card stays readable and mostly centered for a moment, capture will happen automatically."
    }

    return DocumentAutoScanUiState(
        prompt = prompt,
        detail = detail,
        stableFrames = stableFrames,
        readyToCapture = ready,
    )
}

private fun estimateEdgeScore(imageProxy: ImageProxy): Double {
    val plane = imageProxy.planes.firstOrNull() ?: return 0.0
    val width = imageProxy.width
    val height = imageProxy.height
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    val bytes = ByteArray(plane.buffer.remaining())
    plane.buffer.rewind()
    plane.buffer.get(bytes)

    fun sample(x: Int, y: Int): Int {
        val safeX = x.coerceIn(0, width - 1)
        val safeY = y.coerceIn(0, height - 1)
        val index = (safeY * rowStride) + (safeX * pixelStride)
        return bytes.getOrNull(index)?.toInt()?.and(0xFF) ?: 0
    }

    val left = (width * 0.16f).toInt()
    val right = (width * 0.84f).toInt()
    val top = (height * 0.28f).toInt()
    val bottom = (height * 0.72f).toInt()

    var total = 0.0
    var count = 0

    for (step in 0..18) {
        val y = top + (((bottom - top) * step) / 18f).toInt()
        total += abs(sample(left + 4, y) - sample(left - 4, y)) / 255.0
        total += abs(sample(right + 4, y) - sample(right - 4, y)) / 255.0
        count += 2
    }

    for (step in 0..18) {
        val x = left + (((right - left) * step) / 18f).toInt()
        total += abs(sample(x, top + 4) - sample(x, top - 4)) / 255.0
        total += abs(sample(x, bottom + 4) - sample(x, bottom - 4)) / 255.0
        count += 2
    }

    return if (count == 0) 0.0 else total / count.toDouble()
}

private fun capturePhotoToCache(
    context: android.content.Context,
    controller: LifecycleCameraController,
    prefix: String,
    executor: java.util.concurrent.Executor,
    onSaved: (String) -> Unit,
    onError: (String) -> Unit,
) {
    val captureDirectory = File(context.cacheDir, "kyc-captures").apply { mkdirs() }
    val outputFile = File.createTempFile(prefix, ".jpg", captureDirectory)
    val outputOptions = ImageCapture.OutputFileOptions.Builder(outputFile).build()

    controller.takePicture(
        outputOptions,
        executor,
        object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                onSaved(outputFileResults.savedUri?.toString() ?: Uri.fromFile(outputFile).toString())
            }

            override fun onError(exception: ImageCaptureException) {
                onError(exception.message ?: "Unable to save the camera capture.")
            }
        },
    )
}
