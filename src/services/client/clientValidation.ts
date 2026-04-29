import { getCurrentTenantId } from "../../utils/tenantStore.js";

export const MIN_REQUIRED_GUARANTORS = 1;
export const MIN_REQUIRED_COLLATERALS = 2;

export function normalizeName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeNationalId(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "");
}

export function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D+/g, "");
}

export function tokenizeName(value: string) {
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function scorePotentialDuplicate(
  query: { nationalId?: string; phone?: string; name?: string },
  client: Record<string, unknown>
) {
  const queryNationalId = normalizeNationalId(query.nationalId);
  const queryPhone = normalizePhone(query.phone);
  const queryName = normalizeName(query.name);

  const clientNationalId = normalizeNationalId(client.national_id);
  const clientPhone = normalizePhone(client.phone);
  const clientName = normalizeName(client.full_name);

  const signals: string[] = [];
  let score = 0;

  if (queryNationalId && clientNationalId) {
    if (clientNationalId === queryNationalId) {
      score += 90;
      signals.push("exact_national_id");
    } else if (clientNationalId.includes(queryNationalId) || queryNationalId.includes(clientNationalId)) {
      score += 60;
      signals.push("partial_national_id");
    }
  }

  if (queryPhone && clientPhone) {
    const samePhoneSuffix = queryPhone.length >= 7
      && clientPhone.length >= 7
      && clientPhone.slice(-7) === queryPhone.slice(-7);

    if (clientPhone === queryPhone) {
      score += 80;
      signals.push("exact_phone");
    } else if (clientPhone.includes(queryPhone) || queryPhone.includes(clientPhone)) {
      score += 45;
      signals.push("partial_phone");
    } else if (samePhoneSuffix) {
      score += 50;
      signals.push("same_phone_suffix");
    }

    if (samePhoneSuffix && !signals.includes("same_phone_suffix")) {
      signals.push("same_phone_suffix");
    }
  }

  if (queryName && clientName) {
    if (clientName === queryName) {
      score += 70;
      signals.push("exact_name");
    } else if (clientName.includes(queryName) || queryName.includes(clientName)) {
      score += 45;
      signals.push("partial_name");
    } else {
      const queryNameTokens = tokenizeName(queryName);
      const clientNameTokens = new Set(tokenizeName(clientName));
      const overlap = queryNameTokens.filter((token) => clientNameTokens.has(token)).length;
      if (overlap >= 2) {
        score += 35;
        signals.push("name_token_overlap");
      } else if (overlap === 1) {
        score += 20;
        signals.push("name_token_partial_overlap");
      }
    }
  }

  if (signals.includes("partial_name") && signals.includes("same_phone_suffix")) {
    score += 10;
    signals.push("name_phone_combined_signal");
  }

  return {
    score,
    signals,
  };
}

export async function hasDuplicateNationalId(
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>,
  nationalId: unknown,
  excludeClientId: number | null = null
) {
  if (!nationalId) {
    return false;
  }
  const normalized = normalizeNationalId(nationalId);
  if (!normalized) return false;
  const tenantId = getCurrentTenantId();
  const existing = await get(
    `
      SELECT id
      FROM clients
      WHERE tenant_id = ?
        AND national_id IS NOT NULL
        AND LOWER(REPLACE(REPLACE(TRIM(national_id), ' ', ''), '-', '')) = ?
        ${excludeClientId ? "AND id != ?" : ""}
    `,
    excludeClientId ? [tenantId, normalized, excludeClientId] : [tenantId, normalized],
  );
  return Boolean(existing?.id);
}

export function deriveOnboardingStatus(payload: {
  hasProfilePhoto: boolean;
  hasPinnedLocation: boolean;
  kycStatus: string;
  hasGuarantor: boolean;
  guarantorDocumentsComplete: boolean;
  hasCollateral: boolean;
  collateralDocumentsComplete: boolean;
  feesPaid: boolean;
}) {
  const normalizedKycStatus = String(payload.kycStatus || "pending").trim().toLowerCase();

  if (
    normalizedKycStatus === "verified"
    && payload.hasProfilePhoto
    && payload.hasPinnedLocation
    && payload.hasGuarantor
    && payload.guarantorDocumentsComplete
    && payload.hasCollateral
    && payload.collateralDocumentsComplete
    && payload.feesPaid
  ) {
    return "complete";
  }
  if (normalizedKycStatus === "verified") {
    return "kyc_verified";
  }
  if (["in_review", "rejected", "suspended"].includes(normalizedKycStatus)) {
    return "kyc_pending";
  }
  return "registered";
}

export function deriveOnboardingNextStep(payload: {
  hasProfilePhoto: boolean;
  hasPinnedLocation: boolean;
  kycStatus: string;
  hasGuarantor: boolean;
  guarantorDocumentsComplete: boolean;
  hasCollateral: boolean;
  collateralDocumentsComplete: boolean;
  feesPaid: boolean;
}) {
  const normalizedKycStatus = String(payload.kycStatus || "pending").trim().toLowerCase();

  if (!payload.hasPinnedLocation) {
    return "capture_location";
  }
  if (normalizedKycStatus !== "verified") {
    if (!payload.hasProfilePhoto) {
      return "start_kyc";
    }
    if (normalizedKycStatus === "in_review") {
      return "complete_kyc_review";
    }
    if (normalizedKycStatus === "rejected") {
      return "resubmit_kyc";
    }
    if (normalizedKycStatus === "suspended") {
      return "resolve_kyc_hold";
    }
    return "start_kyc";
  }
  if (!payload.hasProfilePhoto) {
    return "capture_profile_photo";
  }
  if (!payload.hasGuarantor) {
    return "add_guarantor";
  }
  if (!payload.guarantorDocumentsComplete) {
    return "complete_guarantor_documents";
  }
  if (!payload.hasCollateral) {
    return "add_collateral";
  }
  if (!payload.collateralDocumentsComplete) {
    return "complete_collateral_documents";
  }
  if (!payload.feesPaid) {
    return "record_fee_payment";
  }
  return null;
}
