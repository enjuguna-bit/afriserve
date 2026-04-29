package com.afriserve.loanofficer.presentation.screen

import android.Manifest
import android.content.Context
import android.net.Uri
import android.content.pm.PackageManager
import android.provider.OpenableColumns
import android.view.View
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.PersonAddAlt1
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.afriserve.loanofficer.core.util.InputMasking
import com.afriserve.loanofficer.presentation.component.AfriserveLogo
import com.afriserve.loanofficer.presentation.component.CaptureStatusPill
import com.afriserve.loanofficer.presentation.component.DocumentAutoScanStudio
import com.afriserve.loanofficer.presentation.component.FaceLivenessCaptureStudio
import com.afriserve.loanofficer.domain.model.CollateralDraft
import com.afriserve.loanofficer.domain.model.GuarantorDraft
import com.afriserve.loanofficer.domain.model.KycReviewStatus
import com.afriserve.loanofficer.domain.model.MIN_REQUIRED_COLLATERAL_COUNT
import com.afriserve.loanofficer.domain.model.MIN_REQUIRED_GUARANTOR_COUNT
import com.afriserve.loanofficer.domain.model.OnboardingDraft
import com.afriserve.loanofficer.domain.model.OnboardingStep
import com.afriserve.loanofficer.domain.model.hasDocument
import com.afriserve.loanofficer.domain.model.hasStrictKycEvidence
import com.afriserve.loanofficer.domain.model.startedCollaterals
import com.afriserve.loanofficer.domain.model.startedGuarantors
import com.afriserve.loanofficer.domain.model.resolveLocalKycReviewStatus
import com.afriserve.loanofficer.domain.validation.OnboardingValidation
import com.afriserve.loanofficer.presentation.component.DraftStatusPill
import com.afriserve.loanofficer.presentation.component.ProgressStepper
import com.afriserve.loanofficer.presentation.component.SignaturePad
import com.afriserve.loanofficer.presentation.component.StatusPill
import com.afriserve.loanofficer.presentation.viewmodel.OnboardingEditorUiState
import java.io.File

private sealed interface AttachmentTarget {
    data object CustomerId : AttachmentTarget
    data class GuarantorDoc(val index: Int) : AttachmentTarget
    data class CollateralDoc(val index: Int) : AttachmentTarget
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardingScreen(
    state: OnboardingEditorUiState,
    onBack: () -> Unit,
    onSetStep: (OnboardingStep) -> Unit,
    onUpdateDraft: ((OnboardingDraft) -> OnboardingDraft) -> Unit,
    onToggleHandoff: (Boolean) -> Unit,
    onSetCustomerPin: (String) -> Unit,
    onSetOfficerNotes: (String) -> Unit,
    onSetIdDocumentUri: (String) -> Unit,
    onCaptureVerifiedFace: (String, Double) -> Unit,
    onCaptureIdDocumentAndScan: (String) -> Unit,
    onSetKycReviewNote: (String) -> Unit,
    onCaptureLocation: () -> Unit,
    onRunOcr: () -> Unit,
    onCommitSignature: (List<Offset>) -> Unit,
    onAddGuarantor: () -> Unit,
    onUpdateGuarantor: (Int, GuarantorDraft) -> Unit,
    onRemoveGuarantor: (Int) -> Unit,
    onAddCollateral: () -> Unit,
    onUpdateCollateral: (Int, CollateralDraft) -> Unit,
    onRemoveCollateral: (Int) -> Unit,
    onSaveDraft: () -> Unit,
    onSyncNow: () -> Unit,
) {
    val draft = state.draft
    if (state.isLoading || draft == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Loading onboarding workspace…")
        }
        return
    }

    var pendingAttachment by remember { mutableStateOf<AttachmentTarget?>(null) }
    var cameraPermissionDenied by remember { mutableStateOf(false) }
    var locationPermissionDenied by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val view = LocalView.current
    val parityState = remember(draft) { deriveParityState(draft) }
    val hasCameraPermission = remember(draft.activeStep, cameraPermissionDenied) {
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
    }

    DisposableEffect(view) {
        val previousAutofillMode = view.importantForAutofill
        view.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        onDispose {
            view.importantForAutofill = previousAutofillMode
        }
    }

    LaunchedEffect(
        draft.activeStep,
        parityState.profileDone,
        parityState.kycDone,
        parityState.guarantorDone,
        parityState.collateralDone,
    ) {
        if (!canSelectStep(draft.activeStep, parityState)) {
            onSetStep(firstAvailableStep(parityState))
        }
    }

    val attachmentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val target = pendingAttachment ?: return@rememberLauncherForActivityResult
        val value = uri?.let { selectedUri ->
            runCatching {
                persistImportedAttachment(
                    context = context,
                    sourceUri = selectedUri,
                    fileNamePrefix = when (target) {
                        AttachmentTarget.CustomerId -> "customer-id"
                        is AttachmentTarget.GuarantorDoc -> "guarantor-id"
                        is AttachmentTarget.CollateralDoc -> "collateral-doc"
                    },
                )
            }.getOrElse {
                selectedUri.toString()
            }
        } ?: return@rememberLauncherForActivityResult
        when (target) {
            AttachmentTarget.CustomerId -> onSetIdDocumentUri(value)
            is AttachmentTarget.GuarantorDoc -> {
                val current = draft.guarantors.getOrNull(target.index) ?: return@rememberLauncherForActivityResult
                onUpdateGuarantor(
                    target.index,
                    current.copy(idDocumentLocalUri = value, idDocumentRemoteUrl = null),
                )
            }
            is AttachmentTarget.CollateralDoc -> {
                val current = draft.collaterals.getOrNull(target.index) ?: return@rememberLauncherForActivityResult
                onUpdateCollateral(
                    target.index,
                    current.copy(documentLocalUri = value, documentRemoteUrl = null),
                )
            }
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        cameraPermissionDenied = !granted
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        locationPermissionDenied = !granted
        if (granted) {
            onCaptureLocation()
        }
    }

    LaunchedEffect(draft.activeStep) {
        if (
            draft.activeStep == OnboardingStep.KYC &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
        ) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AfriserveLogo(
                            modifier = Modifier.size(34.dp),
                            showWordmark = false,
                        )
                        Column {
                            Text("Customer onboarding")
                            Text(
                                text = draft.identity.fullName.ifBlank { "Draft ${draft.localId.take(8)}" },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = { DraftStatusPill(status = draft.status) },
            )
        },
        bottomBar = {
            Surface(shadowElevation = 8.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = onSaveDraft,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Save offline")
                    }
                    Button(
                        onClick = onSyncNow,
                        modifier = Modifier.weight(1f),
                        enabled = !state.isSyncing,
                    ) {
                        Text(if (state.isSyncing) "Syncing…" else "Sync now")
                    }
                }
            }
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Column(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    state.bannerMessage?.takeIf { it.isNotBlank() }?.let { banner ->
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                            ),
                        ) {
                            Text(
                                text = banner,
                                modifier = Modifier.padding(16.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                        }
                    }
                    state.error?.takeIf { it.isNotBlank() }?.let { error ->
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.errorContainer,
                            ),
                        ) {
                            Text(
                                text = error,
                                modifier = Modifier.padding(16.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                        }
                    }
                    draft.syncError?.takeIf { it.isNotBlank() }?.let { syncError ->
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.errorContainer,
                            ),
                        ) {
                            Text(
                                text = syncError,
                                modifier = Modifier.padding(16.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                        }
                    }
                    ProgressStepper(currentStep = draft.activeStep)
                }
            }

            item {
                ReadinessSummaryCard(
                    draft = draft,
                    parityState = parityState,
                    syncStepLabel = state.syncStepLabel,
                )
            }

            item {
                ScrollableTabRow(selectedTabIndex = draft.activeStep.ordinal) {
                    OnboardingStep.entries.forEach { step ->
                        Tab(
                            selected = draft.activeStep == step,
                            onClick = {
                                if (canSelectStep(step, parityState)) {
                                    onSetStep(step)
                                }
                            },
                            text = { Text(step.label) },
                        )
                    }
                }
            }

            when (draft.activeStep) {
                OnboardingStep.PROFILE -> item {
                    ProfileSection(
                        draft = draft,
                        parityState = parityState,
                        onUpdateDraft = onUpdateDraft,
                        onCaptureLocation = {
                            val permissionState = ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.ACCESS_FINE_LOCATION,
                            )
                            if (permissionState == PackageManager.PERMISSION_GRANTED) {
                                locationPermissionDenied = false
                                onCaptureLocation()
                            } else {
                                locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                            }
                        },
                        locationPermissionDenied = locationPermissionDenied,
                    )
                }

                OnboardingStep.KYC -> item {
                    KycSection(
                        draft = draft,
                        parityState = parityState,
                        hasCameraPermission = hasCameraPermission,
                        cameraPermissionDenied = cameraPermissionDenied,
                        onRequestCameraPermission = {
                            cameraPermissionDenied = false
                            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                        },
                        onCaptureVerifiedFace = onCaptureVerifiedFace,
                        onCaptureIdDocumentAndScan = onCaptureIdDocumentAndScan,
                        onAttachIdDocument = {
                            pendingAttachment = AttachmentTarget.CustomerId
                            attachmentLauncher.launch("image/*")
                        },
                        onRunOcr = onRunOcr,
                        onSetKycReviewNote = onSetKycReviewNote,
                        onCommitSignature = onCommitSignature,
                    )
                }

                OnboardingStep.GUARANTOR -> item {
                    // FinancialSection: full financial profile (income, expenses, loan request)
                    // followed by guarantor capture and collateral capture — all three match
                    // the backend createClientGuarantor + createClientCollateral contracts.
                    FinancialSection(
                        draft = draft,
                        onUpdateDraft = onUpdateDraft,
                        onAddGuarantor = onAddGuarantor,
                        onUpdateGuarantor = onUpdateGuarantor,
                        onRemoveGuarantor = onRemoveGuarantor,
                        onAttachGuarantorDoc = { index ->
                            pendingAttachment = AttachmentTarget.GuarantorDoc(index)
                            attachmentLauncher.launch("image/*")
                        },
                        onAddCollateral = onAddCollateral,
                        onUpdateCollateral = onUpdateCollateral,
                        onRemoveCollateral = onRemoveCollateral,
                        onAttachCollateralDoc = { index ->
                            pendingAttachment = AttachmentTarget.CollateralDoc(index)
                            attachmentLauncher.launch("image/*")
                        },
                    )
                }

                OnboardingStep.COLLATERAL -> item {
                    // Keep dedicated collateral section for focused document management
                    // once the officer wants to review or add items independently.
                    CollateralSection(
                        draft = draft,
                        parityState = parityState,
                        onAddCollateral = onAddCollateral,
                        onUpdateCollateral = onUpdateCollateral,
                        onRemoveCollateral = onRemoveCollateral,
                        onAttachCollateralDoc = { index ->
                            pendingAttachment = AttachmentTarget.CollateralDoc(index)
                            attachmentLauncher.launch("image/*")
                        },
                    )
                }

                OnboardingStep.FEE -> item {
                    Column(
                        modifier = Modifier.padding(horizontal = 20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // RiskSection: derived risk band + confidence score + officer checklist
                        // mirroring what the backend loan underwriting service produces.
                        RiskSection(
                            draft = draft,
                            onUpdateDraft = onUpdateDraft,
                        )
                        // FeeSection: fee capture, readiness snapshot, and final sign-off
                        // using ApprovalSection for the customer handoff + PIN entry portion.
                        FeeSection(
                            draft = draft,
                            parityState = parityState,
                            onUpdateDraft = onUpdateDraft,
                            onToggleHandoff = onToggleHandoff,
                            onSetCustomerPin = onSetCustomerPin,
                            onSetOfficerNotes = onSetOfficerNotes,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReadinessSummaryCard(
    draft: OnboardingDraft,
    parityState: OnboardingParityState,
    syncStepLabel: String?,
) {
    SectionCard(
        modifier = Modifier.padding(horizontal = 20.dp),
        title = "Readiness snapshot",
        subtitle = "Track the same step order, completeness checks, and backend status used by Afriserve on the web.",
    ) {
        draft.serverStatus?.let { serverStatus ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusPill(
                    label = "Stage ${toDisplayLabel(serverStatus.onboardingStatus)}",
                    backgroundColor = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                )
                StatusPill(
                    label = if (serverStatus.readyForLoanApplication) "Loan ready" else "Not ready",
                    backgroundColor = if (serverStatus.readyForLoanApplication) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    contentColor = if (serverStatus.readyForLoanApplication) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }

        RequirementLine(
            label = "Profile",
            complete = parityState.profileDone,
            supportingText = "Identity ${statusWord(parityState.profileDone)}, GPS ${statusWord(parityState.locationDone)}.",
        )
        RequirementLine(
            label = "KYC",
            complete = parityState.kycDone,
            supportingText = "Status ${parityState.kycStatusLabel}. Face ${statusWord(parityState.customerPhotoDone)}, ID ${statusWord(parityState.customerIdDone)}.",
        )
        RequirementLine(
            label = "Guarantor",
            complete = parityState.guarantorDone,
            supportingText = "${minOf(parityState.guarantorDocumentCount, MIN_REQUIRED_GUARANTOR_COUNT)}/$MIN_REQUIRED_GUARANTOR_COUNT required ID document ready.",
        )
        RequirementLine(
            label = "Collateral",
            complete = parityState.collateralDone,
            supportingText = "${minOf(parityState.collateralDocumentCount, MIN_REQUIRED_COLLATERAL_COUNT)}/$MIN_REQUIRED_COLLATERAL_COUNT required proofs ready.",
        )
        RequirementLine(
            label = "Fee",
            complete = parityState.feeDone,
            supportingText = parityState.feeStatusLabel,
        )

        Text(
            text = "Next action: ${parityState.nextStepLabel}",
            style = MaterialTheme.typography.titleMedium,
        )

        syncStepLabel?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = "Sync status: $it",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ProfileSection(
    draft: OnboardingDraft,
    parityState: OnboardingParityState,
    onUpdateDraft: ((OnboardingDraft) -> OnboardingDraft) -> Unit,
    onCaptureLocation: () -> Unit,
    locationPermissionDenied: Boolean,
) {
    val phoneError = OnboardingValidation.phoneFieldMessage(draft.identity.phone)
    val nationalIdError = OnboardingValidation.nationalIdFieldMessage(draft.identity.nationalId)
    val kraPinError = OnboardingValidation.kraPinFieldMessage(draft.identity.kraPin)
    val nextOfKinPhoneError = OnboardingValidation.phoneFieldMessage(draft.identity.nextOfKinPhone)

    Column(
        modifier = Modifier.padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionCard(
            title = "Borrower profile",
            subtitle = "Mirror the system-of-record client profile before KYC starts.",
        ) {
            LabeledField("Full name", draft.identity.fullName) { value ->
                onUpdateDraft { current -> current.copy(identity = current.identity.copy(fullName = value)) }
            }
            KenyanPhoneField(
                label = "Phone",
                value = draft.identity.phone,
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(identity = current.identity.copy(phone = value))
                    }
                },
                placeholder = "0712 345 678",
                supportingText = phoneError ?: "Kenyan mobile format. This stays required before KYC opens.",
                isError = phoneError != null,
            )
            LabeledField(
                label = "National ID",
                value = InputMasking.formatNationalId(draft.identity.nationalId),
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(
                            identity = current.identity.copy(
                                nationalId = value.filter(Char::isLetterOrDigit).uppercase(),
                            ),
                        )
                    }
                },
                placeholder = "12345678",
                supportingText = nationalIdError ?: "Optional, but it must match the government ID if entered.",
                isError = nationalIdError != null,
            )
            LabeledField(
                label = "KRA PIN",
                value = draft.identity.kraPin,
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(identity = current.identity.copy(kraPin = value.uppercase().take(11)))
                    }
                },
                placeholder = "A123456789B",
                supportingText = kraPinError ?: "Optional, using the backend format A123456789B.",
                isError = kraPinError != null,
            )
            LabeledField("Next of kin", draft.identity.nextOfKinName) { value ->
                onUpdateDraft { current -> current.copy(identity = current.identity.copy(nextOfKinName = value)) }
            }
            KenyanPhoneField(
                label = "Next of kin phone",
                value = draft.identity.nextOfKinPhone,
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(
                            identity = current.identity.copy(
                                nextOfKinPhone = value,
                            ),
                        )
                    }
                },
                placeholder = "0712 345 678",
                supportingText = nextOfKinPhoneError ?: "Optional Kenyan mobile number for follow-up contact.",
                isError = nextOfKinPhoneError != null,
            )
            LabeledField("Relationship", draft.identity.nextOfKinRelation) { value ->
                onUpdateDraft { current -> current.copy(identity = current.identity.copy(nextOfKinRelation = value)) }
            }
            LabeledField("Residential address", draft.identity.residentialAddress) { value ->
                onUpdateDraft { current -> current.copy(identity = current.identity.copy(residentialAddress = value)) }
            }
            LabeledField("Business type", draft.financials.businessType) { value ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(businessType = value)) }
            }
            LabeledField(
                label = "Years in business",
                value = draft.financials.businessYears?.toString().orEmpty(),
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(
                            financials = current.financials.copy(
                                businessYears = value.filter(Char::isDigit).toIntOrNull(),
                            ),
                        )
                    }
                },
                keyboardType = KeyboardType.Number,
            )
            LabeledField("Business location", draft.financials.businessLocation) { value ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(businessLocation = value)) }
            }
        }

        SectionCard(
            title = "Profile readiness",
            subtitle = "Identity details and the pinned field visit must be complete before KYC opens.",
        ) {
            RequirementLine(
                label = "Identity details",
                complete = draft.identity.fullName.isNotBlank() &&
                    phoneError == null &&
                    draft.identity.phone.isNotBlank() &&
                    draft.identity.residentialAddress.isNotBlank(),
                supportingText = "Full name, a valid Kenyan phone number, and residential address are required before identity verification.",
            )
            OutlinedButton(onClick = onCaptureLocation, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = if (draft.identity.locationCapturedAtIso.isNullOrBlank()) {
                        "Pin field location"
                    } else {
                        "Refresh field location"
                    },
                )
            }
            RequirementLine(
                label = "Pinned location",
                complete = parityState.locationDone,
                supportingText = if (parityState.locationDone) {
                    val accuracy = draft.identity.locationAccuracyMeters?.let { meters -> " +/- ${meters.toInt()}m" }.orEmpty()
                    "Pinned at ${formatCoordinate(draft.identity.latitude)}, ${formatCoordinate(draft.identity.longitude)}$accuracy"
                } else {
                    "Capture GPS before moving to KYC."
                },
            )
            if (locationPermissionDenied) {
                Text(
                    text = "Allow location permission to pin the field visit before syncing.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }

        SectionCard(
            title = "Field context",
            subtitle = "Optional lending context kept locally without changing the backend onboarding contract.",
        ) {
            CurrencyField("Monthly income", draft.financials.monthlyIncome) { amount ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(monthlyIncome = amount)) }
            }
            CurrencyField("Household expenses", draft.financials.householdExpenses) { amount ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(householdExpenses = amount)) }
            }
            CurrencyField("Requested loan amount", draft.financials.requestedLoanAmount) { amount ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(requestedLoanAmount = amount)) }
            }
            LabeledField(
                label = "Requested term (weeks)",
                value = draft.financials.requestedTermWeeks?.toString().orEmpty(),
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(
                            financials = current.financials.copy(
                                requestedTermWeeks = value.filter(Char::isDigit).toIntOrNull(),
                            ),
                        )
                    }
                },
                keyboardType = KeyboardType.Number,
            )
        }
    }
}

@Composable
private fun KycSection(
    draft: OnboardingDraft,
    parityState: OnboardingParityState,
    hasCameraPermission: Boolean,
    cameraPermissionDenied: Boolean,
    onRequestCameraPermission: () -> Unit,
    onCaptureVerifiedFace: (String, Double) -> Unit,
    onCaptureIdDocumentAndScan: (String) -> Unit,
    onAttachIdDocument: () -> Unit,
    onRunOcr: () -> Unit,
    onSetKycReviewNote: (String) -> Unit,
    onCommitSignature: (List<Offset>) -> Unit,
) {
    val facePhaseComplete = draft.kyc.livenessStatus == com.afriserve.loanofficer.domain.model.CaptureStatus.VERIFIED &&
        parityState.customerPhotoDone
    val idPhaseComplete = facePhaseComplete &&
        draft.kyc.documentOcrStatus == com.afriserve.loanofficer.domain.model.CaptureStatus.VERIFIED &&
        parityState.customerIdDone
    val signatureComplete = draft.kyc.signatureStatus == com.afriserve.loanofficer.domain.model.CaptureStatus.VERIFIED
    val localReviewStatus = draft.resolveLocalKycReviewStatus()

    Column(
        modifier = Modifier.padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionCard(
            title = "KYC workflow",
            subtitle = "The app now enforces a strict liveness-first path so identity evidence cannot be skipped out of order.",
        ) {
            RequirementLine(
                label = "Phase 1: Facial liveness",
                complete = facePhaseComplete,
                supportingText = if (facePhaseComplete) {
                    "Live challenge passed and the face portrait was saved automatically."
                } else {
                    "Front camera starts first. Portrait capture is blocked until liveness is verified."
                },
            )
            RequirementLine(
                label = "Phase 2: ID capture and scan",
                complete = idPhaseComplete,
                supportingText = if (idPhaseComplete) {
                    "ID card captured and scanned after the face phase completed."
                } else {
                    "The document step stays hidden until facial liveness is complete."
                },
            )
            RequirementLine(
                label = "Phase 3: Signature",
                complete = signatureComplete,
                supportingText = "The signature pad unlocks only after the ID scan is complete and ink is clipped to the pad bounds.",
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CaptureStatusPill(status = draft.kyc.livenessStatus)
                CaptureStatusPill(status = draft.kyc.documentOcrStatus)
                CaptureStatusPill(status = draft.kyc.signatureStatus)
            }
        }

        if (!hasCameraPermission) {
            SectionCard(
                title = "Camera access required",
                subtitle = "KYC capture cannot begin until the device camera is available.",
            ) {
                Text(
                    text = if (cameraPermissionDenied) {
                        "Camera permission was denied. Allow it to continue the liveness-first KYC sequence."
                    } else {
                        "Grant camera access to start the face verification studio."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(onClick = onRequestCameraPermission, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.CameraAlt, contentDescription = null)
                    Text("Allow camera access", modifier = Modifier.padding(start = 8.dp))
                }
            }
        } else if (!facePhaseComplete) {
            FaceLivenessCaptureStudio(
                onVerifiedCapture = onCaptureVerifiedFace,
            )
        }

        if (hasCameraPermission && facePhaseComplete && !idPhaseComplete) {
            DocumentAutoScanStudio(
                onDocumentCaptured = onCaptureIdDocumentAndScan,
                onManualAttachFallback = onAttachIdDocument,
            )
        } else if (idPhaseComplete) {
            SectionCard(
                title = "ID scan complete",
                subtitle = "The ID card was captured after the face phase and scanned automatically.",
            ) {
                draft.kyc.ocrExtractedIdNumber.takeIf { it.isNotBlank() }?.let { extractedId ->
                    Text(
                        text = "Extracted ID candidate: $extractedId",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = onAttachIdDocument, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Outlined.Badge, contentDescription = null)
                        Text("Retake ID", modifier = Modifier.padding(start = 8.dp))
                    }
                    OutlinedButton(onClick = onRunOcr, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Outlined.Security, contentDescription = null)
                        Text("Run OCR again", modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        }

        if (idPhaseComplete) {
            SectionCard(
                title = "Customer signature",
                subtitle = "Consent is the final KYC action and is confined to the signature canvas.",
            ) {
                SignaturePad(
                    hasSavedSignature = draft.kyc.signatureSvgPath.isNotBlank() && signatureComplete,
                    onSignatureChanged = onCommitSignature,
                )
            }
        }

        SectionCard(
            title = "KYC outcome",
            subtitle = "Review state is derived from the evidence chain so later steps cannot bypass missing identity checks.",
        ) {
            RequirementLine(
                label = "Effective status",
                complete = localReviewStatus == KycReviewStatus.VERIFIED && draft.hasStrictKycEvidence(),
                supportingText = "Current local status: ${localReviewStatus.label}.",
            )
            LabeledField(
                label = "Review note",
                value = draft.kyc.reviewNote,
                onValueChange = onSetKycReviewNote,
                minLines = 3,
            )
        }
    }
}

@Composable
private fun GuarantorSection(
    draft: OnboardingDraft,
    parityState: OnboardingParityState,
    onAddGuarantor: () -> Unit,
    onUpdateGuarantor: (Int, GuarantorDraft) -> Unit,
    onRemoveGuarantor: (Int) -> Unit,
    onAttachGuarantorDoc: (Int) -> Unit,
) {
    Column(
        modifier = Modifier.padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionCard(
            title = "Guarantor coverage",
            subtitle = "At least one guarantor with an ID document is required before collateral.",
            action = {
                OutlinedButton(onClick = onAddGuarantor) {
                    Icon(Icons.Outlined.PersonAddAlt1, contentDescription = null)
                    Text("Add guarantor", modifier = Modifier.padding(start = 8.dp))
                }
            },
        ) {
            RequirementLine(
                label = "Linked guarantors",
                complete = parityState.guarantorCount >= MIN_REQUIRED_GUARANTOR_COUNT,
                supportingText = "${minOf(parityState.guarantorCount, MIN_REQUIRED_GUARANTOR_COUNT)}/$MIN_REQUIRED_GUARANTOR_COUNT required guarantor captured.",
            )
            RequirementLine(
                label = "ID documents",
                complete = parityState.guarantorDone,
                supportingText = "${minOf(parityState.guarantorDocumentCount, MIN_REQUIRED_GUARANTOR_COUNT)}/$MIN_REQUIRED_GUARANTOR_COUNT required document ready.",
            )

            if (draft.guarantors.isEmpty()) {
                Text(
                    text = "No guarantors added yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            draft.guarantors.forEachIndexed { index, guarantor ->
                GuarantorCard(
                    guarantor = guarantor,
                    onChanged = { onUpdateGuarantor(index, it) },
                    onAttachDocument = { onAttachGuarantorDoc(index) },
                    onRemove = { onRemoveGuarantor(index) },
                )
            }
        }
    }
}

@Composable
private fun CollateralSection(
    draft: OnboardingDraft,
    parityState: OnboardingParityState,
    onAddCollateral: () -> Unit,
    onUpdateCollateral: (Int, CollateralDraft) -> Unit,
    onRemoveCollateral: (Int) -> Unit,
    onAttachCollateralDoc: (Int) -> Unit,
) {
    Column(
        modifier = Modifier.padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionCard(
            title = "Collateral register",
            subtitle = "Use backend-aligned asset values. Any 2 collateral records with proof are required; extras stay optional.",
            action = {
                OutlinedButton(onClick = onAddCollateral) {
                    Icon(Icons.Outlined.CloudUpload, contentDescription = null)
                    Text("Add collateral", modifier = Modifier.padding(start = 8.dp))
                }
            },
        ) {
            RequirementLine(
                label = "Collateral items",
                complete = parityState.collateralCount >= MIN_REQUIRED_COLLATERAL_COUNT,
                supportingText = "${minOf(parityState.collateralCount, MIN_REQUIRED_COLLATERAL_COUNT)}/$MIN_REQUIRED_COLLATERAL_COUNT required assets captured.",
            )
            RequirementLine(
                label = "Collateral documents",
                complete = parityState.collateralDone,
                supportingText = "${minOf(parityState.collateralDocumentCount, MIN_REQUIRED_COLLATERAL_COUNT)}/$MIN_REQUIRED_COLLATERAL_COUNT required proofs ready.",
            )

            if (draft.collaterals.isEmpty()) {
                Text(
                    text = "No collateral attached yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            draft.collaterals.forEachIndexed { index, collateral ->
                CollateralCard(
                    collateral = collateral,
                    onChanged = { onUpdateCollateral(index, it) },
                    onAttachDocument = { onAttachCollateralDoc(index) },
                    onRemove = { onRemoveCollateral(index) },
                )
            }
        }
    }
}

@Composable
private fun FeeSection(
    draft: OnboardingDraft,
    parityState: OnboardingParityState,
    onUpdateDraft: ((OnboardingDraft) -> OnboardingDraft) -> Unit,
    onToggleHandoff: (Boolean) -> Unit,
    onSetCustomerPin: (String) -> Unit,
    onSetOfficerNotes: (String) -> Unit,
) {
    Column(
        modifier = Modifier.padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionCard(
            title = "Fee capture",
            subtitle = "Mirror the last Afriserve onboarding action before the borrower is loan-ready.",
        ) {
            RequirementLine(
                label = "Fee status",
                complete = parityState.feeDone,
                supportingText = parityState.feeStatusLabel,
            )
            CurrencyField("Onboarding fee", draft.financials.feePaymentAmount) { amount ->
                onUpdateDraft { current ->
                    current.copy(
                        financials = current.financials.copy(
                            feePaymentAmount = amount,
                            feeSubmittedAtIso = null,
                        ),
                    )
                }
            }
            LabeledField("Payment reference", draft.financials.feePaymentReference) { value ->
                onUpdateDraft { current ->
                    current.copy(
                        financials = current.financials.copy(
                            feePaymentReference = value,
                            feeSubmittedAtIso = null,
                        ),
                    )
                }
            }
            DateField(
                label = "Paid at (YYYY-MM-DD)",
                stateKey = "fee-paid-at",
                value = dateInputValue(draft.financials.feePaidAtIso),
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(
                            financials = current.financials.copy(
                                feePaidAtIso = isoDateOrNull(value),
                                feeSubmittedAtIso = null,
                            ),
                        )
                    }
                },
            )
        }

        SectionCard(
            title = "Final readiness",
            subtitle = "Use the same completeness checks the web workflow exposes before creating a loan.",
        ) {
            RequirementLine("Profile complete", parityState.profileDone, "Identity details and the pinned location are required.")
            RequirementLine("KYC verified", parityState.kycDone, "Current KYC status is ${parityState.kycStatusLabel}. Face, ID, and signature must all be complete.")
            RequirementLine("Guarantor complete", parityState.guarantorDone, "${minOf(parityState.guarantorDocumentCount, MIN_REQUIRED_GUARANTOR_COUNT)}/$MIN_REQUIRED_GUARANTOR_COUNT required document ready.")
            RequirementLine("Collateral complete", parityState.collateralDone, "${minOf(parityState.collateralDocumentCount, MIN_REQUIRED_COLLATERAL_COUNT)}/$MIN_REQUIRED_COLLATERAL_COUNT required proofs ready.")
            RequirementLine("Fee complete", parityState.feeDone, parityState.feeStatusLabel)
            Text(
                text = if (parityState.serverReady || parityState.overallReady) {
                    "Ready for loan application review."
                } else {
                    "Still waiting on: ${parityState.nextStepLabel}"
                },
                style = MaterialTheme.typography.titleMedium,
                color = if (parityState.serverReady || parityState.overallReady) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
            )
        }

        SectionCard(
            title = "Customer handoff",
            subtitle = "Turn the device to the customer only for private actions like PIN entry or consent.",
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Enable handoff mode",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = "Hides officer-only guidance and emphasizes privacy-sensitive input.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = draft.approval.handoffModeEnabled,
                    onCheckedChange = onToggleHandoff,
                )
            }

            if (draft.approval.handoffModeEnabled) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                    ),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            text = "Customer view",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onTertiaryContainer,
                        )
                        Text(
                            text = "Ask the customer to confirm their four-digit onboarding PIN and review the capture summary.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onTertiaryContainer,
                        )
                        LabeledField(
                            label = "Customer PIN",
                            value = draft.approval.customerPin,
                            onValueChange = onSetCustomerPin,
                            keyboardType = KeyboardType.NumberPassword,
                        )
                    }
                }
            } else {
                Text(
                    text = "Officer mode remains active until you hand the device over.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        SectionCard(
            title = "Officer sign-off",
            subtitle = "Leave any final notes before syncing the onboarding package.",
        ) {
            LabeledField(
                label = "Officer notes",
                value = draft.approval.officerNotes,
                onValueChange = onSetOfficerNotes,
                minLines = 4,
            )
            draft.risk.notes.takeIf { it.isNotBlank() }?.let { riskNotes ->
                Text(
                    text = riskNotes,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun IdentitySection(
    draft: OnboardingDraft,
    onUpdateDraft: ((OnboardingDraft) -> OnboardingDraft) -> Unit,
    onAttachCustomerPhoto: () -> Unit,
    onAttachIdDocument: () -> Unit,
    onCaptureLocation: () -> Unit,
    locationPermissionDenied: Boolean,
    onRunOcr: () -> Unit,
    blinkConfirmed: Boolean,
    smileConfirmed: Boolean,
    onBlinkChanged: (Boolean) -> Unit,
    onSmileChanged: (Boolean) -> Unit,
    onRunLiveness: () -> Unit,
    onCommitSignature: (List<Offset>) -> Unit,
) {
    Column(
        modifier = Modifier.padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionCard(
            title = "Identity and contact",
            subtitle = "Capture the customer profile with real-time masking and branch-safe formatting.",
        ) {
            LabeledField("Full name", draft.identity.fullName) { value ->
                onUpdateDraft { current -> current.copy(identity = current.identity.copy(fullName = value)) }
            }
            KenyanPhoneField(
                label = "Phone",
                value = draft.identity.phone,
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(identity = current.identity.copy(phone = value))
                    }
                },
            )
            LabeledField(
                label = "National ID",
                value = InputMasking.formatNationalId(draft.identity.nationalId),
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(
                            identity = current.identity.copy(
                                nationalId = value.filter(Char::isLetterOrDigit).uppercase(),
                            ),
                        )
                    }
                },
            )
            LabeledField("KRA PIN", draft.identity.kraPin) { value ->
                onUpdateDraft { current -> current.copy(identity = current.identity.copy(kraPin = value.uppercase())) }
            }
            LabeledField("Next of kin", draft.identity.nextOfKinName) { value ->
                onUpdateDraft { current -> current.copy(identity = current.identity.copy(nextOfKinName = value)) }
            }
            KenyanPhoneField(
                label = "Next of kin phone",
                value = draft.identity.nextOfKinPhone,
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(
                            identity = current.identity.copy(
                                nextOfKinPhone = value,
                            ),
                        )
                    }
                },
            )
            LabeledField("Relationship", draft.identity.nextOfKinRelation) { value ->
                onUpdateDraft { current -> current.copy(identity = current.identity.copy(nextOfKinRelation = value)) }
            }
            LabeledField("Residential address", draft.identity.residentialAddress) { value ->
                onUpdateDraft { current -> current.copy(identity = current.identity.copy(residentialAddress = value)) }
            }
            OutlinedButton(onClick = onCaptureLocation, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = if (draft.identity.locationCapturedAtIso.isNullOrBlank()) {
                        "Pin field location"
                    } else {
                        "Refresh field location"
                    },
                )
            }
            draft.identity.locationCapturedAtIso?.let {
                val accuracy = draft.identity.locationAccuracyMeters?.let { meters ->
                    " ±${meters.toInt()}m"
                }.orEmpty()
                Text(
                    text = "Location pinned at ${formatCoordinate(draft.identity.latitude)}, ${formatCoordinate(draft.identity.longitude)}$accuracy",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (locationPermissionDenied) {
                Text(
                    text = "Allow location permission to pin the field visit before syncing.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }

        SectionCard(
            title = "KYC studio",
            subtitle = "Officer-led capture with customer handoff only where privacy matters.",
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onAttachCustomerPhoto, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Outlined.CameraAlt, contentDescription = null)
                    Text("Portrait", modifier = Modifier.padding(start = 8.dp))
                }
                Button(onClick = onAttachIdDocument, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Outlined.Badge, contentDescription = null)
                    Text("ID scan", modifier = Modifier.padding(start = 8.dp))
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CaptureStatusPill(status = draft.kyc.documentOcrStatus)
                CaptureStatusPill(status = draft.kyc.livenessStatus)
                CaptureStatusPill(status = draft.kyc.signatureStatus)
            }

            OutlinedButton(onClick = onRunOcr, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.Security, contentDescription = null)
                Text("Run OCR on uploaded ID", modifier = Modifier.padding(start = 8.dp))
            }

            draft.kyc.ocrExtractedIdNumber.takeIf { it.isNotBlank() }?.let { extractedId ->
                Text(
                    text = "Extracted ID candidate: $extractedId",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Blink confirmed")
                Checkbox(checked = blinkConfirmed, onCheckedChange = onBlinkChanged)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Smile confirmed")
                Checkbox(checked = smileConfirmed, onCheckedChange = onSmileChanged)
            }

            Button(onClick = onRunLiveness, modifier = Modifier.fillMaxWidth()) {
                Text("Run liveness check")
            }

            draft.kyc.faceMatchScore?.let { score ->
                Text(
                    text = "Face match score: ${(score * 100).toInt()}%",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Text(
                text = "Customer signature",
                style = MaterialTheme.typography.titleMedium,
            )
            SignaturePad(onSignatureChanged = onCommitSignature)
        }
    }
}

@Composable
private fun FinancialSection(
    draft: OnboardingDraft,
    onUpdateDraft: ((OnboardingDraft) -> OnboardingDraft) -> Unit,
    onAddGuarantor: () -> Unit,
    onUpdateGuarantor: (Int, GuarantorDraft) -> Unit,
    onRemoveGuarantor: (Int) -> Unit,
    onAttachGuarantorDoc: (Int) -> Unit,
    onAddCollateral: () -> Unit,
    onUpdateCollateral: (Int, CollateralDraft) -> Unit,
    onRemoveCollateral: (Int) -> Unit,
    onAttachCollateralDoc: (Int) -> Unit,
) {
    Column(
        modifier = Modifier.padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionCard(
            title = "Financial profile",
            subtitle = "Build an application-ready profile with masked amounts and support documentation.",
        ) {
            LabeledField("Business type", draft.financials.businessType) { value ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(businessType = value)) }
            }
            LabeledField(
                label = "Years in business",
                value = draft.financials.businessYears?.toString().orEmpty(),
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(financials = current.financials.copy(businessYears = value.filter(Char::isDigit).toIntOrNull()))
                    }
                },
                keyboardType = KeyboardType.Number,
            )
            LabeledField("Business location", draft.financials.businessLocation) { value ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(businessLocation = value)) }
            }
            CurrencyField("Monthly income", draft.financials.monthlyIncome) { amount ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(monthlyIncome = amount)) }
            }
            CurrencyField("Household expenses", draft.financials.householdExpenses) { amount ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(householdExpenses = amount)) }
            }
            CurrencyField("Requested loan amount", draft.financials.requestedLoanAmount) { amount ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(requestedLoanAmount = amount)) }
            }
            LabeledField(
                label = "Requested term (weeks)",
                value = draft.financials.requestedTermWeeks?.toString().orEmpty(),
                onValueChange = { value ->
                    onUpdateDraft { current ->
                        current.copy(financials = current.financials.copy(requestedTermWeeks = value.filter(Char::isDigit).toIntOrNull()))
                    }
                },
                keyboardType = KeyboardType.Number,
            )
            CurrencyField("Onboarding fee", draft.financials.feePaymentAmount) { amount ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(feePaymentAmount = amount)) }
            }
            LabeledField("Payment reference", draft.financials.feePaymentReference) { value ->
                onUpdateDraft { current -> current.copy(financials = current.financials.copy(feePaymentReference = value)) }
            }
        }

        SectionCard(
            title = "Guarantors",
            subtitle = "Add supporting parties and attach their ID evidence for remote review.",
            action = {
                OutlinedButton(onClick = onAddGuarantor) {
                    Icon(Icons.Outlined.PersonAddAlt1, contentDescription = null)
                    Text("Add guarantor", modifier = Modifier.padding(start = 8.dp))
                }
            },
        ) {
            if (draft.guarantors.isEmpty()) {
                Text(
                    text = "No guarantors added yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            draft.guarantors.forEachIndexed { index, guarantor ->
                GuarantorCard(
                    guarantor = guarantor,
                    onChanged = { onUpdateGuarantor(index, it) },
                    onAttachDocument = { onAttachGuarantorDoc(index) },
                    onRemove = { onRemoveGuarantor(index) },
                )
            }
        }

        SectionCard(
            title = "Collateral",
            subtitle = "Track assets that support the application and keep evidentiary documents attached.",
            action = {
                OutlinedButton(onClick = onAddCollateral) {
                    Icon(Icons.Outlined.CloudUpload, contentDescription = null)
                    Text("Add collateral", modifier = Modifier.padding(start = 8.dp))
                }
            },
        ) {
            if (draft.collaterals.isEmpty()) {
                Text(
                    text = "No collateral attached yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            draft.collaterals.forEachIndexed { index, collateral ->
                CollateralCard(
                    collateral = collateral,
                    onChanged = { onUpdateCollateral(index, it) },
                    onAttachDocument = { onAttachCollateralDoc(index) },
                    onRemove = { onRemoveCollateral(index) },
                )
            }
        }
    }
}

@Composable
private fun RiskSection(
    draft: OnboardingDraft,
    onUpdateDraft: ((OnboardingDraft) -> OnboardingDraft) -> Unit,
) {
    // Risk band + confidence score mirror what the backend loan underwriting
    // service calculates after the client record is synced. Captured locally
    // so the officer can annotate the assessment before the file leaves the field.
    SectionCard(
        modifier = Modifier.padding(horizontal = 20.dp),
        title = "Risk assessment",
        subtitle = "Field risk summary — maps to the loan underwriting profile the " +
            "backend generates once the onboarding record is complete.",
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusPill(
                label = "Risk band: ${draft.risk.riskBand}",
                backgroundColor = when (draft.risk.riskBand.lowercase()) {
                    "low" -> MaterialTheme.colorScheme.secondaryContainer
                    "high" -> MaterialTheme.colorScheme.errorContainer
                    else -> MaterialTheme.colorScheme.tertiaryContainer
                },
                contentColor = when (draft.risk.riskBand.lowercase()) {
                    "low" -> MaterialTheme.colorScheme.onSecondaryContainer
                    "high" -> MaterialTheme.colorScheme.onErrorContainer
                    else -> MaterialTheme.colorScheme.onTertiaryContainer
                },
            )
            StatusPill(
                label = "${draft.risk.confidenceScore}% confidence",
                backgroundColor = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // Checklist mirrors the five conditions the backend requires before
        // readyForLoanApplication becomes true.
        draft.risk.checklist.forEach { item ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    text = "✔",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = item,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        LabeledField(
            label = "Officer risk notes (optional)",
            value = draft.risk.notes,
            onValueChange = { value ->
                onUpdateDraft { current ->
                    current.copy(risk = current.risk.copy(notes = value))
                }
            },
            minLines = 3,
        )
    }
}

@Composable
private fun ApprovalSection(
    draft: OnboardingDraft,
    onToggleHandoff: (Boolean) -> Unit,
    onSetCustomerPin: (String) -> Unit,
    onSetOfficerNotes: (String) -> Unit,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // ── Customer handoff ──────────────────────────────────────────────
        // The officer hands the device to the customer for private actions:
        // PIN confirmation and consent capture. Mirrors the web system’s
        // customer-facing confirmation page before record submission.
        SectionCard(
            title = "Customer handoff",
            subtitle = "Hand the device to the customer for private actions — " +
                "PIN entry and consent review. Officer-only content is hidden.",
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Enable handoff mode",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = "Hides officer-only fields. Toggle back when the customer " +
                            "returns the device.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = draft.approval.handoffModeEnabled,
                    onCheckedChange = onToggleHandoff,
                )
            }

            if (draft.approval.handoffModeEnabled) {
                // Customer-facing view: only the PIN field is shown.
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                    ),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = "Customer confirmation",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onTertiaryContainer,
                        )
                        Text(
                            text = "Please enter your four-digit onboarding PIN to confirm " +
                                "your details have been recorded correctly.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onTertiaryContainer,
                        )
                        LabeledField(
                            label = "4-digit PIN",
                            value = draft.approval.customerPin,
                            onValueChange = onSetCustomerPin,
                            keyboardType = KeyboardType.NumberPassword,
                        )
                    }
                }
            } else {
                Text(
                    text = "Officer mode active. Toggle handoff mode when ready to " +
                        "present the device to the customer.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // ── Officer sign-off ─────────────────────────────────────────────
        // Final officer notes are stored in approval.officerNotes in the draft
        // and included in the sync payload for the backend audit trail.
        SectionCard(
            title = "Officer sign-off",
            subtitle = "Record any field observations, risk flags, or escalation notes " +
                "before syncing the complete onboarding package.",
        ) {
            LabeledField(
                label = "Officer notes",
                value = draft.approval.officerNotes,
                onValueChange = onSetOfficerNotes,
                minLines = 4,
            )

            // Surface risk notes captured in RiskSection so the officer
            // can review them alongside the sign-off.
            draft.risk.notes.takeIf { it.isNotBlank() }?.let { riskNotes ->
                Text(
                    text = "Risk notes on file: $riskNotes",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Text(
                text = if (draft.approval.readyForSubmission) {
                    "✓ Ready for submission."
                } else {
                    "Complete all steps above before submitting."
                },
                style = MaterialTheme.typography.titleMedium,
                color = if (draft.approval.readyForSubmission) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

@Composable
private fun GuarantorCard(
    guarantor: GuarantorDraft,
    onChanged: (GuarantorDraft) -> Unit,
    onAttachDocument: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Guarantor", style = MaterialTheme.typography.titleMedium)
                OutlinedButton(onClick = onRemove) { Text("Remove") }
            }
            LabeledField("Full name", guarantor.fullName) { onChanged(guarantor.copy(fullName = it)) }
            KenyanPhoneField(
                label = "Phone",
                value = guarantor.phone,
                onValueChange = { onChanged(guarantor.copy(phone = it)) },
            )
            LabeledField("National ID", guarantor.nationalId) { onChanged(guarantor.copy(nationalId = it.uppercase())) }
            LabeledField("Address", guarantor.physicalAddress) { onChanged(guarantor.copy(physicalAddress = it)) }
            LabeledField("Occupation", guarantor.occupation) { onChanged(guarantor.copy(occupation = it)) }
            LabeledField("Employer", guarantor.employerName) { onChanged(guarantor.copy(employerName = it)) }
            CurrencyField("Monthly income", guarantor.monthlyIncome) { onChanged(guarantor.copy(monthlyIncome = it)) }
            CurrencyField("Guarantee amount", guarantor.guaranteeAmount) { onChanged(guarantor.copy(guaranteeAmount = it)) }
            RequirementLine(
                label = "ID document",
                complete = guarantorHasDocument(guarantor),
                supportingText = documentStateLabel(
                    localUri = guarantor.idDocumentLocalUri,
                    remoteUrl = guarantor.idDocumentRemoteUrl,
                    missingText = "Upload the guarantor ID before collateral.",
                ),
            )
            OutlinedButton(onClick = onAttachDocument) { Text("Attach ID document") }
        }
    }
}

@Composable
private fun CollateralCard(
    collateral: CollateralDraft,
    onChanged: (CollateralDraft) -> Unit,
    onAttachDocument: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Collateral", style = MaterialTheme.typography.titleMedium)
                OutlinedButton(onClick = onRemove) { Text("Remove") }
            }
            ChoiceChipGroup(
                label = "Asset type",
                options = COLLATERAL_ASSET_OPTIONS,
                selectedValue = normalizedAssetChoice(collateral.assetType),
                onSelected = { selected -> onChanged(collateral.copy(assetType = selected)) },
            )
            LabeledField("Description", collateral.description) { onChanged(collateral.copy(description = it)) }
            CurrencyField("Estimated value", collateral.estimatedValue) { onChanged(collateral.copy(estimatedValue = it)) }
            ChoiceChipGroup(
                label = "Ownership type",
                options = COLLATERAL_OWNERSHIP_OPTIONS,
                selectedValue = normalizedOwnershipChoice(collateral.ownershipType),
                onSelected = { selected -> onChanged(collateral.copy(ownershipType = selected)) },
            )
            LabeledField("Owner name", collateral.ownerName) { onChanged(collateral.copy(ownerName = it)) }
            LabeledField("Owner national ID", collateral.ownerNationalId) { onChanged(collateral.copy(ownerNationalId = it)) }
            LabeledField("Registration number", collateral.registrationNumber) { onChanged(collateral.copy(registrationNumber = it)) }
            LabeledField("Logbook number", collateral.logbookNumber) { onChanged(collateral.copy(logbookNumber = it)) }
            LabeledField("Title number", collateral.titleNumber) { onChanged(collateral.copy(titleNumber = it)) }
            LabeledField("Location details", collateral.locationDetails) { onChanged(collateral.copy(locationDetails = it)) }
            DateField(
                label = "Valuation date (YYYY-MM-DD)",
                stateKey = collateral.draftId,
                value = dateInputValue(collateral.valuationDateIso),
                onValueChange = { value ->
                    onChanged(collateral.copy(valuationDateIso = isoDateOrNull(value)))
                },
            )
            RequirementLine(
                label = "Collateral document",
                complete = collateralHasDocument(collateral),
                supportingText = documentStateLabel(
                    localUri = collateral.documentLocalUri,
                    remoteUrl = collateral.documentRemoteUrl,
                    missingText = "Upload the collateral proof before the fee step.",
                ),
            )
            OutlinedButton(onClick = onAttachDocument) { Text("Attach collateral proof") }
        }
    }
}

private data class OnboardingParityState(
    val customerPhotoDone: Boolean,
    val customerIdDone: Boolean,
    val locationDone: Boolean,
    val profileDone: Boolean,
    val kycDone: Boolean,
    val guarantorCount: Int,
    val guarantorDocumentCount: Int,
    val guarantorDone: Boolean,
    val collateralCount: Int,
    val collateralDocumentCount: Int,
    val collateralDone: Boolean,
    val feeDone: Boolean,
    val feeStatusLabel: String,
    val kycStatusLabel: String,
    val nextStepLabel: String,
    val overallReady: Boolean,
    val serverReady: Boolean,
)

private data class ChipOption(
    val value: String,
    val label: String,
)

private val COLLATERAL_ASSET_OPTIONS = listOf(
    ChipOption("chattel", "Chattel"),
    ChipOption("vehicle", "Vehicle"),
    ChipOption("land", "Land"),
    ChipOption("equipment", "Equipment"),
    ChipOption("machinery", "Machinery"),
    ChipOption("inventory", "Inventory"),
    ChipOption("livestock", "Livestock"),
    ChipOption("savings", "Savings"),
)

private val COLLATERAL_OWNERSHIP_OPTIONS = listOf(
    ChipOption("client", "Client"),
    ChipOption("guarantor", "Guarantor"),
    ChipOption("third_party", "Third party"),
)

@Composable
private fun RequirementLine(
    label: String,
    complete: Boolean,
    supportingText: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.titleMedium,
            )
            StatusPill(
                label = if (complete) "Complete" else "Incomplete",
                backgroundColor = if (complete) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
                contentColor = if (complete) {
                    MaterialTheme.colorScheme.onPrimaryContainer
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
        Text(
            text = supportingText,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ChoiceChipGroup(
    label: String,
    options: List<ChipOption>,
    selectedValue: String,
    onSelected: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
        )
        options.chunked(2).forEach { rowOptions ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                rowOptions.forEach { option ->
                    FilterChip(
                        selected = option.value == selectedValue,
                        onClick = { onSelected(option.value) },
                        label = { Text(option.label) },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (rowOptions.size == 1) {
                    Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun DateField(
    label: String,
    stateKey: Any = label,
    value: String,
    supportingText: String? = null,
    isError: Boolean = false,
    onValueChange: (String) -> Unit,
) {
    var rawText by remember(stateKey) { mutableStateOf(value) }
    val completeDatePattern = remember { Regex("\\d{4}-\\d{2}-\\d{2}") }

    LaunchedEffect(value) {
        when {
            value.length == 10 && value != rawText -> rawText = value
            value.isBlank() && (rawText.isBlank() || completeDatePattern.matches(rawText)) -> rawText = ""
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        OutlinedTextField(
            value = rawText,
            onValueChange = { input ->
                val sanitized = input
                    .filter { it.isDigit() || it == '-' }
                    .take(10)
                rawText = sanitized
                onValueChange(sanitized)
            },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("YYYY-MM-DD") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
            isError = isError,
        )
        supportingText?.let { helperText ->
            Text(
                text = helperText,
                style = MaterialTheme.typography.bodySmall,
                color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SectionCard(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    action: @Composable (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(text = title, style = MaterialTheme.typography.titleLarge)
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                action?.invoke()
            }
            content()
        }
    }
}

@Composable
private fun LabeledField(
    label: String,
    value: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    minLines: Int = 1,
    placeholder: String? = null,
    supportingText: String? = null,
    isError: Boolean = false,
    onValueChange: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = if (placeholder != null) {
                { Text(placeholder) }
            } else {
                null
            },
            singleLine = minLines == 1,
            minLines = minLines,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            isError = isError,
        )
        supportingText?.let { helperText ->
            Text(
                text = helperText,
                style = MaterialTheme.typography.bodySmall,
                color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun KenyanPhoneField(
    label: String,
    value: String,
    placeholder: String? = null,
    supportingText: String? = null,
    isError: Boolean = false,
    onValueChange: (String) -> Unit,
) {
    val externalDigits = InputMasking.sanitizeKenyanPhone(value)
    val formattedExternal = InputMasking.formatKenyanPhone(externalDigits)
    var fieldValue by remember {
        mutableStateOf(
            TextFieldValue(
                text = formattedExternal,
                selection = TextRange(formattedExternal.length),
            ),
        )
    }

    LaunchedEffect(externalDigits) {
        val currentDigits = InputMasking.sanitizeKenyanPhone(fieldValue.text)
        if (currentDigits != externalDigits) {
            val selection = formattedPhoneSelectionIndex(
                formatted = formattedExternal,
                digitsBeforeCursor = externalDigits.length,
            )
            fieldValue = TextFieldValue(
                text = formattedExternal,
                selection = TextRange(selection),
            )
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        OutlinedTextField(
            value = fieldValue,
            onValueChange = { updatedValue ->
                val sanitizedDigits = InputMasking.sanitizeKenyanPhone(updatedValue.text)
                val formattedDigits = InputMasking.formatKenyanPhone(sanitizedDigits)
                val digitsBeforeCursor = updatedValue.text
                    .take(updatedValue.selection.end)
                    .count(Char::isDigit)
                    .coerceAtMost(sanitizedDigits.length)

                fieldValue = TextFieldValue(
                    text = formattedDigits,
                    selection = TextRange(
                        formattedPhoneSelectionIndex(
                            formatted = formattedDigits,
                            digitsBeforeCursor = digitsBeforeCursor,
                        ),
                    ),
                )
                onValueChange(sanitizedDigits)
            },
            modifier = Modifier.fillMaxWidth(),
            placeholder = if (placeholder != null) {
                { Text(placeholder) }
            } else {
                null
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            isError = isError,
        )
        supportingText?.let { helperText ->
            Text(
                text = helperText,
                style = MaterialTheme.typography.bodySmall,
                color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun CurrencyField(
    label: String,
    amount: Double?,
    supportingText: String? = null,
    isError: Boolean = false,
    onAmountChanged: (Double?) -> Unit,
) {
    // Keep a local raw string so the user can type decimals freely.
    // Only parse when the user stops typing — no lossy Long conversion.
    var rawText by remember(amount) {
        mutableStateOf(amount?.let { if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString() }.orEmpty())
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        OutlinedTextField(
            value = rawText,
            onValueChange = { input ->
                // Allow digits, a single leading minus, and at most one decimal point.
                val cleaned = input.filter { it.isDigit() || it == '.' }
                    .let { s ->
                        val dotIndex = s.indexOf('.')
                        if (dotIndex >= 0) s.substring(0, dotIndex + 1) + s.substring(dotIndex + 1).filter(Char::isDigit)
                        else s
                    }
                rawText = cleaned
                onAmountChanged(cleaned.toDoubleOrNull())
            },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("0") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            prefix = { Text("KES ") },
            isError = isError,
        )
        supportingText?.let { helperText ->
            Text(
                text = helperText,
                style = MaterialTheme.typography.bodySmall,
                color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun deriveParityState(draft: OnboardingDraft): OnboardingParityState {
    val serverStatus = draft.serverStatus
    val phoneValid = draft.identity.phone.isNotBlank() && OnboardingValidation.phoneFieldMessage(draft.identity.phone) == null
    val customerPhotoDone = !draft.identity.photoRemoteUrl.isNullOrBlank() || !draft.identity.capturedPhotoUri.isNullOrBlank() ||
        serverStatus?.checklist?.profilePhotoAdded == true
    val customerIdDone = !draft.identity.idDocumentRemoteUrl.isNullOrBlank() || !draft.identity.capturedIdDocumentUri.isNullOrBlank()
    val locationDone = (draft.identity.latitude != null && draft.identity.longitude != null) ||
        serverStatus?.checklist?.locationCaptured == true ||
        serverStatus?.location?.captured == true
    val profileDone = draft.identity.fullName.isNotBlank() &&
        phoneValid &&
        draft.identity.residentialAddress.isNotBlank() &&
        locationDone

    val localKycStatus = draft.resolveLocalKycReviewStatus().apiValue
    val effectiveKycStatus = serverStatus?.kycStatus?.takeIf { it.isNotBlank() } ?: localKycStatus
    val kycDone = draft.hasStrictKycEvidence() &&
        effectiveKycStatus.equals(KycReviewStatus.VERIFIED.apiValue, ignoreCase = true)

    val localGuarantors = draft.startedGuarantors()
    val localGuarantorCount = localGuarantors.size
    val localGuarantorDocumentCount = localGuarantors.count(::guarantorHasDocument)
    val guarantorCount = maxOf(localGuarantorCount, serverStatus?.counts?.guarantors ?: 0)
    val guarantorDocumentCount = maxOf(localGuarantorDocumentCount, serverStatus?.counts?.guarantorDocuments ?: 0)
    val guarantorDone =
        guarantorCount >= MIN_REQUIRED_GUARANTOR_COUNT &&
            guarantorDocumentCount >= MIN_REQUIRED_GUARANTOR_COUNT

    val localCollaterals = draft.startedCollaterals()
    val localCollateralCount = localCollaterals.size
    val localCollateralDocumentCount = localCollaterals.count(::collateralHasDocument)
    val collateralCount = maxOf(localCollateralCount, serverStatus?.counts?.collaterals ?: 0)
    val collateralDocumentCount = maxOf(localCollateralDocumentCount, serverStatus?.counts?.collateralDocuments ?: 0)
    val collateralDone =
        collateralCount >= MIN_REQUIRED_COLLATERAL_COUNT &&
            collateralDocumentCount >= MIN_REQUIRED_COLLATERAL_COUNT

    val localFeeCaptured = (draft.financials.feePaymentAmount ?: 0.0) > 0.0 &&
        draft.financials.feePaymentReference.isNotBlank()
    val feeDone = serverStatus?.feePaymentStatus.equals("paid", ignoreCase = true) ||
        serverStatus?.checklist?.feesPaid == true ||
        draft.financials.feeSubmittedAtIso != null ||
        localFeeCaptured

    val nextStepLabel = serverStatus?.nextStep
        ?.takeIf { it.isNotBlank() }
        ?.let(::toDisplayLabel)
        ?: when {
            !profileDone -> "Complete profile"
            serverStatus?.nextStep.equals("capture_location", ignoreCase = true) -> "Capture field location"
            !kycDone -> when {
                !customerPhotoDone -> "Verify facial liveness"
                draft.kyc.documentOcrStatus != com.afriserve.loanofficer.domain.model.CaptureStatus.VERIFIED || !customerIdDone -> "Capture and scan ID"
                draft.kyc.signatureStatus != com.afriserve.loanofficer.domain.model.CaptureStatus.VERIFIED -> "Capture signature"
                else -> "Review KYC"
            }
            !guarantorDone -> if (guarantorCount < MIN_REQUIRED_GUARANTOR_COUNT) {
                "Add guarantor"
            } else {
                "Attach guarantor ID"
            }
            !collateralDone -> when {
                collateralCount < MIN_REQUIRED_COLLATERAL_COUNT -> "Add 2 collateral assets"
                collateralDocumentCount < MIN_REQUIRED_COLLATERAL_COUNT -> "Attach proof to 2 collaterals"
                else -> "Review collateral coverage"
            }
            !feeDone -> "Record fee payment"
            else -> "Ready for sync"
        }

    return OnboardingParityState(
        customerPhotoDone = customerPhotoDone,
        customerIdDone = customerIdDone,
        locationDone = locationDone,
        profileDone = profileDone,
        kycDone = kycDone,
        guarantorCount = guarantorCount,
        guarantorDocumentCount = guarantorDocumentCount,
        guarantorDone = guarantorDone,
        collateralCount = collateralCount,
        collateralDocumentCount = collateralDocumentCount,
        collateralDone = collateralDone,
        feeDone = feeDone,
        feeStatusLabel = when {
            serverStatus?.feePaymentStatus.equals("paid", ignoreCase = true) -> "Paid on server"
            draft.financials.feeSubmittedAtIso != null -> "Submitted in sync queue"
            localFeeCaptured -> "Captured locally and ready to sync"
            else -> "Pending fee capture"
        },
        kycStatusLabel = toDisplayLabel(effectiveKycStatus),
        nextStepLabel = nextStepLabel,
        overallReady = profileDone && kycDone && guarantorDone && collateralDone && feeDone,
        serverReady = serverStatus?.readyForLoanApplication == true,
    )
}

private fun canSelectStep(
    step: OnboardingStep,
    parityState: OnboardingParityState,
): Boolean =
    when (step) {
        OnboardingStep.PROFILE -> true
        OnboardingStep.KYC -> parityState.profileDone
        OnboardingStep.GUARANTOR -> parityState.profileDone && parityState.kycDone
        OnboardingStep.COLLATERAL -> parityState.profileDone && parityState.kycDone && parityState.guarantorDone
        OnboardingStep.FEE -> parityState.profileDone && parityState.kycDone && parityState.guarantorDone && parityState.collateralDone
    }

private fun firstAvailableStep(parityState: OnboardingParityState): OnboardingStep =
    when {
        !parityState.profileDone -> OnboardingStep.PROFILE
        !parityState.kycDone -> OnboardingStep.KYC
        !parityState.guarantorDone -> OnboardingStep.GUARANTOR
        !parityState.collateralDone -> OnboardingStep.COLLATERAL
        else -> OnboardingStep.FEE
    }

private fun guarantorHasDocument(guarantor: GuarantorDraft): Boolean =
    guarantor.hasDocument()

private fun collateralHasDocument(collateral: CollateralDraft): Boolean =
    collateral.hasDocument()

private fun documentStateLabel(
    localUri: String?,
    remoteUrl: String?,
    missingText: String,
): String =
    when {
        !remoteUrl.isNullOrBlank() -> "Uploaded to Afriserve."
        !localUri.isNullOrBlank() -> "Captured locally and waiting to sync."
        else -> missingText
    }

private fun statusWord(complete: Boolean): String =
    if (complete) "complete" else "missing"

private fun normalizedAssetChoice(value: String): String =
    COLLATERAL_ASSET_OPTIONS.firstOrNull { it.value == value }?.value ?: "chattel"

private fun normalizedOwnershipChoice(value: String): String =
    when (value) {
        "self" -> "client"
        else -> COLLATERAL_OWNERSHIP_OPTIONS.firstOrNull { it.value == value }?.value ?: "client"
    }

private fun dateInputValue(value: String?): String =
    value?.trim()?.takeIf { it.isNotBlank() }?.substringBefore("T").orEmpty()

private fun isoDateOrNull(value: String): String? {
    val normalized = value.trim()
    return if (normalized.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) {
        "${normalized}T00:00:00.000Z"
    } else {
        null
    }
}

private fun toDisplayLabel(raw: String): String =
    raw.split('_', '-', ' ')
        .filter { it.isNotBlank() }
        .joinToString(" ") { part ->
            part.replaceFirstChar { character ->
                if (character.isLowerCase()) character.titlecase() else character.toString()
            }
        }

private fun formatCoordinate(value: Double?): String =
    value?.let { String.format("%.5f", it) } ?: "--"

private fun formattedPhoneSelectionIndex(
    formatted: String,
    digitsBeforeCursor: Int,
): Int {
    if (digitsBeforeCursor <= 0) {
        return 0
    }

    var seenDigits = 0
    formatted.forEachIndexed { index, character ->
        if (character.isDigit()) {
            seenDigits += 1
            if (seenDigits >= digitsBeforeCursor) {
                return index + 1
            }
        }
    }

    return formatted.length
}

private fun persistImportedAttachment(
    context: Context,
    sourceUri: Uri,
    fileNamePrefix: String,
): String {
    if (sourceUri.scheme.equals("file", ignoreCase = true)) {
        return sourceUri.toString()
    }

    val targetDirectory = File(context.filesDir, "onboarding-imports").apply { mkdirs() }
    val extension = resolveImportedAttachmentExtension(context, sourceUri)
    val targetFile = File(
        targetDirectory,
        "$fileNamePrefix-${System.currentTimeMillis()}-${System.nanoTime()}.$extension",
    )

    context.contentResolver.openInputStream(sourceUri)?.use { input ->
        targetFile.outputStream().use { output ->
            input.copyTo(output)
        }
    } ?: error("Unable to import attachment: $sourceUri")

    return Uri.fromFile(targetFile).toString()
}

private fun resolveImportedAttachmentExtension(
    context: Context,
    sourceUri: Uri,
): String {
    val displayName = context.contentResolver.query(
        sourceUri,
        arrayOf(OpenableColumns.DISPLAY_NAME),
        null,
        null,
        null,
    )?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (nameIndex >= 0 && cursor.moveToFirst()) {
            cursor.getString(nameIndex)
        } else {
            null
        }
    }

    val nameExtension = displayName
        ?.substringAfterLast('.', missingDelimiterValue = "")
        ?.lowercase()
        ?.takeIf { it.isNotBlank() }
    if (nameExtension != null) {
        return nameExtension
    }

    return context.contentResolver.getType(sourceUri)
        ?.let { mimeType -> MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) }
        ?.takeIf { it.isNotBlank() }
        ?: "bin"
}
