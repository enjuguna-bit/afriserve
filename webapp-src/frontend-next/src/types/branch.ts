export type RegionRecord = {
  id: number
  name: string
  code?: string | null
  is_active?: number
}

export type BranchRecord = {
  id: number
  name: string
  code: string | null
  location_address: string
  county: string
  town: string
  contact_phone: string | null
  contact_email: string | null
  region_id: number
  region_name?: string | null
  region_code?: string | null
  is_active: number
  created_at?: string
  updated_at?: string
}

export type BranchesPagedResponse = {
  data: BranchRecord[]
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

export type HierarchyTreeResponse = {
  headquarters: Record<string, unknown> | null
  regions: Array<RegionRecord & { branch_count?: number; branches: BranchRecord[] }>
}

export type BranchPerformanceRow = {
  branch_id: number
  branch_name: string
  branch_code: string | null
  region_id: number
  region_name: string
  total_clients: number
  total_loans: number
  active_loans: number
  repaid_total: number
  outstanding_balance: number
}

export type HierarchyPerformanceResponse = {
  scope: Record<string, unknown>
  summary: {
    total_loans: number
    total_clients: number
    active_loans: number
    repaid_total: number
    outstanding_balance: number
  }
  branchPerformance: BranchPerformanceRow[]
  roPerformance: Array<Record<string, unknown>>
}
