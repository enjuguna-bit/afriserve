package com.afriserve.loanofficer.domain.model

import java.util.UUID
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

const val MIN_REQUIRED_GUARANTOR_COUNT = 1
const val MIN_REQUIRED_COLLATERAL_COUNT = 2

@Serializable
data class OfficerSession(
    val officerId: Long,
    val fullName: String,
    val email: String,
    val role: String,
    val roles: List<String> = emptyList(),
    val permissions: List<String> = emptyList(),
    val accessToken: String,
    val refreshToken: String,
    val tenantId: String,
    val branchId: Int? = null,
    val primaryRegionId: Int? = null,
    val assignedBranchIds: List<Int> = emptyList(),
    val biometricEnabled: Boolean = false,
)

@Serializable(with = OnboardingStepSerializer::class)
enum class OnboardingStep(
    val position: Int,
    val label: String,
) {
    PROFILE(1, "Profile"),
    KYC(2, "KYC"),
    GUARANTOR(3, "Guarantor"),
    COLLATERAL(4, "Collateral"),
    FEE(5, "Fee"),
    ;

    companion object {
        fun fromPersistedValue(value: String?): OnboardingStep =
            when (value.orEmpty().trim().uppercase()) {
                "PROFILE",
                "IDENTITY" -> PROFILE
                "KYC" -> KYC
                "GUARANTOR" -> GUARANTOR
                "COLLATERAL" -> COLLATERAL
                "FEE",
                "RISK",
                "APPROVAL" -> FEE
                "FINANCIALS" -> PROFILE
                else -> PROFILE
            }
    }
}

object OnboardingStepSerializer : KSerializer<OnboardingStep> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("OnboardingStep", PrimitiveKind.STRING)

    override fun serialize(
        encoder: Encoder,
        value: OnboardingStep,
    ) {
        encoder.encodeString(value.name)
    }

    override fun deserialize(decoder: Decoder): OnboardingStep =
        OnboardingStep.fromPersistedValue(decoder.decodeString())
}

@Serializable
enum class DraftLifecycleStatus {
    DRAFT,
    PENDING_SYNC,
    SYNCING,
    SYNCED,
    FAILED,
    COMPLETED,
}

@Serializable
enum class CaptureStatus {
    NOT_STARTED,
    CAPTURED,
    VERIFIED,
    FAILED,
}

@Serializable
enum class KycReviewStatus(
    val apiValue: String,
    val label: String,
) {
    PENDING("pending", "Pending"),
    IN_REVIEW("in_review", "In review"),
    VERIFIED("verified", "Verified"),
    REJECTED("rejected", "Rejected"),
    SUSPENDED("suspended", "Suspended"),
    ;

    companion object {
        fun fromApiValue(value: String?): KycReviewStatus =
            entries.firstOrNull { it.apiValue == value.orEmpty().trim().lowercase() }
                ?: PENDING
    }
}

@Serializable
data class IdentityDetails(
    val fullName: String = "",
    val phone: String = "",
    val nationalId: String = "",
    val kraPin: String = "",
    val nextOfKinName: String = "",
    val nextOfKinPhone: String = "",
    val nextOfKinRelation: String = "",
    val residentialAddress: String = "",
    val photoRemoteUrl: String? = null,
    val idDocumentRemoteUrl: String? = null,
    val capturedPhotoUri: String? = null,
    val capturedIdDocumentUri: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val locationAccuracyMeters: Double? = null,
    val locationCapturedAtIso: String? = null,
)

@Serializable
data class FinancialDetails(
    val businessType: String = "",
    val businessYears: Int? = null,
    val businessLocation: String = "",
    val monthlyIncome: Double? = null,
    val householdExpenses: Double? = null,
    val requestedLoanAmount: Double? = null,
    val requestedTermWeeks: Int? = null,
    val feePaymentAmount: Double? = null,
    val feePaymentReference: String = "",
    val feePaidAtIso: String? = null,
    val feeSubmittedAtIso: String? = null,
)

@Serializable
data class GuarantorDraft(
    val draftId: String = UUID.randomUUID().toString(),
    val fullName: String = "",
    val phone: String = "",
    val nationalId: String = "",
    val physicalAddress: String = "",
    val occupation: String = "",
    val employerName: String = "",
    val monthlyIncome: Double? = null,
    val guaranteeAmount: Double? = null,
    val idDocumentRemoteUrl: String? = null,
    val idDocumentLocalUri: String? = null,
    val syncedAtMillis: Long? = null,
)

@Serializable
data class CollateralDraft(
    val draftId: String = UUID.randomUUID().toString(),
    val assetType: String = "chattel",
    val description: String = "",
    val estimatedValue: Double? = null,
    val ownershipType: String = "client",
    val ownerName: String = "",
    val ownerNationalId: String = "",
    val registrationNumber: String = "",
    val logbookNumber: String = "",
    val titleNumber: String = "",
    val locationDetails: String = "",
    val valuationDateIso: String? = null,
    val documentRemoteUrl: String? = null,
    val documentLocalUri: String? = null,
    val syncedAtMillis: Long? = null,
)

@Serializable
data class RiskAssessment(
    val riskBand: String = "Moderate",
    val confidenceScore: Int = 62,
    /**
     * False until the backend has returned a live onboarding-status response.
     * While false the riskBand and confidenceScore are placeholder defaults and
     * must NOT be shown to the officer as if they were real assessments.
     */
    val isLiveScore: Boolean = false,
    val notes: String = "",
    val checklist: List<String> = listOf(
        "Profile photo and location captured",
        "KYC reviewed",
        "Guarantor recorded with document",
        "Collateral recorded with document",
        "Fee captured",
    ),
)

@Serializable
data class KycPackage(
    val documentOcrStatus: CaptureStatus = CaptureStatus.NOT_STARTED,
    val livenessStatus: CaptureStatus = CaptureStatus.NOT_STARTED,
    val signatureStatus: CaptureStatus = CaptureStatus.NOT_STARTED,
    val reviewStatus: KycReviewStatus = KycReviewStatus.PENDING,
    val reviewNote: String = "",
    val ocrExtractedIdNumber: String = "",
    val faceMatchScore: Double? = null,
    val signatureSvgPath: String = "",
    val kycSynced: Boolean = false,
)

@Serializable
data class ApprovalChecklist(
    val customerPin: String = "",
    val officerNotes: String = "",
    val handoffModeEnabled: Boolean = false,
    val readyForSubmission: Boolean = false,
)

@Serializable
data class OnboardingChecklistSnapshot(
    val profilePhotoAdded: Boolean = false,
    val locationCaptured: Boolean = false,
    val guarantorAdded: Boolean = false,
    val guarantorDocumentsComplete: Boolean = false,
    val collateralAdded: Boolean = false,
    val collateralDocumentsComplete: Boolean = false,
    val feesPaid: Boolean = false,
    val complete: Boolean = false,
)

@Serializable
data class OnboardingCountsSnapshot(
    val guarantors: Int = 0,
    val guarantorDocuments: Int = 0,
    val collaterals: Int = 0,
    val collateralDocuments: Int = 0,
)

@Serializable
data class OnboardingLocationSnapshot(
    val captured: Boolean = false,
    val accuracyMeters: Double? = null,
    val capturedAt: String? = null,
)

@Serializable
data class OnboardingStatusSnapshot(
    val onboardingStatus: String = "registered",
    val kycStatus: String = "pending",
    val feePaymentStatus: String = "unpaid",
    val feesPaidAt: String? = null,
    val readyForLoanApplication: Boolean = false,
    val checklist: OnboardingChecklistSnapshot = OnboardingChecklistSnapshot(),
    val counts: OnboardingCountsSnapshot = OnboardingCountsSnapshot(),
    val location: OnboardingLocationSnapshot = OnboardingLocationSnapshot(),
    val nextStep: String? = null,
)

@Serializable
data class OnboardingDraft(
    val localId: String = UUID.randomUUID().toString(),
    val remoteClientId: Long? = null,
    val status: DraftLifecycleStatus = DraftLifecycleStatus.DRAFT,
    val activeStep: OnboardingStep = OnboardingStep.PROFILE,
    val assignedOfficerId: Long? = null,
    val assignedBranchId: Int? = null,
    val updatedAtMillis: Long = System.currentTimeMillis(),
    val completedAtMillis: Long? = null,
    val identity: IdentityDetails = IdentityDetails(),
    val financials: FinancialDetails = FinancialDetails(),
    val guarantors: List<GuarantorDraft> = emptyList(),
    val collaterals: List<CollateralDraft> = emptyList(),
    val risk: RiskAssessment = RiskAssessment(),
    val kyc: KycPackage = KycPackage(),
    val approval: ApprovalChecklist = ApprovalChecklist(),
    val serverStatus: OnboardingStatusSnapshot? = null,
    val syncError: String? = null,
) {
    val progress: Float
        get() = activeStep.position / 5f
}

fun GuarantorDraft.hasDocument(): Boolean =
    !idDocumentRemoteUrl.isNullOrBlank() || !idDocumentLocalUri.isNullOrBlank()

fun GuarantorDraft.isMeaningfullyStarted(): Boolean =
    fullName.isNotBlank() ||
        phone.isNotBlank() ||
        nationalId.isNotBlank() ||
        physicalAddress.isNotBlank() ||
        occupation.isNotBlank() ||
        employerName.isNotBlank() ||
        monthlyIncome != null ||
        guaranteeAmount != null ||
        hasDocument()

fun CollateralDraft.hasDocument(): Boolean =
    !documentRemoteUrl.isNullOrBlank() || !documentLocalUri.isNullOrBlank()

fun CollateralDraft.isMeaningfullyStarted(): Boolean =
    assetType != "chattel" ||
        description.isNotBlank() ||
        estimatedValue != null ||
        ownershipType != "client" ||
        ownerName.isNotBlank() ||
        ownerNationalId.isNotBlank() ||
        registrationNumber.isNotBlank() ||
        logbookNumber.isNotBlank() ||
        titleNumber.isNotBlank() ||
        locationDetails.isNotBlank() ||
        !valuationDateIso.isNullOrBlank() ||
        hasDocument()

fun OnboardingDraft.startedGuarantors(): List<GuarantorDraft> =
    guarantors.filter(GuarantorDraft::isMeaningfullyStarted)

fun OnboardingDraft.startedCollaterals(): List<CollateralDraft> =
    collaterals.filter(CollateralDraft::isMeaningfullyStarted)

fun OnboardingDraft.hasCustomerFaceCapture(): Boolean =
    !identity.capturedPhotoUri.isNullOrBlank() || !identity.photoRemoteUrl.isNullOrBlank()

fun OnboardingDraft.hasCustomerIdCapture(): Boolean =
    !identity.capturedIdDocumentUri.isNullOrBlank() || !identity.idDocumentRemoteUrl.isNullOrBlank()

fun OnboardingDraft.hasStrictKycEvidence(): Boolean =
    hasCustomerFaceCapture() &&
        hasCustomerIdCapture() &&
        kyc.livenessStatus == CaptureStatus.VERIFIED &&
        kyc.documentOcrStatus == CaptureStatus.VERIFIED &&
        kyc.signatureStatus == CaptureStatus.VERIFIED

fun OnboardingDraft.resolveLocalKycReviewStatus(): KycReviewStatus =
    when {
        kyc.reviewStatus == KycReviewStatus.REJECTED -> KycReviewStatus.REJECTED
        kyc.reviewStatus == KycReviewStatus.SUSPENDED -> KycReviewStatus.SUSPENDED
        hasStrictKycEvidence() -> KycReviewStatus.VERIFIED
        hasCustomerFaceCapture() || hasCustomerIdCapture() ||
            kyc.livenessStatus != CaptureStatus.NOT_STARTED ||
            kyc.documentOcrStatus != CaptureStatus.NOT_STARTED ||
            kyc.signatureStatus != CaptureStatus.NOT_STARTED ||
            kyc.reviewNote.isNotBlank() -> KycReviewStatus.IN_REVIEW
        else -> KycReviewStatus.PENDING
    }

@Serializable
data class OnboardingDraftSummary(
    val localId: String,
    val remoteClientId: Long?,
    val customerName: String,
    val maskedPhone: String,
    val status: DraftLifecycleStatus,
    val activeStep: OnboardingStep,
    val updatedAtMillis: Long,
    val syncError: String? = null,
)

data class DashboardSnapshot(
    val pendingOnboardings: Int,
    val drafts: Int,
    val completedToday: Int,
    val pendingSync: Int,
    val clearableDrafts: Int,
    val recentDrafts: List<OnboardingDraftSummary>,
)

data class SyncReport(
    val syncedDraftIds: List<String>,
    val failedDraftIds: List<String>,
    val retryScheduledDraftIds: List<String> = emptyList(),
)
