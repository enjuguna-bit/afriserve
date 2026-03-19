import { hasAnyRole } from './roleAccess'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SidebarSection = 'operate' | 'measure' | 'configure'

export type SidebarNavItem = {
  to: string
  label: string
  roles?: string[]
  section: SidebarSection
  children?: SidebarNavItem[]
  matchPrefixes?: string[]
}

export type QuickAction = {
  to: string
  label: string
  roles?: string[]
  variant: 'primary' | 'danger' | 'success'
  badge?: 'approvals'
}

export type SectionMeta = {
  label: string
  defaultCollapsed: boolean
}

// ─── Section metadata ─────────────────────────────────────────────────────────

export const sectionMeta: Record<SidebarSection, SectionMeta> = {
  operate:   { label: 'Operate',   defaultCollapsed: false },
  measure:   { label: 'Measure',   defaultCollapsed: false },
  configure: { label: 'Configure', defaultCollapsed: true  },
}

// ─── Quick actions ─────────────────────────────────────────────────────────────

export const quickActions: QuickAction[] = [
  {
    to: '/clients/new',
    label: '+ Borrower',
    roles: ['admin', 'loan_officer'],
    variant: 'primary',
  },
  {
    to: '/loans/new',
    label: '+ Loan',
    roles: ['admin', 'loan_officer'],
    variant: 'primary',
  },
  {
    to: '/approvals',
    label: 'Approvals',
    roles: ['admin', 'finance', 'operations_manager', 'area_manager'],
    variant: 'danger',
    badge: 'approvals',
  },
  {
    to: '/collections',
    label: 'Record payment',
    roles: ['admin', 'cashier', 'loan_officer', 'operations_manager'],
    variant: 'success',
  },
]

// ─── Role constants ────────────────────────────────────────────────────────────

const ALL_REPORT_ROLES = [
  'admin', 'ceo', 'finance', 'investor', 'partner', 'it',
  'operations_manager', 'area_manager', 'loan_officer', 'cashier',
]

const BORROWER_ROLES = [
  'admin', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager', 'loan_officer',
]

const RISK_ROLES = [
  'admin', 'finance', 'operations_manager', 'area_manager', 'loan_officer',
]

// Roles that can see anything under /stakeholders
// finance is included so they can reach the capital approval queue
const STAKEHOLDER_ROLES = [
  'admin', 'ceo', 'finance', 'investor', 'partner', 'area_manager',
]

// Roles that can read income / cashflow reports (not the capital page)
const STAKEHOLDER_REPORT_ROLES = [
  'admin', 'ceo', 'investor', 'partner', 'area_manager',
]

// Roles that can access capital transactions (submit or approve)
const CAPITAL_ROLES = [
  'admin', 'ceo', 'finance', 'investor', 'partner',
]

// ─── Nav items ────────────────────────────────────────────────────────────────

export const sidebarNavItems: SidebarNavItem[] = [
  // ── OPERATE: daily transactional work ─────────────────────────────────────
  {
    to: '/clients',
    label: 'Borrowers',
    section: 'operate',
    roles: BORROWER_ROLES,
    matchPrefixes: ['/clients', '/approvals'],
    children: [
      { to: '/clients',              label: 'All borrowers',     section: 'operate', roles: BORROWER_ROLES },
      { to: '/clients/dormant',      label: 'Dormant',           section: 'operate', roles: BORROWER_ROLES },
      { to: '/clients/reallocation', label: 'Reallocation',      section: 'operate', roles: ['admin', 'operations_manager', 'area_manager'] },
      { to: '/approvals',            label: 'Pending approvals', section: 'operate', roles: ['admin', 'finance', 'operations_manager', 'area_manager'] },
    ],
  },
  {
    to: '/loans',
    label: 'Loans',
    section: 'operate',
    roles: ['admin', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager', 'loan_officer', 'cashier'],
  },
  {
    to: '/collections',
    label: 'Collections',
    section: 'operate',
    roles: ['admin', 'loan_officer', 'cashier', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager'],
  },
  {
    to: '/guarantors',
    label: 'Risk & collateral',
    section: 'operate',
    roles: RISK_ROLES,
    matchPrefixes: ['/guarantors', '/collateral-assets'],
    children: [
      { to: '/guarantors',        label: 'Guarantors', section: 'operate', roles: RISK_ROLES },
      { to: '/collateral-assets', label: 'Collateral', section: 'operate', roles: RISK_ROLES },
    ],
  },

  // ── MEASURE: performance visibility ───────────────────────────────────────
  { to: '/dashboard',    label: 'Dashboard',    section: 'measure' },
  { to: '/reports',      label: 'Reports',      section: 'measure', roles: ALL_REPORT_ROLES },
  { to: '/accounting',   label: 'Accounting',   section: 'measure', roles: ['admin', 'finance', 'operations_manager'] },
  { to: '/mobile-money', label: 'Mobile money', section: 'measure', roles: ['admin', 'finance', 'operations_manager'] },
  {
    to: '/stakeholders',
    label: 'Stakeholders',
    section: 'measure',
    roles: STAKEHOLDER_ROLES,
    matchPrefixes: ['/stakeholders'],
    children: [
      {
        to: '/stakeholders/income',
        label: 'Monthly income',
        section: 'measure',
        roles: STAKEHOLDER_REPORT_ROLES,
      },
      {
        to: '/stakeholders/cashflow',
        label: 'Cash flow',
        section: 'measure',
        roles: STAKEHOLDER_REPORT_ROLES,
      },
      {
        to: '/stakeholders/capital',
        label: 'Capital',
        section: 'measure',
        roles: CAPITAL_ROLES,
      },
    ],
  },

  // ── CONFIGURE: infrequent admin (collapsed by default) ────────────────────
  { to: '/loans/products',   label: 'Loan products', section: 'configure', roles: ['admin'] },
  { to: '/admin/users',      label: 'Users',         section: 'configure', roles: ['admin'] },
  { to: '/admin/branches',   label: 'Branches',      section: 'configure', roles: ['admin'] },
  { to: '/admin/hierarchy',  label: 'Hierarchy',     section: 'configure', roles: ['admin'] },
  { to: '/admin/audit-logs', label: 'Audit logs',    section: 'configure', roles: ['admin'] },
  { to: '/search',           label: 'Search',        section: 'configure' },
  { to: '/profile',          label: 'Profile',       section: 'configure' },
]

// ─── Role filtering helpers ───────────────────────────────────────────────────

export function isSidebarItemVisibleForRole(item: SidebarNavItem, userOrRole: unknown): boolean {
  const currentItemVisible =
    !Array.isArray(item.roles) || item.roles.length === 0 || hasAnyRole(userOrRole, item.roles)
  const visibleChildren = Array.isArray(item.children)
    ? item.children.some((child) => isSidebarItemVisibleForRole(child, userOrRole))
    : false

  if (item.children?.length) {
    return currentItemVisible || visibleChildren
  }

  return currentItemVisible
}

export function filterSidebarItemsForRole(items: SidebarNavItem[], userOrRole: unknown): SidebarNavItem[] {
  return items
    .filter((item) => isSidebarItemVisibleForRole(item, userOrRole))
    .map((item) => ({
      ...item,
      children: Array.isArray(item.children)
        ? filterSidebarItemsForRole(item.children, userOrRole)
        : undefined,
    }))
}

export function filterQuickActionsForRole(actions: QuickAction[], userOrRole: unknown): QuickAction[] {
  return actions.filter(
    (action) => !action.roles || hasAnyRole(userOrRole, action.roles),
  )
}
