/**
 * Client Mappers
 * Convert between domain entities and DTOs
 */

import { Client } from '../domain/client/entities/Client.js';
import {
  ClientDto,
  ClientDetailDto,
  ClientOnboardingStatusDto,
  CreateClientResponseDto,
  ApiLinks,
} from '../dtos/clientDtos.js';

/**
 * Map Client entity to basic DTO
 */
export function mapClientToDto(client: Client, baseUrl: string): ClientDto {
  const dto: ClientDto = {
    id: client.id.value,
    referenceCode: client.referenceCode,
    fullName: client.fullName,
    phone: client.phone.value,
    nationalId: client.nationalId?.value,
    branchId: client.branchId,
    officerId: client.officerId,
    kycStatus: client.kycStatus.value,
    onboardingStatus: client.onboardingStatus.value,
    feePaymentStatus: client.feePaymentStatus.value,
    isActive: client.isActive,
    createdAt: client.createdAt.toISOString(),
    _links: buildClientLinks(client.id.value, client.kycStatus.value, baseUrl),
  };

  return dto;
}

/**
 * Map database row to DTO (for optimized queries)
 */
export function mapClientRowToDto(row: any, baseUrl: string): ClientDto {
  return {
    id: row.id,
    referenceCode: `BRW-${String(row.id).padStart(6, '0')}`,
    fullName: row.full_name,
    phone: row.phone,
    nationalId: row.national_id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    officerId: row.officer_id,
    officerName: row.officer_name,
    kycStatus: row.kyc_status,
    onboardingStatus: row.onboarding_status,
    feePaymentStatus: row.fee_payment_status,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _links: buildClientLinks(row.id, row.kyc_status, baseUrl),
  };
}

/**
 * Map Client entity to detailed DTO
 */
export function mapClientToDetailDto(
  client: Client,
  baseUrl: string
): ClientDetailDto {
  const baseDto = mapClientToDto(client, baseUrl);
  const props = (client as any)._props; // Access private props for mapping

  return {
    ...baseDto,
    nextOfKinName: props.nextOfKinName,
    nextOfKinPhone: props.nextOfKinPhone?.value,
    nextOfKinRelation: props.nextOfKinRelation,
    businessType: props.businessType,
    businessYears: props.businessYears,
    businessLocation: props.businessLocation,
    residentialAddress: props.residentialAddress,
    photoUrl: props.photoUrl,
    idDocumentUrl: props.idDocumentUrl,
    kraPin: props.kraPin,
    feesPaidAt: props.feesPaidAt?.toISOString(),
  };
}

/**
 * Map Client entity to onboarding status DTO
 */
export function mapClientToOnboardingStatusDto(
  client: Client
): ClientOnboardingStatusDto {
  const props = (client as any)._props;

  const kycCompleted = client.kycStatus.isVerified();
  const feePaid = client.feePaymentStatus.isPaid();
  const isActive = client.onboardingStatus.isActive();

  let nextStep: string | undefined;
  if (!kycCompleted) {
    nextStep = 'Complete KYC verification';
  } else if (!feePaid) {
    nextStep = 'Pay registration fees';
  } else if (!isActive) {
    nextStep = 'Account activation in progress';
  }

  return {
    clientId: client.id.value,
    referenceCode: client.referenceCode,
    onboardingSteps: {
      registration: {
        completed: true,
        completedAt: client.createdAt.toISOString(),
      },
      kycVerification: {
        completed: kycCompleted,
        completedAt: kycCompleted ? props.updatedAt?.toISOString() : undefined,
        status: client.kycStatus.value,
      },
      feePayment: {
        completed: feePaid,
        completedAt: props.feesPaidAt?.toISOString(),
        status: client.feePaymentStatus.value,
      },
      activation: {
        completed: isActive,
        completedAt: isActive ? props.updatedAt?.toISOString() : undefined,
      },
    },
    overallStatus: client.onboardingStatus.value,
    nextStep,
    canApplyForLoan: client.isEligibleForLoan(),
  };
}

/**
 * Build HATEOAS links for client
 */
function buildClientLinks(
  clientId: number,
  kycStatus: string,
  baseUrl: string
): ApiLinks {
  const links: ApiLinks = {
    self: `${baseUrl}/api/clients/${clientId}`,
    loans: `${baseUrl}/api/clients/${clientId}/loans`,
    history: `${baseUrl}/api/clients/${clientId}/history`,
  };

  // Add conditional links based on state
  if (kycStatus === 'pending' || kycStatus === 'in_review') {
    links.updateKyc = `${baseUrl}/api/clients/${clientId}/kyc`;
  }

  if (kycStatus === 'verified') {
    links.recordFeePayment = `${baseUrl}/api/clients/${clientId}/fees`;
  }

  links.guarantors = `${baseUrl}/api/clients/${clientId}/guarantors`;
  links.collaterals = `${baseUrl}/api/clients/${clientId}/collaterals`;

  return links;
}

/**
 * Map to create client response
 */
export function mapToCreateClientResponse(
  clientId: number,
  baseUrl: string
): CreateClientResponseDto {
  const referenceCode = `BRW-${String(clientId).padStart(6, '0')}`;

  return {
    clientId,
    referenceCode,
    status: 'success',
    message: 'Client created successfully',
    _links: {
      self: `${baseUrl}/api/clients`,
      client: `${baseUrl}/api/clients/${clientId}`,
      updateKyc: `${baseUrl}/api/clients/${clientId}/kyc`,
    },
  };
}
