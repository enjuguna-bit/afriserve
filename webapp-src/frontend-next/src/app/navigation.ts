export type SidebarNavItem = {
  to: string
  label: string
  roles?: string[]
  section?: string
  children?: SidebarNavItem[]
  matchPrefixes?: string[]
}

import { hasAnyRole } from './roleAccess'

const ALL_REPORT_ROLES = [
  'admin',
  'ceo',
  'finance',
  'investor',
  'partner',
  'it',
  'operations_manager',
  'area_manager',
  'loan_officer',
  'cashier',
]

export const sidebarNavItems: SidebarNavItem[] = [
  { to: '/dashboard', label: 'Dashboard', section: 'Workspace' },
  { to: '/search', label: 'Search', section: 'Workspace' },
  {
    to: '/clients',
    label: 'Borrowers',
    roles: ['admin', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager', 'loan_officer'],
    section: 'Portfolio',
    matchPrefixes: ['/clients', '/approvals'],
    children: [
      { to: '/clients', label: 'List', roles: ['admin', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager', 'loan_officer'] },
      { to: '/clients/dormant', label: 'Dormant', roles: ['admin', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager', 'loan_officer'] },
      { to: '/clients/reallocation', label: 'Reallocation', roles: ['admin', 'operations_manager', 'area_manager'] },
      { to: '/approvals', label: 'Approval', roles: ['admin', 'finance', 'operations_manager', 'area_manager'] },
    ],
  },
  { to: '/loans', label: 'Loans', roles: ['admin', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager', 'loan_officer', 'cashier'], section: 'Portfolio' },
  { to: '/collections', label: 'Collections', roles: ['admin', 'loan_officer', 'cashier', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager'], section: 'Portfolio' },
  { to: '/guarantors', label: 'Guarantors', roles: ['admin', 'finance', 'operations_manager', 'area_manager', 'loan_officer'], section: 'Risk & Controls' },
  { to: '/collateral-assets', label: 'Collateral', roles: ['admin', 'finance', 'operations_manager', 'area_manager', 'loan_officer'], section: 'Risk & Controls' },
  { to: '/reports', label: 'Reports', roles: ALL_REPORT_ROLES, section: 'Insight' },
  { to: '/mobile-money', label: 'Mobile Money', roles: ['admin', 'finance', 'operations_manager'], section: 'Insight' },
  { to: '/accounting', label: 'Accounting', roles: ['admin', 'finance', 'operations_manager'], section: 'Insight' },
  { to: '/profile', label: 'Profile', section: 'Account' },
  { to: '/loans/products', label: 'Loan Products', roles: ['admin'], section: 'Administration' },
  { to: '/admin', label: 'Admin', roles: ['admin'], section: 'Administration' },
  { to: '/admin/users', label: 'Users', roles: ['admin'], section: 'Administration' },
  { to: '/admin/branches', label: 'Branches', roles: ['admin'], section: 'Administration' },
  { to: '/admin/hierarchy', label: 'Hierarchy', roles: ['admin'], section: 'Administration' },
  { to: '/admin/audit-logs', label: 'Audit Logs', roles: ['admin'], section: 'Administration' },
]

export function isSidebarItemVisibleForRole(item: SidebarNavItem, userOrRole: unknown): boolean {
  const currentItemVisible = !Array.isArray(item.roles) || item.roles.length === 0 || hasAnyRole(userOrRole, item.roles)
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
      children: Array.isArray(item.children) ? filterSidebarItemsForRole(item.children, userOrRole) : undefined,
    }))
}
