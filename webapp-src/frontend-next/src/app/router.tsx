import { Suspense, lazy, type ReactElement } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { RouteLoadingShell } from '../components/common/RouteLoadingShell'
import { PageShell } from '../components/layout/PageShell'
import { RequireAuth } from '../features/auth/components/RequireAuth'
import { RequireRole } from '../features/auth/components/RequireRole'
import { PublicOnlyRoute } from '../features/auth/components/PublicOnlyRoute'

const DashboardPage = lazy(() => import('../features/dashboard/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const ClientsPage = lazy(() => import('../features/clients/pages/ClientsPage').then((module) => ({ default: module.ClientsPage })))
const DormantClientsPage = lazy(() => import('../features/clients/pages/DormantClientsPage').then((module) => ({ default: module.DormantClientsPage })))
const ClientDetailPage = lazy(() => import('../features/clients/pages/ClientDetailPage').then((module) => ({ default: module.ClientDetailPage })))
const ClientReallocationPage = lazy(() => import('../features/clients/pages/ClientReallocationPage').then((module) => ({ default: module.ClientReallocationPage })))
const CreateClientPage = lazy(() => import('../features/clients/pages/CreateClientPage').then((module) => ({ default: module.CreateClientPage })))
const EditClientPage = lazy(() => import('../features/clients/pages/EditClientPage').then((module) => ({ default: module.EditClientPage })))
const LoansPage = lazy(() => import('../features/loans/pages/LoansPage').then((module) => ({ default: module.LoansPage })))
const CreateLoanPage = lazy(() => import('../features/loans/pages/CreateLoanPage').then((module) => ({ default: module.CreateLoanPage })))
const LoanDetailPage = lazy(() => import('../features/loans/pages/LoanDetailPage').then((module) => ({ default: module.LoanDetailPage })))
const LoanApprovalPage = lazy(() => import('../features/loans/pages/LoanApprovalPage').then((module) => ({ default: module.LoanApprovalPage })))
const RepaymentPage = lazy(() => import('../features/loans/pages/RepaymentPage').then((module) => ({ default: module.RepaymentPage })))
const LoanProductsPage = lazy(() => import('../features/loans/pages/LoanProductsPage').then((module) => ({ default: module.LoanProductsPage })))
const CollectionsPage = lazy(() => import('../features/collections/pages/CollectionsPage').then((module) => ({ default: module.CollectionsPage })))
const ReportsPage = lazy(() => import('../features/reports/pages/ReportsPage').then((module) => ({ default: module.ReportsPage })))
const AdminPage = lazy(() => import('../features/admin/pages/AdminPage').then((module) => ({ default: module.AdminPage })))
const UserManagementPage = lazy(() => import('../features/admin/pages/UserManagementPage').then((module) => ({ default: module.UserManagementPage })))
const BranchManagementPage = lazy(() => import('../features/admin/pages/BranchManagementPage').then((module) => ({ default: module.BranchManagementPage })))
const GuarantorsPage = lazy(() => import('../features/risk/pages/GuarantorsPage').then((module) => ({ default: module.GuarantorsPage })))
const CollateralAssetsPage = lazy(() => import('../features/risk/pages/CollateralAssetsPage').then((module) => ({ default: module.CollateralAssetsPage })))
const MobileMoneyDashboardPage = lazy(() => import('../features/mobile-money/pages/MobileMoneyDashboardPage').then((module) => ({ default: module.MobileMoneyDashboardPage })))
const AccountingDashboardPage = lazy(() => import('../features/accounting/pages/AccountingDashboardPage').then((module) => ({ default: module.AccountingDashboardPage })))
const AuditLogsPage = lazy(() => import('../features/system/pages/AuditLogsPage').then((module) => ({ default: module.AuditLogsPage })))
const HierarchyManagementPage = lazy(() => import('../features/system/pages/HierarchyManagementPage').then((module) => ({ default: module.HierarchyManagementPage })))
const ProfileSettingsPage = lazy(() => import('../features/account/pages/ProfileSettingsPage').then((module) => ({ default: module.ProfileSettingsPage })))
const SearchPage = lazy(() => import('../features/search/pages/SearchPage').then((module) => ({ default: module.SearchPage })))

function withSuspense(element: ReactElement, fallback: ReactElement = <RouteLoadingShell />) {
  return <Suspense fallback={fallback}>{element}</Suspense>
}

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
          { path: 'clients', element: withSuspense(<ClientsPage />) },
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
              { path: 'clients/new', element: withSuspense(<CreateClientPage />) },
              { path: 'clients/:id/edit', element: withSuspense(<EditClientPage />) },
              { path: 'loans/new', element: withSuspense(<CreateLoanPage />) },
            ],
          },
          { path: 'clients/:id', element: withSuspense(<ClientDetailPage />) },
          { path: 'loans', element: withSuspense(<LoansPage />) },
          { path: 'loans/:id', element: withSuspense(<LoanDetailPage />) },
          { path: 'loans/:id/repay', element: withSuspense(<RepaymentPage />) },
          { path: 'loans/products', element: withSuspense(<LoanProductsPage />) },
          {
            element: <RequireRole allowedRoles={['admin', 'finance', 'operations_manager', 'area_manager']} />,
            children: [
              { path: 'approvals', element: withSuspense(<LoanApprovalPage />) },
            ],
          },
          { path: 'collections', element: withSuspense(<CollectionsPage />) },
          { path: 'reports', element: withSuspense(<ReportsPage />) },
          { path: 'search', element: withSuspense(<SearchPage />) },
          { path: 'guarantors', element: withSuspense(<GuarantorsPage />) },
          { path: 'collateral-assets', element: withSuspense(<CollateralAssetsPage />) },
          { path: 'mobile-money', element: withSuspense(<MobileMoneyDashboardPage />) },
          { path: 'accounting', element: withSuspense(<AccountingDashboardPage />) },
          { path: 'profile', element: withSuspense(<ProfileSettingsPage />) },
          { path: 'admin', element: withSuspense(<AdminPage />) },
          { path: 'admin/users', element: withSuspense(<UserManagementPage />) },
          { path: 'admin/branches', element: withSuspense(<BranchManagementPage />) },
          { path: 'admin/audit-logs', element: withSuspense(<AuditLogsPage />) },
          { path: 'admin/hierarchy', element: withSuspense(<HierarchyManagementPage />) },
        ],
      },
    ],
  },
])
