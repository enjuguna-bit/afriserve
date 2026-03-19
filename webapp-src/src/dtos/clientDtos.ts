/**
 * Client Data Transfer Objects
 * Clean API response structures with HATEOAS links
 */

// ==================== Base Response Structures ====================

export interface ApiLinks {
  self: string;
  [key: string]: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==================== Client DTOs ====================

export interface ClientDto {
  id: number;
  referenceCode: string;
  fullName: string;
  phone: string;
  nationalId?: string;
  branchId: number;
  branchName?: string;
  officerId?: number;
  officerName?: string;
  kycStatus: string;
  onboardingStatus: string;
  feePaymentStatus: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _links: ApiLinks;
}

export interface ClientDetailDto extends ClientDto {
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinRelation?: string;
  businessType?: string;
  businessYears?: number;
  businessLocation?: string;
  residentialAddress?: string;
  photoUrl?: string;
  idDocumentUrl?: string;
  kraPin?: string;
  feesPaidAt?: string;
}

export interface ClientOnboardingStatusDto {
  clientId: number;
  referenceCode: string;
  onboardingSteps: {
    registration: {
      completed: boolean;
      completedAt?: string;
    };
    kycVerification: {
      completed: boolean;
      completedAt?: string;
      status: string;
    };
    feePayment: {
      completed: boolean;
      completedAt?: string;
      status: string;
    };
    activation: {
      completed: boolean;
      completedAt?: string;
    };
  };
  overallStatus: string;
  nextStep?: string;
  canApplyForLoan: boolean;
}

export interface ClientListDto {
  clients: ClientDto[];
  pagination: PaginationMeta;
  _links: {
    self: string;
    first: string;
    last: string;
    next?: string;
    prev?: string;
  };
}

// ==================== Create/Update Response DTOs ====================

export interface CreateClientResponseDto {
  clientId: number;
  referenceCode: string;
  status: string;
  message: string;
  _links: {
    self: string;
    client: string;
    updateKyc: string;
  };
}

export interface UpdateClientResponseDto {
  clientId: number;
  status: string;
  message: string;
  updatedFields: string[];
  _links: {
    self: string;
    client: string;
  };
}

export interface RecordFeePaymentResponseDto {
  clientId: number;
  amount: number;
  paymentMethod: string;
  transactionReference?: string;
  status: string;
  message: string;
  _links: {
    self: string;
    client: string;
    onboardingStatus: string;
  };
}

// ==================== Guarantor DTOs ====================

export interface GuarantorDto {
  id: number;
  clientId: number;
  fullName: string;
  phone: string;
  nationalId?: string;
  relationship: string;
  address?: string;
  employer?: string;
  createdAt: string;
  _links: ApiLinks;
}

export interface ClientGuarantorsDto {
  clientId: number;
  guarantors: GuarantorDto[];
  _links: {
    self: string;
    client: string;
    addGuarantor: string;
  };
}

// ==================== Collateral DTOs ====================

export interface CollateralDto {
  id: number;
  clientId: number;
  assetType: string;
  description: string;
  estimatedValue: number;
  location?: string;
  registrationNumber?: string;
  documentUrl?: string;
  createdAt: string;
  _links: ApiLinks;
}

export interface ClientCollateralsDto {
  clientId: number;
  collaterals: CollateralDto[];
  totalEstimatedValue: number;
  _links: {
    self: string;
    client: string;
    addCollateral: string;
  };
}

// ==================== Error Response ====================

export interface ErrorResponseDto {
  error: {
    code: string;
    message: string;
    details?: any;
    correlationId?: string;
    timestamp: string;
  };
}

// ==================== Duplicate Check DTO ====================

export interface PotentialDuplicateDto {
  clientId: number;
  referenceCode: string;
  fullName: string;
  phone: string;
  nationalId?: string;
  matchScore: number;
  matchReasons: string[];
  _links: {
    self: string;
    client: string;
  };
}

export interface PotentialDuplicatesResponseDto {
  hasPotentialDuplicates: boolean;
  duplicates: PotentialDuplicateDto[];
  searchCriteria: {
    phone?: string;
    nationalId?: string;
    fullName?: string;
  };
}
