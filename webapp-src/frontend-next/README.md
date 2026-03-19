# Afriserve Frontend (React + Vite)

Production-oriented frontend for the Afriserve microfinance platform.

## Features

- JWT-authenticated app shell with protected routes
- Dashboard with board-grade sustainability KPIs (portfolio quality, PAR risk, collections coverage)
- Clients, loans, collections, reports, and admin feature modules
- React Query data fetching with cache policies
- Theme synchronization with persisted UI state

## Prerequisites

- Node.js 20+
- Backend API running (default local target: `http://localhost:4014`)

## Environment

Create local env file from template:

```bash
copy .env.example .env
```

Variables:

- `VITE_API_BASE_URL` API base used by Axios (default: `/api`)
- `VITE_API_TIMEOUT_MS` request timeout in milliseconds (default: `15000`)
- `VITE_API_PROXY_TARGET` Vite dev proxy target for `/api` (default: `http://localhost:4014`)

## Development

From workspace root:

```bash
npm --prefix frontend-next install
npm --prefix frontend-next run dev
```

Or from `frontend-next/`:

```bash
npm install
npm run dev
```

## Build

```bash
npm --prefix frontend-next run build
```

## Production deployment notes

- Build output is generated in `frontend-next/dist/`.
- Serve the static assets behind a reverse proxy/CDN.
- Route `/api/*` traffic to the backend service.
- Ensure backend CORS allows your frontend origin via `CORS_ORIGINS`.
- Keep `VITE_API_BASE_URL` aligned with your deployment routing (for same-origin setups, use `/api`).

## Operational hardening included

- Global Axios timeout to prevent hanging UI calls
- Automatic session clearing + redirect to `/login` on `401 Unauthorized`
- Environment-driven API proxy target for flexible staging/production setups
