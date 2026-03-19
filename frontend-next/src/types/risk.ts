export type CollateralAssetType = 'chattel' | 'vehicle' | 'land' | 'equipment' | 'machinery' | 'inventory' | 'livestock' | 'savings'

export type CollateralOwnershipType = 'client' | 'guarantor' | 'third_party'

export type LoanProductRecord = {
  id: number
  name: string
  interest_rate: number
  interest_accrual_method: 'upfront' | 'daily_eod' | string
  registration_fee: number
  processing_fee: number
  penalty_rate_daily: number
  penalty_flat_amount: number
  penalty_grace_days: number
  penalty_cap_amount: number | null
  penalty_compounding_method: 'simple' | 'compound' | string
  penalty_base_amount: 'installment_outstanding' | 'principal_outstanding' | 'full_balance' | string
  penalty_cap_percent_of_outstanding: number | null
  pricing_strategy?: 'flat_rate' | 'graduated_weekly_income' | string
  pricing_config?: string | null
  min_term_weeks: number
  max_term_weeks: number
  is_active: number
  created_at: string
  updated_at: string
}

export type CreateLoanProductPayload = {
  name: string
  interestRate: number
  pricingStrategy?: 'flat_rate' | 'graduated_weekly_income'
  pricingConfig?: unknown | null
  interestAccrualMethod?: 'upfront' | 'flat' | 'daily' | 'daily_eod'
  registrationFee: number
  processingFee: number
  penaltyRateDaily?: number
  penaltyFlatAmount?: number
  penaltyGraceDays?: number
  penaltyCapAmount?: number | null
  penaltyCompoundingMethod?: 'simple' | 'compound'
  penaltyBaseAmount?: 'installment_outstanding' | 'principal_outstanding' | 'full_balance'
  penaltyCapPercentOfOutstanding?: number | null
  minTermWeeks: number
  maxTermWeeks: number
  isActive?: boolean
}

export type UpdateLoanProductPayload = Partial<CreateLoanProductPayload>

export type GuarantorRecord = {
  id: number
  full_name: string
  phone: string | null
  national_id: string | null
  physical_address: string | null
  occupation: string | null
  employer_name: string | null
  monthly_income: number
  is_active: number
  branch_id: number
  branch_name?: string | null
  linked_loan_count?: number
  created_at: string
  updated_at: string
}

export type CreateGuarantorPayload = {
  fullName: string
  phone?: string
  nationalId?: string
  physicalAddress?: string
  occupation?: string
  employerName?: string
  monthlyIncome?: number
  branchId?: number
}

export type CollateralAssetRecord = {
  id: number
  asset_type: CollateralAssetType | string
  description: string
  estimated_value: number
  ownership_type: CollateralOwnershipType | string
  owner_name: string | null
  owner_national_id: string | null
  registration_number: string | null
  logbook_number: string | null
  title_number: string | null
  location_details: string | null
  valuation_date: string | null
  status: 'active' | 'released' | 'liquidated'
  branch_id: number
  branch_name?: string | null
  linked_loan_count?: number
  created_at: string
  updated_at: string
}

export type CreateCollateralAssetPayload = {
  assetType: CollateralAssetType
  description: string
  estimatedValue: number
  ownershipType?: CollateralOwnershipType
  ownerName?: string
  ownerNationalId?: string
  registrationNumber?: string
  logbookNumber?: string
  titleNumber?: string
  locationDetails?: string
  valuationDate?: string
  branchId?: number
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
