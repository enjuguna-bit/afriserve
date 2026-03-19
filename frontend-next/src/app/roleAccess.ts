type RoleAwareUser = {
  role?: unknown
  roles?: unknown
}

function normalizeUserRoles(userOrRole: unknown): string[] {
  const raw = (typeof userOrRole === 'object' && userOrRole !== null)
    ? ([...(Array.isArray((userOrRole as RoleAwareUser).roles) ? (userOrRole as RoleAwareUser).roles as unknown[] : []), (userOrRole as RoleAwareUser).role] as unknown[])
    : [userOrRole]

  const deduped = new Set<string>()
  raw.forEach((entry) => {
    const normalized = String(entry || '').trim().toLowerCase()
    if (normalized) {
      deduped.add(normalized)
    }
  })

  return [...deduped]
}

function hasAnyRole(userOrRole: unknown, allowedRoles: string[]): boolean {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    return true
  }

  const normalizedRoles = normalizeUserRoles(userOrRole)
  if (normalizedRoles.length === 0) {
    return false
  }

  return normalizedRoles.some((role) => allowedRoles.includes(role))
}

export {
  hasAnyRole,
  normalizeUserRoles,
}