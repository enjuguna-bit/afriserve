export type CollectionsSummary = {
  overdue_loans: number
  overdue_installments: number
  overdue_amount: number
  total_collection_actions: number
  open_collection_actions: number
  open_promises: number
  overdue_loans_for_officer: number
  overdue_amount_for_officer: number
}

export type CollectionOverdueRow = {
  loan_id: number
  client_id: number
  client_name: string
  due_date: string
  overdue_amount: number
  days_overdue: number
  officer_id: number | null
  officer_name: string | null
  branch_name: string | null
  branch_code?: string | null
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

export type CollectionAction = {
  id: number
  loan_id: number
  installment_id: number | null
  action_type: 'contact_attempt' | 'promise_to_pay' | 'note' | 'status_change'
  action_note: string | null
  promise_date: string | null
  next_follow_up_date: string | null
  action_status: 'open' | 'completed' | 'cancelled'
  created_by_user_id: number
  created_at: string
}

export type CreateCollectionActionPayload = {
  loanId: number
  installmentId?: number
  actionType: 'contact_attempt' | 'promise_to_pay' | 'note' | 'status_change'
  actionNote?: string
  promiseDate?: string
  nextFollowUpDate?: string
  actionStatus?: 'open' | 'completed' | 'cancelled'
}
