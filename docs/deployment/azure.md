# Azure Deployment Guide

## Recommended target architecture

- `frontend-next` -> Azure Static Web Apps
- Root backend (`Dockerfile`) -> Azure Container Apps
- Primary database -> Azure Database for PostgreSQL Flexible Server
- Cache / rate limiting / queue backend -> Azure Managed Redis
- File uploads -> Azure Files mounted into the backend container at `/app/data/uploads`

## Why this fits the current repo

- The backend already has a production Dockerfile and health endpoints.
- The app already supports PostgreSQL through `DB_CLIENT=postgres` and `DATABASE_URL`.
- The app already supports Redis-backed token storage, session cache, rate limiting, job queues, and report caching through environment variables.
- The React frontend in `frontend-next` is a Vite SPA and maps cleanly to Azure Static Web Apps.
- The current upload service only supports `local` and `s3`. Azure Files is the lowest-risk Azure-native option because it works with the existing `local` driver and avoids adding a new storage driver before go-live.

## Recommended deployment shape

### Frontend

Deploy `frontend-next` to Azure Static Web Apps.

Use these Static Web Apps build settings:

- `app_location`: `frontend-next`
- `output_location`: `dist`
- `app_build_command`: `npm run build`

This repo now includes `frontend-next/public/staticwebapp.config.json` so browser-route refreshes fall back to `index.html`.

### Backend

Deploy the root app container to Azure Container Apps using the existing `Dockerfile`.

Recommended Container Apps settings:

- Ingress: external
- Target port: `3000`
- Transport: HTTP
- Health endpoint: `/health`
- Readiness endpoint: `/ready` or `/api/ready`

Mount an Azure Files share into the container at:

- `/app/data/uploads`

Then keep:

- `UPLOAD_STORAGE_DRIVER=local`
- `UPLOAD_LOCAL_DIR=/app/data/uploads`

### Database

Use Azure Database for PostgreSQL Flexible Server.

This app should not run on SQLite in Azure production. The repo already blocks `DB_CLIENT=sqlite` in production unless you override it explicitly.

Recommended connection string pattern:

```env
DATABASE_URL=postgresql://<user>:<password>@<server>.postgres.database.azure.com:5432/<database>?sslmode=require
```

If you later want stricter certificate validation, move to `sslmode=verify-full` with a trusted root certificate path.

### Redis

Use Azure Managed Redis for:

- `AUTH_TOKEN_STORE_REDIS_URL`
- `AUTH_SESSION_CACHE_REDIS_URL`
- `RATE_LIMIT_REDIS_URL`
- `JOB_QUEUE_REDIS_URL`
- `REPORT_CACHE_REDIS_URL`

Use `rediss://...` endpoints in production.

## Minimum backend environment variables for Azure

```env
NODE_ENV=production
PORT=3000

DB_CLIENT=postgres
DATABASE_URL=postgresql://<user>:<password>@<server>.postgres.database.azure.com:5432/<database>?sslmode=require

JWT_SECRET=<long-random-secret>
JWT_SECRETS=

TRUST_PROXY=true
HTTPS_ENFORCE_IN_PRODUCTION=true
HTTPS_TRUST_FORWARDED_PROTO=true
ALLOW_CONSOLE_RESET_TOKENS=false

CORS_ORIGINS=https://<your-static-web-app-domain>
API_BASE_URL=https://<your-api-domain>

UPLOAD_STORAGE_DRIVER=local
UPLOAD_LOCAL_DIR=/app/data/uploads
UPLOAD_PUBLIC_BASE_URL=https://<your-api-domain>/uploads

AUTH_TOKEN_STORE_REDIS_URL=rediss://<redis-endpoint>:6380
AUTH_SESSION_CACHE_REDIS_URL=rediss://<redis-endpoint>:6380
RATE_LIMIT_REDIS_URL=rediss://<redis-endpoint>:6380
JOB_QUEUE_ENABLED=true
JOB_QUEUE_REDIS_URL=rediss://<redis-endpoint>:6380
REPORT_CACHE_ENABLED=true
REPORT_CACHE_REDIS_URL=rediss://<redis-endpoint>:6380
```

## Frontend environment variables for Azure

For `frontend-next`:

```env
VITE_APP_ENV=production
VITE_API_BASE_URL=https://<your-api-domain>/api
VITE_API_TIMEOUT_MS=15000
VITE_LOG_LEVEL=warn
```

## Azure Web App source deployment

If you continue deploying this repo directly to Azure App Service / Web Apps with Oryx build and ZipDeploy, the root `npm run build` now embeds `frontend-next` into `dist/frontend-next` and the Node server serves that SPA in preference to the legacy `public` dashboard.

For same-origin Web App deployments, the embedded frontend build defaults to:

```env
VITE_APP_ENV=production
VITE_API_BASE_URL=/api
VITE_API_TIMEOUT_MS=15000
VITE_LOG_LEVEL=warn
```

You can override those values with build-time environment variables if needed.

## Azure cutover sequence

1. Provision PostgreSQL Flexible Server.
2. Provision Azure Managed Redis.
3. Provision an Azure Storage account and Azure Files share for uploads.
4. Provision Azure Container Registry and Azure Container Apps environment.
5. Build and push the backend image to ACR.
6. Create the backend Container App with external ingress on target port `3000`.
7. Attach the Azure Files share to the Container App and mount it at `/app/data/uploads`.
8. Apply the PostgreSQL schema with `npm run prisma:migrate`.
9. Migrate data from SQLite to PostgreSQL with the existing script:

   ```bash
   SQLITE_MIGRATION_SOURCE=<path-to-your-sqlite-db> DATABASE_URL=<postgres-url> npm run migrate:postgres
   ```

10. Deploy `frontend-next` to Azure Static Web Apps with `VITE_API_BASE_URL` pointing at the backend Container App URL.
11. Update `CORS_ORIGINS` on the backend to the final frontend domain.
12. Add custom domains and TLS certificates after functional verification.

## Data migration notes

- The repo already contains a SQLite -> PostgreSQL migration script at `scripts/migrate_sqlite_to_postgres.ts`.
- The target PostgreSQL schema must already exist before running the migration.
- Run the migration from a machine or runner that can access both:
  - the SQLite source file
  - the Azure PostgreSQL target

## Two viable rollout options

### Recommended

- Static Web Apps for `frontend-next`
- Container Apps for the API
- PostgreSQL Flexible Server
- Azure Managed Redis
- Azure Files for uploads

This gives the cleanest long-term platform fit.

### Fastest lift-and-shift

- Skip `frontend-next`
- Deploy only the backend container to Container Apps
- Continue serving the legacy `public` dashboard from the backend

This is simpler, but it leaves the newer React frontend unused.

### Current Azure Web App parity path

- Keep the existing Azure Web App source deployment
- Let the root build embed `frontend-next` into the backend artifact
- Serve the React SPA from the Node app on the same hostname

This is the lowest-effort way to make Azure match the current local React frontend without splitting services first.

## Known Azure-specific considerations

- Azure Container Apps doesn't mount Azure Blob Storage as a file volume. Use Azure Files if you want to keep the current local upload driver.
- If you split frontend and backend across different domains, `CORS_ORIGINS` must include the Static Web Apps hostname or custom domain.
- The backend expects forwarded headers in production. Keep `TRUST_PROXY=true`.
- If you enable private networking for PostgreSQL, run the backend in the same reachable network path.

## Suggested next automation step

After the target architecture is confirmed, add:

- Azure Bicep or Terraform for infra
- GitHub Actions for:
  - backend image build/push/deploy
  - frontend Static Web Apps deploy

## Reference docs

- Azure Static Web Apps configuration: https://learn.microsoft.com/en-us/azure/static-web-apps/configuration
- Azure Static Web Apps build configuration: https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration
- Azure Container Apps ingress: https://learn.microsoft.com/en-us/azure/container-apps/ingress-how-to
- Azure Container Apps environment variables: https://learn.microsoft.com/en-us/azure/container-apps/environment-variables
- Azure Container Apps storage mounts: https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts
- Azure Database for PostgreSQL Flexible Server overview: https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview
- Azure Database for PostgreSQL TLS: https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/security-tls
- Azure Managed Redis overview: https://learn.microsoft.com/en-us/azure/redis/overview
- Azure Cache for Redis retirement timeline: https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-whats-new
