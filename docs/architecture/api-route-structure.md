# API Route Structure

This document records the canonical API route structure exposed by the backend. Legacy routes may still exist for compatibility, but new clients should prefer the canonical paths below.

## Auth

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | User authentication |
| POST | `/api/auth/logout` | Session termination |
| POST | `/api/auth/refresh-token` | Token renewal |

## Users

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/users` | List users |
| GET | `/api/users/:id` | Get user details |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Deactivate user |
| POST | `/api/users/:id/roles` | Update role assignments |
| POST | `/api/users/:id/permissions` | Grant permission |

## Clients

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/clients` | List clients |
| GET | `/api/clients/:id` | Client details |
| POST | `/api/clients` | Register client |
| PUT | `/api/clients/:id` | Update client |
| POST | `/api/clients/:id/kyc` | KYC submission or update |
| GET | `/api/clients/:id/loans` | Client loans |

## Loans

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/loans` | List loans |
| GET | `/api/loans/:id` | Loan details |
| POST | `/api/loans` | Create loan |
| POST | `/api/loans/:id/submit` | Submit for approval |
| POST | `/api/loans/:id/approve` | Approve loan |
| POST | `/api/loans/:id/reject` | Reject loan |
| POST | `/api/loans/:id/disburse` | Disburse funds |
| POST | `/api/loans/:id/repay` | Record repayment |
| GET | `/api/loans/:id/statement` | Loan statement |
| GET | `/api/loans/:id/schedule` | Repayment schedule |

## Approval Requests

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/approval-requests` | List requests |
| GET | `/api/approval-requests/:id` | Request details |
| POST | `/api/approval-requests/:id/approve` | Approve request |
| POST | `/api/approval-requests/:id/reject` | Reject request |

## Collections

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/collections/actions` | List collections/actions |
| POST | `/api/collections/actions` | Create action |
| GET | `/api/collections/overdue` | Overdue report |
| GET | `/api/collections/summary` | Collection summary |

## Branches

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/branches` | List branches |
| GET | `/api/branches/:id` | Branch details |
| POST | `/api/branches` | Create branch |
| PUT | `/api/branches/:id` | Update branch |

## Reports

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/reports/filter-options` | Available filters |
| GET | `/api/reports/clients` | Customer list |
| GET | `/api/reports/loans-due` | Due report |
| GET | `/api/reports/disbursements` | Disbursement report |
| GET | `/api/reports/daily-collections` | Daily collections |
| GET | `/api/reports/portfolio` | OLB report |
| GET | `/api/reports/collections` | Collections summary |
| GET | `/api/reports/officer-performance` | Officer metrics |
| GET | `/api/reports/arrears` | Arrears and red flags |
| GET | `/api/reports/aging` | Portfolio aging |
| GET | `/api/reports/income-statement` | Income statement |
| GET | `/api/reports/board-summary` | Executive summary |

## System

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/system/health` | Health check |
| GET | `/api/system/config` | Configuration |
| GET | `/api/system/status` | System status |

Notes:
- Some legacy routes remain for backward compatibility, including `/api/auth/refresh`, `/api/users/:id/profile`, `/api/users/:id/role`, `/api/clients/:id` with `PATCH`, and `/api/reports/dues`.
- This document reflects the canonical route structure verified by `tests/api-route-structure.test.ts`.