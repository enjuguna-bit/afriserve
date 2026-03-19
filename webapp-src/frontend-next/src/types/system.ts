export type SystemPagedResponse<T> = {
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

export type TransactionRecord = {
  id: number
  tx_type: string
  amount: number
  occurred_at: string
  note: string | null
  client_name: string | null
  loan_id: number | null
}

export type AuditLogRecord = {
  id: number
  user_id: number | null
  action: string
  target_type: string | null
  target_id: number | null
  details: string | null
  ip_address: string | null
  created_at: string
}

export type HierarchyEventRecord = {
  id: number
  event_type: string
  scope_level: string
  region_id: number | null
  region_name: string | null
  branch_id: number | null
  branch_name: string | null
  actor_user_id: number | null
  actor_user_name: string | null
  actor_user_email: string | null
  details: string | null
  created_at: string
}
