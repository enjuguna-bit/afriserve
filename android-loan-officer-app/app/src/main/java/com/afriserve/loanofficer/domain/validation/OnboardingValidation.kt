package com.afriserve.loanofficer.domain.validation

import com.afriserve.loanofficer.core.util.InputMasking
import com.afriserve.loanofficer.domain.model.CollateralDraft
import com.afriserve.loanofficer.domain.model.GuarantorDraft
import com.afriserve.loanofficer.domain.model.OnboardingDraft
import com.afriserve.loanofficer.domain.model.isMeaningfullyStarted

private const val FULL_NAME_MAX = 120
private const val NATIONAL_ID_MAX = 50
private const val KRA_PIN_LENGTH = 11
private const val NEXT_OF_KIN_NAME_MAX = 120
private const val NEXT_OF_KIN_RELATION_MAX = 120
private const val RESIDENTIAL_ADDRESS_MAX = 255
private const val BUSINESS_TYPE_MAX = 120
private const val BUSINESS_LOCATION_MAX = 255
private const val MAX_LOCATION_ACCURACY_METERS = 100_000.0
private const val MAX_GUARANTOR_ADDRESS = 255
private const val MAX_OCCUPATION = 120
private const val MAX_EMPLOYER = 120
private const val MAX_MONTHLY_INCOME = 100_000_000.0
private const val MAX_GUARANTEE_AMOUNT = 1_000_000_000.0
private const val MAX_COLLATERAL_DESCRIPTION = 500
private const val MAX_COLLATERAL_OWNER_NAME = 120
private const val MAX_COLLATERAL_REGISTRATION = 80
private const val MAX_COLLATERAL_LOCATION_DETAILS = 255
private const val MAX_COLLATERAL_VALUE = 1_000_000_000.0
private const val MAX_FEE_AMOUNT = 100_000_000.0
private const val MAX_PAYMENT_REFERENCE = 120

private val kraPinRegex = Regex("^[A-Za-z][0-9]{9}[A-Za-z]$")
private val isoDateTimeRegex = Regex("^\\d{4}-\\d{2}-\\d{2}T.+Z$")
private val validCollateralAssetTypes = setOf(
    "chattel",
    "vehicle",
    "land",
    "equipment",
    "machinery",
    "inventory",
    "livestock",
    "savings",
)
private val validOwnershipTypes = setOf(
    "client",
    "guarantor",
    "third_party",
)

object OnboardingValidation {

    fun phoneFieldMessage(raw: String): String? {
        val sanitized = raw.trim()
        return when {
            sanitized.isBlank() -> null
            InputMasking.normalizeKenyanPhone(sanitized) == null ->
                "Use a Kenyan mobile number such as 0712 345 678 or +254712345678."
            else -> null
        }
    }

    fun nationalIdFieldMessage(raw: String): String? {
        val cleaned = raw.trim()
        return when {
            cleaned.isBlank() -> null
            cleaned.length !in 4..NATIONAL_ID_MAX ->
                "National ID must be between 4 and $NATIONAL_ID_MAX characters."
            else -> null
        }
    }

    fun kraPinFieldMessage(raw: String): String? {
        val cleaned = raw.trim()
        return when {
            cleaned.isBlank() -> null
            cleaned.length != KRA_PIN_LENGTH || !kraPinRegex.matches(cleaned) ->
                "KRA PIN must follow the format A123456789B."
            else -> null
        }
    }

    fun validateForSync(
        draft: OnboardingDraft,
        isNewRemoteClient: Boolean,
    ): List<String> {
        val issues = mutableListOf<String>()

        val fullName = draft.identity.fullName.trim()
        if (isNewRemoteClient) {
            if (fullName.length < 2) {
                issues += "Enter the customer's full name before syncing."
            }
        }
        if (fullName.isNotBlank() && fullName.length > FULL_NAME_MAX) {
            issues += "Customer full name cannot exceed $FULL_NAME_MAX characters."
        }

        phoneFieldMessage(draft.identity.phone)?.let(issues::add)
        nationalIdFieldMessage(draft.identity.nationalId)?.let(issues::add)
        kraPinFieldMessage(draft.identity.kraPin)?.let(issues::add)

        draft.identity.nextOfKinName.trim().takeIf { it.isNotBlank() }?.let { nextOfKinName ->
            if (nextOfKinName.length < 2 || nextOfKinName.length > NEXT_OF_KIN_NAME_MAX) {
                issues += "Next of kin name must be between 2 and $NEXT_OF_KIN_NAME_MAX characters."
            }
        }
        draft.identity.nextOfKinPhone.trim().takeIf { it.isNotBlank() }?.let { phone ->
            if (InputMasking.normalizeKenyanPhone(phone) == null) {
                issues += "Next of kin phone must be a valid Kenyan mobile number."
            }
        }
        if (draft.identity.nextOfKinRelation.length > NEXT_OF_KIN_RELATION_MAX) {
            issues += "Relationship cannot exceed $NEXT_OF_KIN_RELATION_MAX characters."
        }
        if (draft.identity.residentialAddress.length > RESIDENTIAL_ADDRESS_MAX) {
            issues += "Residential address cannot exceed $RESIDENTIAL_ADDRESS_MAX characters."
        }
        if (draft.financials.businessType.length > BUSINESS_TYPE_MAX) {
            issues += "Business type cannot exceed $BUSINESS_TYPE_MAX characters."
        }
        if (draft.financials.businessLocation.length > BUSINESS_LOCATION_MAX) {
            issues += "Business location cannot exceed $BUSINESS_LOCATION_MAX characters."
        }
        if ((draft.financials.businessYears ?: 0) < 0) {
            issues += "Years in business cannot be negative."
        }

        validateLocation(draft)?.let(issues::add)

        draft.guarantors
            .filter(GuarantorDraft::isMeaningfullyStarted)
            .forEachIndexed { index, guarantor ->
            validateGuarantor(index, guarantor)?.let(issues::add)
        }
        draft.collaterals
            .filter(CollateralDraft::isMeaningfullyStarted)
            .forEachIndexed { index, collateral ->
            validateCollateral(index, collateral)?.let(issues::add)
        }

        val feeAmount = draft.financials.feePaymentAmount
        if (feeAmount != null && (feeAmount < 0.0 || feeAmount > MAX_FEE_AMOUNT)) {
            issues += "Onboarding fee must be between 0 and ${MAX_FEE_AMOUNT.toLong()}."
        }
        if (draft.financials.feePaymentReference.length > MAX_PAYMENT_REFERENCE) {
            issues += "Payment reference cannot exceed $MAX_PAYMENT_REFERENCE characters."
        }
        if (feeAmount != null && feeAmount > 0.0 && draft.financials.feePaymentReference.isBlank()) {
            issues += "Add a payment reference before submitting a fee for sync."
        }
        draft.financials.feePaidAtIso?.takeIf { it.isNotBlank() }?.let { paidAt ->
            if (!isoDateTimeRegex.matches(paidAt)) {
                issues += "Fee paid-at date must be stored as an ISO timestamp."
            }
        }

        return issues
    }

    private fun validateLocation(draft: OnboardingDraft): String? {
        val latitude = draft.identity.latitude
        val longitude = draft.identity.longitude
        if ((latitude == null) != (longitude == null)) {
            return "Field location must include both latitude and longitude."
        }
        if (latitude != null && latitude !in -90.0..90.0) {
            return "Latitude must be between -90 and 90."
        }
        if (longitude != null && longitude !in -180.0..180.0) {
            return "Longitude must be between -180 and 180."
        }
        val accuracy = draft.identity.locationAccuracyMeters
        if (accuracy != null && (accuracy < 0.0 || accuracy > MAX_LOCATION_ACCURACY_METERS)) {
            return "Location accuracy must be between 0 and ${MAX_LOCATION_ACCURACY_METERS.toLong()} meters."
        }
        draft.identity.locationCapturedAtIso?.takeIf { it.isNotBlank() }?.let { capturedAt ->
            if (!isoDateTimeRegex.matches(capturedAt)) {
                return "Location capture time must be stored as an ISO timestamp."
            }
        }
        return null
    }

    private fun validateGuarantor(
        index: Int,
        guarantor: GuarantorDraft,
    ): String? {
        val label = "Guarantor ${index + 1}"
        val fullName = guarantor.fullName.trim()
        if (fullName.length !in 2..FULL_NAME_MAX) {
            return "$label full name must be between 2 and $FULL_NAME_MAX characters."
        }
        phoneFieldMessage(guarantor.phone)?.let { return "$label: $it" }
        nationalIdFieldMessage(guarantor.nationalId)?.let { return "$label: $it" }
        if (guarantor.physicalAddress.length > MAX_GUARANTOR_ADDRESS) {
            return "$label address cannot exceed $MAX_GUARANTOR_ADDRESS characters."
        }
        if (guarantor.occupation.length > MAX_OCCUPATION) {
            return "$label occupation cannot exceed $MAX_OCCUPATION characters."
        }
        if (guarantor.employerName.length > MAX_EMPLOYER) {
            return "$label employer cannot exceed $MAX_EMPLOYER characters."
        }
        guarantor.monthlyIncome?.let { monthlyIncome ->
            if (monthlyIncome < 0.0 || monthlyIncome > MAX_MONTHLY_INCOME) {
                return "$label monthly income must be between 0 and ${MAX_MONTHLY_INCOME.toLong()}."
            }
        }
        val guaranteeAmount = guarantor.guaranteeAmount
        if (guaranteeAmount == null || guaranteeAmount <= 0.0 || guaranteeAmount > MAX_GUARANTEE_AMOUNT) {
            return "$label guarantee amount must be greater than 0 and no more than ${MAX_GUARANTEE_AMOUNT.toLong()}."
        }
        return null
    }

    private fun validateCollateral(
        index: Int,
        collateral: CollateralDraft,
    ): String? {
        val label = "Collateral ${index + 1}"
        if (collateral.assetType !in validCollateralAssetTypes) {
            return "$label uses an unsupported asset type."
        }
        val description = collateral.description.trim()
        if (description.length !in 3..MAX_COLLATERAL_DESCRIPTION) {
            return "$label description must be between 3 and $MAX_COLLATERAL_DESCRIPTION characters."
        }
        val estimatedValue = collateral.estimatedValue
        if (estimatedValue == null || estimatedValue <= 0.0 || estimatedValue > MAX_COLLATERAL_VALUE) {
            return "$label estimated value must be greater than 0 and no more than ${MAX_COLLATERAL_VALUE.toLong()}."
        }
        if (collateral.ownershipType !in validOwnershipTypes) {
            return "$label ownership type is invalid."
        }
        if (collateral.ownerName.length > MAX_COLLATERAL_OWNER_NAME) {
            return "$label owner name cannot exceed $MAX_COLLATERAL_OWNER_NAME characters."
        }
        nationalIdFieldMessage(collateral.ownerNationalId)?.let { return "$label owner national ID: $it" }
        if (collateral.registrationNumber.length > MAX_COLLATERAL_REGISTRATION) {
            return "$label registration number cannot exceed $MAX_COLLATERAL_REGISTRATION characters."
        }
        if (collateral.logbookNumber.length > MAX_COLLATERAL_REGISTRATION) {
            return "$label logbook number cannot exceed $MAX_COLLATERAL_REGISTRATION characters."
        }
        if (collateral.titleNumber.length > MAX_COLLATERAL_REGISTRATION) {
            return "$label title number cannot exceed $MAX_COLLATERAL_REGISTRATION characters."
        }
        if (collateral.locationDetails.length > MAX_COLLATERAL_LOCATION_DETAILS) {
            return "$label location details cannot exceed $MAX_COLLATERAL_LOCATION_DETAILS characters."
        }
        collateral.valuationDateIso?.takeIf { it.isNotBlank() }?.let { valuationDate ->
            if (!isoDateTimeRegex.matches(valuationDate)) {
                return "$label valuation date must be stored as an ISO timestamp."
            }
        }
        return null
    }
}
