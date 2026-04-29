type DashboardOfficeOption = {
  id?: number | string | null
  scopeType?: string | null
}

function toPositiveNumber(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function resolveDashboardBranchIdFilter({
  normalizedRole,
  selectedOffice,
  userBranchId,
}: {
  normalizedRole: string
  selectedOffice?: DashboardOfficeOption | null
  userBranchId?: number | string | null
}) {
  const officeScopeType = String(selectedOffice?.scopeType || '').trim().toLowerCase()
  const selectedBranchId = toPositiveNumber(selectedOffice?.id)
  const fallbackBranchId = toPositiveNumber(userBranchId)

  if (officeScopeType === 'branch') {
    return selectedBranchId ?? fallbackBranchId ?? undefined
  }

  if (officeScopeType === 'overall' || officeScopeType === 'region') {
    return undefined
  }

  if (normalizedRole === 'operations_manager') {
    return fallbackBranchId ?? undefined
  }

  return undefined
}

export {
  resolveDashboardBranchIdFilter,
}
