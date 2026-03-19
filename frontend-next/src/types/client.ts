export type ClientKycStatus = 'pending' | 'in_review' | 'verified' | 'rejected' | 'suspended'

export type ClientRecord = {
  id: number
  full_name: string
  phone: string | null
  national_id: string | null
  kra_pin: string | null
  photo_url: string | null
  id_document_url: string | null
  next_of_kin_name: string | null
  next_of_kin_phone: string | null
  next_of_kin_relation: string | null
  business_type: string | null
  business_years: number | null
  business_location: string | null
  residential_address: string | null
  is_active: number
  branch_id: number | null
  branch_name?: string | null
  officer_id: number | null
  assigned_officer_id?: number | null
  assigned_officer_name?: string | null
  created_by_user_id: number | null
  loan_count?: number | string
  closed_loan_count?: number | string
  open_loan_count?: number | string
  kyc_status?: ClientKycStatus | null
  onboarding_status?: 'registered' | 'kyc_pending' | 'kyc_verified' | 'complete' | string | null
  fee_payment_status?: 'unpaid' | 'paid' | 'waived' | string | null
  fees_paid_at?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export type ClientLoanSummary = {
  id: number
  principal: number
  interest_rate: number
  term_months: number | null
  term_weeks: number | null
  registration_fee: number | null
  processing_fee: number | null
  expected_total: number
  repaid_total: number
  balance: number
  status: string
  disbursed_at: string | null
  branch_id: number | null
}

export type ClientDetail = ClientRecord & {
  loans: ClientLoanSummary[]
}

export type AssignableOfficer = {
  id: number
  full_name: string
  branch_id: number | null
  branch_name?: string | null
  region_name?: string | null
  assigned_portfolio_count?: number
}

export type PortfolioReallocationPayload = {
  fromOfficerId: number
  toOfficerId: number
  note?: string
}

export type ClientOnboardingStatus = {
  clientId: number
  onboardingStatus: string
  kycStatus: ClientKycStatus | string
  feePaymentStatus: string
  feesPaidAt: string | null
  readyForLoanApplication: boolean
  checklist: {
    guarantorAdded: boolean
    collateralAdded: boolean
    feesPaid: boolean
    complete: boolean
  }
  counts: {
    guarantors: number
    collaterals: number
  }
  nextStep: string | null
}

export type ClientGuarantorRecord = {
  id: number
  full_name: string
  phone: string | null
  national_id: string | null
  physical_address: string | null
  occupation: string | null
  employer_name: string | null
  monthly_income: number
  guarantee_amount: number
  is_active: number
  client_id?: number | null
  branch_id?: number | null
  created_at: string
  updated_at: string
}

export type CreateClientGuarantorPayload = {
  fullName: string
  phone?: string
  nationalId?: string
  physicalAddress?: string
  occupation?: string
  employerName?: string
  monthlyIncome?: number
  guaranteeAmount: number
}

export type ClientCollateralAssetType = 'chattel' | 'vehicle' | 'land' | 'equipment' | 'machinery' | 'inventory' | 'livestock' | 'savings'

export type ClientCollateralOwnershipType = 'client' | 'guarantor' | 'third_party'

export type ClientCollateralRecord = {
  id: number
  asset_type: ClientCollateralAssetType | string
  description: string
  estimated_value: number
  ownership_type: ClientCollateralOwnershipType | string
  owner_name: string | null
  owner_national_id: string | null
  registration_number: string | null
  logbook_number: string | null
  title_number: string | null
  location_details: string | null
  valuation_date: string | null
  status: 'active' | 'released' | 'liquidated' | string
  client_id?: number | null
  branch_id?: number | null
  created_at: string
  updated_at: string
}

export type CreateClientCollateralPayload = {
  assetType: ClientCollateralAssetType
  description: string
  estimatedValue: number
  ownershipType?: ClientCollateralOwnershipType
  ownerName?: string
  ownerNationalId?: string
  registrationNumber?: string
  logbookNumber?: string
  titleNumber?: string
  locationDetails?: string
  valuationDate?: string
}

export type RecordClientFeePayload = {
  amount?: number
  paymentReference?: string
  paidAt?: string
  note?: string
}

export type PagedResponse<T> = {
  data: T[]
  paging: {
    total: number
    limit: number
    offset: number
  }
  sort: {
    sortBy: string
    sortOrder: string
  }
}

export type ListClientsQuery = {
  search?: string
  limit?: number
  offset?: number
  sortBy?: 'id' | 'fullName' | 'createdAt' | 'loanCount'
  sortOrder?: 'asc' | 'desc'
  branchId?: number
  officerId?: number
  minLoans?: number
  isActive?: boolean
  kycStatus?: ClientKycStatus
  onboardingStatus?: 'registered' | 'kyc_pending' | 'kyc_verified' | 'complete'
  feePaymentStatus?: 'unpaid' | 'paid' | 'waived'
  dormantOnly?: boolean
}

export type CreateClientPayload = {
  fullName: string
  phone?: string
  nationalId?: string
  kraPin?: string
  photoUrl?: string
  idDocumentUrl?: string
  nextOfKinName?: string
  nextOfKinPhone?: string
  nextOfKinRelation?: string
  businessType?: string
  businessYears?: number
  businessLocation?: string
  residentialAddress?: string
  officerId?: number
  branchId?: number
}

export type UpdateClientPayload = {
  fullName?: string
  phone?: string | null
  nationalId?: string | null
  isActive?: boolean
  kraPin?: string | null
  photoUrl?: string | null
  idDocumentUrl?: string | null
  nextOfKinName?: string | null
  nextOfKinPhone?: string | null
  nextOfKinRelation?: string | null
  businessType?: string | null
  businessYears?: number | null
  businessLocation?: string | null
  residentialAddress?: string | null
  officerId?: number | null
}

export type ClientKycUpdatePayload = {
  status: ClientKycStatus
  note?: string
}

export type PotentialDuplicateQuery = {
  nationalId?: string
  phone?: string
  name?: string
  limit?: number
}

export type ClientHistoryEntry = {
  id?: number
  action?: string
  created_at?: string
  createdAt?: string
  [key: string]: unknown
}

export type ClientHistoryPayload = {
  [key: string]: unknown
}

export type ClientDuplicateCandidate = {
  id?: number
  full_name?: string
  phone?: string | null
  national_id?: string | null
  [key: string]: unknown
}
