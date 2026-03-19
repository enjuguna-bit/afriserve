export type AuthUser = {
  id: number
  full_name: string
  email: string
  role: string
  roles?: string[]
  permissions?: string[]
  branch_id: number | null
  primary_region_id: number | null
  scope?: {
    branchId: number | null
    primaryRegionId: number | null
  }
  is_active?: number
  branch_name?: string | null
  region_name?: string | null
  role_description?: string | null
  assigned_branch_ids?: number[]
  created_at?: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type LoginResponse = {
  token: string
  refreshToken?: string
  user: AuthUser
}
