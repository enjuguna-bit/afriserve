import { Suspense, lazy, type ReactElement } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { RouteLoadingShell } from '../components/common/RouteLoadingShell'
import { PageShell } from '../components/layout/PageShell'
import { RequireAuth } from '../features/auth/components/RequireAuth'
import { RequireRole } from '../features/auth/components/RequireRole'
import { PublicOnlyRoute } from '../features/auth/components/PublicOnlyRoute'

const DashboardPage          = lazy(() => import('../features/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const LoginPage               = lazy(() => import('../features/auth/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const ClientsPage             = lazy(() => import('../features/clients/pages/ClientsPage').then((m) => ({ default: m.ClientsPage })))
const DormantClientsPage      = lazy(() => import('../features/clients/pages/DormantClientsPage').then((m) => ({ default: m.DormantClientsPage })))
const ClientDetailPage        = lazy(() => import('../features/clients/pages/ClientDetailPage').then((m) => ({ default: m.ClientDetailPage })))
const ClientReallocationPage  = lazy(() => import('../features/clients/pages/ClientReallocationPage').then((m) => ({ default: m.ClientReallocationPage })))
const CreateClientPage        = lazy(() => import('../features/clients/pages/CreateClientPage').then((m) => ({ default: m.CreateClientPage })))
const EditClientPage          = lazy(() => import('../features/clients/pages/EditClientPage').then((m) => ({ default: m.EditClientPage })))
const LoansPage               = lazy(() => import('../features/loans/pages/LoansPage').then((m) => ({ default: m.LoansPage })))
const CreateLoanPage          = lazy(() => import('../features/loans/pages/CreateLoanPage').then((m) => ({ default: m.CreateLoanPage })))
const LoanDetailPage          = lazy(() => import('../features/loans/pages/LoanDetailPage').then((m) => ({ default: m.LoanDetailPage })))
const LoanApprovalPage        = lazy(() => import('../features/loans/pages/LoanApprovalPage').then((m) => ({ default: m.LoanApprovalPage })))
const RepaymentPage           = lazy(() => import('../features/loans/pages/RepaymentPage').then((m) => ({ default: m.RepaymentPage })))
const LoanProductsPage        = lazy(() => import('../features/loans/pages/LoanProductsPage').then((m) => ({ default: m.LoanProductsPage })))
const CollectionsPage         = lazy(() => import('../features/collections/pages/CollectionsPage').then((m) => ({ default: m.CollectionsPage })))
const ReportsPage             = lazy(() => import('../features/reports/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const AdminPage               = lazy(() => import('../features/admin/pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const UserManagementPage      = lazy(() => import('../features/admin/pages/UserManagementPage').then((m) => ({ default: m.UserManagementPage })))
const BranchManagementPage    = lazy(() => import('../features/admin/pages/BranchManagementPage').then((m) => ({ default: m.BranchManagementPage })))
const GuarantorsPage          = lazy(() => import('../features/risk/pages/GuarantorsPage').then((m) => ({ default: m.GuarantorsPage })))
const CollateralAssetsPage    = lazy(() => import('../features/risk/pages/CollateralAssetsPage').then((m) => ({ default: m.CollateralAssetsPage })))
const MobileMoneyDashboardPage = lazy(() => import('../features/mobile-money/pages/MobileMoneyDashboardPage').then((m) => ({ default: m.MobileMoneyDashboardPage })))
const AccountingDashboardPage = lazy(() => import('../features/accounting/pages/AccountingDashboardPage').then((m) => ({ default: m.AccountingDashboardPage })))
const AuditLogsPage           = lazy(() => import('../features/system/pages/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })))
const HierarchyManagementPage = lazy(() => import('../features/system/pages/HierarchyManagementPage').then((m) => ({ default: m.HierarchyManagementPage })))
const ProfileSettingsPage     = lazy(() => import('../features/account/pages/ProfileSettingsPage').then((m) => ({ default: m.ProfileSettingsPage })))
const SearchPage              = lazy(() => import('../features/search/pages/SearchPage').then((m) => ({ default: m.SearchPage })))

// Stakeholder pages
const StakeholderIncomePage      = lazy(() => import('../features/stakeholders/pages/StakeholderIncomePage').then((m) => ({ default: m.StakeholderIncomePage })))
const StakeholderCashFlowPage    = lazy(() => import('../features/stakeholders/pages/StakeholderCashFlowPage').then((m) => ({ default: m.StakeholderCashFlowPage })))
const CapitalTransactionsPage    = lazy(() => import('../features/stakeholders/pages/CapitalTransactionsPage').then((m) => ({ default: m.CapitalTransactionsPage })))

function withSuspense(element: ReactElement, fallback: ReactElement = <RouteLoadingShell />) {
  return <Suspense fallback={fallback}>{element}</Suspense>
}

// Roles for income / cashflow reports
const STAKEHOLDER_REPORT_ROLES = ['admin', 'ceo', 'investor', 'partner', 'area_manager'] as const

// Roles for capital transactions (submitters + approvers)
const CAPITAL_ROLES = ['admin', 'ceo', 'finance', 'investor', 'partner'] as const

export const appRouter = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicOnlyRoute>
        {withSuspense(<LoginPage />, <RouteLoadingShell variant="auth" />)}
      </PublicOnlyRoute>
    ),
  },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <PageShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: withSuspense(<DashboardPage />) },

          // ── Clients ──────────────────────────────────────────────────────
          { path: 'clients',         element: withSuspense(<ClientsPage />) },
          { path: 'clients/dormant', element: withSuspense(<DormantClientsPage />) },
          {
            element: <RequireRole allowedRoles={['admin', 'operations_manager', 'area_manager']} />,
            children: [
              { path: 'clients/reallocation', element: withSuspense(<ClientReallocationPage />) },
            ],
          },
          {
            element: <RequireRole allowedRoles={['admin', 'loan_officer']} />,
            children: [
              { path: 'clients/new',       element: withSuspense(<CreateClientPage />) },
              { path: 'clients/:id/edit',  element: withSuspense(<EditClientPage />) },
              { path: 'loans/new',         element: withSuspense(<CreateLoanPage />) },
            ],
          },
          { path: 'clients/:id', element: withSuspense(<ClientDetailPage />) },

          // ── Loans ─────────────────────────────────────────────────────────
          { path: 'loans',             element: withSuspense(<LoansPage />) },
          { path: 'loans/:id',         element: withSuspense(<LoanDetailPage />) },
          { path: 'loans/:id/repay',   element: withSuspense(<RepaymentPage />) },
          { path: 'loans/products',    element: withSuspense(<LoanProductsPage />) },
          {
            element: <RequireRole allowedRoles={['admin', 'finance', 'operations_manager', 'area_manager']} />,
            children: [
              { path: 'approvals', element: withSuspense(<LoanApprovalPage />) },
            ],
          },

          // ── Operations ───────────────────────────────────────────────────
          { path: 'collections',       element: withSuspense(<CollectionsPage />) },
          { path: 'reports',           element: withSuspense(<ReportsPage />) },
          { path: 'search',            element: withSuspense(<SearchPage />) },
          { path: 'guarantors',        element: withSuspense(<GuarantorsPage />) },
          { path: 'collateral-assets', element: withSuspense(<CollateralAssetsPage />) },
          { path: 'mobile-money',      element: withSuspense(<MobileMoneyDashboardPage />) },
          { path: 'accounting',        element: withSuspense(<AccountingDashboardPage />) },

          // ── Profile & admin ──────────────────────────────────────────────
          { path: 'profile',            element: withSuspense(<ProfileSettingsPage />) },
          { path: 'admin',              element: withSuspense(<AdminPage />) },
          { path: 'admin/users',        element: withSuspense(<UserManagementPage />) },
          { path: 'admin/branches',     element: withSuspense(<BranchManagementPage />) },
          { path: 'admin/audit-logs',   element: withSuspense(<AuditLogsPage />) },
          { path: 'admin/hierarchy',    element: withSuspense(<HierarchyManagementPage />) },

          // ── Stakeholders ─────────────────────────────────────────────────
          // Income and cashflow: read-only, no finance needed
          {
            path: 'stakeholders',
            element: <RequireRole allowedRoles={[...STAKEHOLDER_REPORT_ROLES, 'finance']} />,
            children: [
              {
                element: <RequireRole allowedRoles={[...STAKEHOLDER_REPORT_ROLES]} />,
                children: [
                  { path: 'income',   element: withSuspense(<StakeholderIncomePage />) },
                  { path: 'cashflow', element: withSuspense(<StakeholderCashFlowPage />) },
                ],
              },
              // Capital: submitters + finance approvers
              {
                element: <RequireRole allowedRoles={[...CAPITAL_ROLES]} />,
                children: [
                  { path: 'capital', element: withSuspense(<CapitalTransactionsPage />) },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
])
