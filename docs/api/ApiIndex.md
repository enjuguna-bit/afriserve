# API Documentation Index

**Version:** 1.0  
**Base URL:** `/api/v1`

---

## Overview

The Afriserve microfinance API provides programmatic access to loan management, client administration, and financial reporting.

## Authentication

All endpoints (except auth endpoints) require JWT Bearer authentication:

```
Authorization: Bearer <token>
```

### Auth Endpoints (Public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/reset-password/request` | Request password reset |
| POST | `/api/auth/reset-password/confirm` | Confirm password reset |

### Auth Endpoints (Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/change-password` | Change password |

---

## Users

### List Users
```
GET /api/users
```
**Roles:** admin

**Query Parameters:**
- `role` - Filter by role
- `isActive` - Filter by active status (true/false)
- `branchId` - Filter by branch
- `regionId` - Filter by region
- `search` - Search by name/email
- `limit` - Page size (default: 50)
- `offset` - Pagination offset
- `sortBy` - Sort field (createdAt, fullName, email)
- `sortOrder` - asc/desc

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "fullName": "Jane Doe",
      "email": "jane@afriserve.local",
      "role": "admin",
      "isActive": true,
      "branchId": 5,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "paging": { "total": 100, "limit": 50, "offset": 0 }
}
```

### Create User
```
POST /api/users
```
**Roles:** admin, it

**Body:**
```json
{
  "fullName": "John Smith",
  "email": "john@afriserve.local",
  "password": "SecurePass@123",
  "role": "loan_officer",
  "branchId": 7
}
```

### Get User
```
GET /api/users/:id
```

### Update User Profile
```
PATCH /api/users/:id/profile
```

### Update User Role
```
PATCH /api/users/:id/role
```

### Deactivate User
```
POST /api/users/:id/deactivate
```

### Activate User
```
POST /api/users/:id/activate
```

---

## Clients

### Create Client
```
POST /api/clients
```
**Roles:** admin, loan_officer, operations_manager

**Body:**
```json
{
  "fullName": "Jane Doe",
  "phone": "+254700000001",
  "nationalId": "12345678",
  "branchId": 7
}
```

### List Clients
```
GET /api/clients
```
**Roles:** admin, ceo, operations_manager, it, area_manager, loan_officer

**Query Parameters:**
- `search` - Search by name
- `minLoans` - Minimum loan count
- `limit`, `offset` - Pagination
- `sortBy`, `sortOrder` - Sorting

### Get Client
```
GET /api/clients/:id
```

### Update Client
```
PATCH /api/clients/:id
```

### Update Client KYC
```
PATCH /api/clients/:id/kyc
```
**Body:**
```json
{
  "status": "verified",
  "note": "All documents validated"
}
```

---

## Loans

### Create Loan Application
```
POST /api/loans
```
**Roles:** admin, loan_officer, operations_manager

**Body:**
```json
{
  "clientId": 1,
  "principal": 10000,
  "termWeeks": 12,
  "branchId": 7,
  "purpose": "business_capital"
}
```

### List Loans
```
GET /api/loans
```
**Query Parameters:**
- `status` - Filter by status
- `clientId` - Filter by client
- `includeBreakdown` - Include installment breakdown
- `limit`, `offset`, `sortBy`, `sortOrder`

**Status Values:**
- `pending_approval` - Awaiting approval
- `approved` - Approved, awaiting disbursement
- `active` - Disbursed and active
- `overdue` - Has overdue installments
- `restructured` - Terms modified
- `closed` - Fully repaid
- `written_off` - Written off
- `rejected` - Application rejected

### Get Loan
```
GET /api/loans/:id
```

### Get Loan Schedule
```
GET /api/loans/:id/schedule
```

### Approve Loan
```
POST /api/loans/:id/approve
```
**Roles:** admin, operations_manager

### Disburse Loan
```
POST /api/loans/:id/disburse
```
**Roles:** admin, operations_manager, cashier, finance

### Record Repayment
```
POST /api/loans/:id/repayments
```
**Body:**
```json
{
  "amount": 150,
  "note": "Weekly collection"
}
```

### Restructure Loan
```
POST /api/loans/:id/restructure
```

### Write Off Loan
```
POST /api/loans/:id/write-off
```

---

## Reports

### Portfolio Report
```
GET /api/reports/portfolio
GET /api/reports/portfolio?format=csv
GET /api/reports/portfolio?format=pdf
GET /api/reports/portfolio?includeBreakdown=true
```

### Board Summary
```
GET /api/reports/board-summary
```

### Hierarchy Performance
```
GET /api/reports/hierarchy/performance
```

### Collections Summary
```
GET /api/reports/collections-summary
```

---

## System

### Health Check
```
GET /health
GET /health/details
```

### Metrics
```
GET /metrics
```
Returns Prometheus-compatible metrics.

### Ready Check
```
GET /ready
GET /api/ready
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  },
  "requestId": "uuid"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/*` | 20 requests | 15 minutes |
| `/api/*` (general) | 200 requests | 1 minute |

---

## Pagination

All list endpoints return paginated results:

```json
{
  "data": [...],
  "paging": {
    "total": 100,
    "limit": 50,
    "offset": 0
  },
  "sort": {
    "sortBy": "createdAt",
    "sortOrder": "desc"
  }
}
```

---

## Common Field Types

| Field | Format | Example |
|-------|--------|---------|
| Dates | ISO 8601 | `2024-01-15T10:30:00Z` |
| Money | Number (KES) | `10000.00` |
| Phone | E.164 | `+254700000000` |
| National ID | String | `12345678` |
