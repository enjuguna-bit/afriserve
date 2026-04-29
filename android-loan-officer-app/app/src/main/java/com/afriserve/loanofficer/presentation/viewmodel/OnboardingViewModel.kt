package com.afriserve.loanofficer.presentation.viewmodel

import androidx.compose.ui.geometry.Offset
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afriserve.loanofficer.core.kyc.LivenessAnalyzer
import com.afriserve.loanofficer.core.kyc.OcrScanner
import com.afriserve.loanofficer.core.kyc.SignaturePathEncoder
import com.afriserve.loanofficer.core.location.FieldLocationClient
import com.afriserve.loanofficer.data.network.ApiErrorParser
import com.afriserve.loanofficer.domain.model.CaptureStatus
import com.afriserve.loanofficer.domain.model.CollateralDraft
import com.afriserve.loanofficer.domain.model.DraftLifecycleStatus
import com.afriserve.loanofficer.domain.model.GuarantorDraft
import com.afriserve.loanofficer.domain.model.OnboardingDraft
import com.afriserve.loanofficer.domain.model.OnboardingStep
import com.afriserve.loanofficer.domain.model.resolveLocalKycReviewStatus
import com.afriserve.loanofficer.domain.repository.OnboardingRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class OnboardingEditorUiState(
    val draft: OnboardingDraft? = null,
    val isLoading: Boolean = true,
    val isSyncing: Boolean = false,
    val error: String? = null,
    val bannerMessage: String? = null,
    val syncStepLabel: String? = null,
)

class OnboardingViewModel(
    savedStateHandle: SavedStateHandle,
    private val onboardingRepository: OnboardingRepository,
    private val ocrScanner: OcrScanner,
    private val livenessAnalyzer: LivenessAnalyzer,
    private val fieldLocationClient: FieldLocationClient,
) : ViewModel() {
    private val localId: String = checkNotNull(savedStateHandle["localId"])
    private var lastRefreshedRemoteClientId: Long? = null

    private val _uiState = MutableStateFlow(OnboardingEditorUiState())
    val uiState: StateFlow<OnboardingEditorUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            onboardingRepository.observeDraft(localId).collect { draft ->
                _uiState.update {
                    it.copy(
                        draft = draft,
                        isLoading = false,
                        error = if (draft == null) {
                            "This onboarding draft could not be found locally."
                        } else {
                            null
                        },
                    )
                }

                val remoteClientId = draft?.remoteClientId
                if (remoteClientId != null && remoteClientId != lastRefreshedRemoteClientId) {
                    lastRefreshedRemoteClientId = remoteClientId
                    refreshDraftFromServerSilently()
                }
            }
        }
    }

    fun onSetStep(step: OnboardingStep) {
        mutateDraft { it.copy(activeStep = step) }
    }

    fun onUpdateDraft(transform: (OnboardingDraft) -> OnboardingDraft) {
        mutateDraft(transform = transform)
    }

    fun onToggleHandoff(enabled: Boolean) {
        mutateDraft {
            it.copy(
                approval = it.approval.copy(handoffModeEnabled = enabled),
            )
        }
    }

    fun onSetCustomerPin(pin: String) {
        mutateDraft {
            it.copy(
                approval = it.approval.copy(customerPin = pin.filter(Char::isDigit).take(4)),
            )
        }
    }

    fun onSetOfficerNotes(notes: String) {
        mutateDraft {
            it.copy(
                approval = it.approval.copy(officerNotes = notes),
            )
        }
    }

    fun onSetIdDocumentUri(uri: String) {
        mutateDraft {
            it.copy(
                identity = it.identity.copy(capturedIdDocumentUri = uri),
                kyc = it.kyc.copy(
                    documentOcrStatus = CaptureStatus.CAPTURED,
                    ocrExtractedIdNumber = "",
                    kycSynced = false,
                ),
            )
        }
    }

    fun onCaptureVerifiedFace(
        uri: String,
        confidenceScore: Double,
    ) {
        mutateDraft(bannerMessage = "Liveness verified. Face capture saved automatically.") {
            it.copy(
                identity = it.identity.copy(capturedPhotoUri = uri),
                kyc = it.kyc.copy(
                    livenessStatus = CaptureStatus.VERIFIED,
                    faceMatchScore = confidenceScore,
                    kycSynced = false,
                ),
            )
        }
    }

    fun onCaptureIdDocumentAndScan(uri: String) {
        mutateDraft(bannerMessage = "ID captured. Running auto-scan.") {
            it.copy(
                identity = it.identity.copy(capturedIdDocumentUri = uri),
                kyc = it.kyc.copy(
                    documentOcrStatus = CaptureStatus.CAPTURED,
                    ocrExtractedIdNumber = "",
                    kycSynced = false,
                ),
            )
        }
        runDocumentOcr(uri)
    }

    fun onSetKycReviewNote(note: String) {
        mutateDraft {
            it.copy(
                kyc = it.kyc.copy(
                    reviewNote = note,
                    kycSynced = false,
                ),
            )
        }
    }

    fun onCaptureLocation() {
        viewModelScope.launch(Dispatchers.IO) {
            _uiState.update {
                it.copy(
                    bannerMessage = "Capturing field location.",
                    error = null,
                )
            }

            fieldLocationClient.captureCurrentLocation()
                .onSuccess { result ->
                    mutateDraft(bannerMessage = "Field location pinned successfully.") {
                        it.copy(
                            identity = it.identity.copy(
                                latitude = result.latitude,
                                longitude = result.longitude,
                                locationAccuracyMeters = result.accuracyMeters,
                                locationCapturedAtIso = result.capturedAtIso,
                            ),
                        )
                    }
                }
                .onFailure { error ->
                    val message = ApiErrorParser.normalize(error).userMessage
                    _uiState.update {
                        it.copy(
                            error = message,
                            bannerMessage = message,
                        )
                    }
                }
        }
    }

    fun onRunOcr() {
        val draft = uiState.value.draft ?: return
        val documentUri = draft.identity.capturedIdDocumentUri
        if (documentUri.isNullOrBlank()) {
            _uiState.update {
                it.copy(
                    error = "Capture the customer ID document before running OCR.",
                    bannerMessage = "Capture the customer ID document before running OCR.",
                )
            }
            return
        }
        runDocumentOcr(documentUri)
    }

    fun onCommitSignature(points: List<Offset>) {
        val encodedPath = SignaturePathEncoder.encode(points)
        mutateDraft(
            bannerMessage = if (encodedPath.isBlank()) "Signature cleared." else "Signature captured.",
        ) {
            it.copy(
                kyc = it.kyc.copy(
                    signatureStatus = if (encodedPath.isBlank()) CaptureStatus.NOT_STARTED else CaptureStatus.VERIFIED,
                    signatureSvgPath = encodedPath,
                    kycSynced = false,
                ),
            )
        }
    }

    fun onAddGuarantor() {
        mutateDraft {
            it.copy(guarantors = it.guarantors + GuarantorDraft())
        }
    }

    fun onUpdateGuarantor(
        index: Int,
        guarantor: GuarantorDraft,
    ) {
        mutateDraft {
            it.copy(
                guarantors = it.guarantors.mapIndexed { currentIndex, current ->
                    if (currentIndex == index) guarantor.copy(syncedAtMillis = null) else current
                },
            )
        }
    }

    fun onRemoveGuarantor(index: Int) {
        mutateDraft {
            it.copy(guarantors = it.guarantors.filterIndexed { currentIndex, _ -> currentIndex != index })
        }
    }

    fun onAddCollateral() {
        mutateDraft {
            it.copy(collaterals = it.collaterals + CollateralDraft())
        }
    }

    fun onUpdateCollateral(
        index: Int,
        collateral: CollateralDraft,
    ) {
        mutateDraft {
            it.copy(
                collaterals = it.collaterals.mapIndexed { currentIndex, current ->
                    if (currentIndex == index) collateral.copy(syncedAtMillis = null) else current
                },
            )
        }
    }

    fun onRemoveCollateral(index: Int) {
        mutateDraft {
            it.copy(collaterals = it.collaterals.filterIndexed { currentIndex, _ -> currentIndex != index })
        }
    }

    fun onSaveDraft() {
        val draft = uiState.value.draft ?: return
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    onboardingRepository.saveDraft(draft.copy(status = DraftLifecycleStatus.DRAFT))
                }
            }.onSuccess {
                _uiState.update {
                    it.copy(
                        error = null,
                        bannerMessage = "Draft saved locally for offline work.",
                    )
                }
            }.onFailure { error ->
                val message = ApiErrorParser.normalize(error).userMessage
                _uiState.update {
                    it.copy(
                        error = message,
                        bannerMessage = message,
                    )
                }
            }
        }
    }

    fun onSyncNow() {
        val draft = uiState.value.draft ?: return
        val latestDraft = draft.copy(
            updatedAtMillis = System.currentTimeMillis(),
            syncError = null,
        )
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    draft = latestDraft,
                    isSyncing = true,
                    error = null,
                    bannerMessage = "Queueing draft for sync.",
                    syncStepLabel = "Queueing draft for background sync...",
                )
            }

            runCatching {
                withContext(Dispatchers.IO) {
                    onboardingRepository.saveDraft(latestDraft)
                    onboardingRepository.queueDraftForSync(latestDraft.localId)
                }
                _uiState.update {
                    it.copy(syncStepLabel = "Running createClient -> uploadDocuments -> updateClient pipeline...")
                }
                withContext(Dispatchers.IO) {
                    onboardingRepository.syncPendingDrafts()
                }
            }.onSuccess { report ->
                _uiState.update {
                    it.copy(
                        isSyncing = false,
                        syncStepLabel = null,
                        error = null,
                        bannerMessage = when {
                            report.failedDraftIds.isEmpty() -> "Sync completed successfully."
                            report.retryScheduledDraftIds.isNotEmpty() ->
                                "Some items are still queued. The app will retry automatically when connectivity is stable."
                            else -> "Sync needs attention. Review the draft errors and retry."
                        },
                    )
                }
            }.onFailure { error ->
                val message = ApiErrorParser.normalize(error).userMessage
                _uiState.update {
                    it.copy(
                        isSyncing = false,
                        syncStepLabel = null,
                        error = message,
                        bannerMessage = message,
                    )
                }
            }
        }
    }

    private fun refreshDraftFromServerSilently() {
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    onboardingRepository.refreshDraftFromServer(localId)
                }
            }
        }
    }

    private fun runDocumentOcr(documentUri: String) {
        viewModelScope.launch(Dispatchers.IO) {
            _uiState.update {
                it.copy(
                    bannerMessage = "Scanning ID document.",
                    error = null,
                )
            }

            ocrScanner.scan(documentUri)
                .onSuccess { result ->
                    mutateDraft(
                        bannerMessage = if (result.idCandidate != null) {
                            "OCR completed and extracted an ID number."
                        } else {
                            "OCR completed. Review the extracted details before syncing."
                        },
                    ) {
                        it.copy(
                            identity = it.identity.copy(
                                nationalId = result.idCandidate ?: it.identity.nationalId,
                            ),
                            kyc = it.kyc.copy(
                                documentOcrStatus = if (result.idCandidate != null) {
                                    CaptureStatus.VERIFIED
                                } else {
                                    CaptureStatus.CAPTURED
                                },
                                ocrExtractedIdNumber = result.idCandidate.orEmpty(),
                                kycSynced = false,
                            ),
                        )
                    }
                }
                .onFailure { error ->
                    val message = ApiErrorParser.normalize(error).userMessage
                    mutateDraft(bannerMessage = message) {
                        it.copy(
                            kyc = it.kyc.copy(
                                documentOcrStatus = CaptureStatus.FAILED,
                                kycSynced = false,
                            ),
                        )
                    }
                    _uiState.update { state -> state.copy(error = message) }
                }
        }
    }

    private fun mutateDraft(
        bannerMessage: String? = null,
        transform: (OnboardingDraft) -> OnboardingDraft,
    ) {
        val current = uiState.value.draft ?: return
        val updated = alignDerivedKycState(transform(current)).copy(
            updatedAtMillis = System.currentTimeMillis(),
            syncError = null,
        )

        _uiState.update {
            it.copy(
                draft = updated,
                error = null,
                bannerMessage = bannerMessage ?: it.bannerMessage,
            )
        }

        viewModelScope.launch(Dispatchers.IO) {
            runCatching { onboardingRepository.saveDraft(updated) }
                .onFailure { error ->
                    val message = ApiErrorParser.normalize(error).userMessage
                    _uiState.update {
                        it.copy(
                            error = message,
                            bannerMessage = message,
                        )
                    }
                }
        }
    }

    private fun alignDerivedKycState(draft: OnboardingDraft): OnboardingDraft =
        draft.copy(
            kyc = draft.kyc.copy(
                reviewStatus = draft.resolveLocalKycReviewStatus(),
            ),
        )
}
