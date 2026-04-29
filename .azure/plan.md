# Azure Deployment Plan

> **Status:** Deployed

Generated: 2026-04-04 14:23:58 +03:00

---

## 1. Project Overview

**Goal:** Prepare a clean, repo-managed Azure deployment for AfriserveBackend, validate it, and then deploy it without relying on the existing hard-coded PowerShell scripts.

**Path:** Modernize Existing

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | Development |
| Scale | Small |
| Budget | Cost-Optimized |
| **Subscription** | Azure for Students (`5dd22bbf-548f-4b9e-bcfc-5be366d6dbbe`) |
| **Location** | `southafricanorth` |

**Sizing note:** This plan intentionally targets a lean dev/staging footprint because Azure for Students subscriptions are not eligible for quota increases and are a poor fit for first-pass production overprovisioning.

---

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| `frontend-next` | Frontend | React 19 + Vite | `frontend-next` |
| `afriserve-api` | API | Node.js 22 + TypeScript + Express + Prisma | `src/server.ts` |
| `afriserve-queue-worker` | Worker | Node.js 22 + TypeScript + BullMQ | `src/worker.ts` |
| `postgres-schema` | Data layer | Prisma PostgreSQL schema + migrations | `prisma/postgres` |
| `container-image` | Build artifact | Multi-stage Docker build embedding frontend into the runtime image | `Dockerfile` |

---

## 4. Recipe Selection

**Selected:** Bicep

**Rationale:** The repo has no `azure.yaml`, no `infra/` directory, and `azd` is not installed locally. The existing `deploy-app.ps1` and `deploy-infra.ps1` scripts hard-code resource names and secrets, so a Bicep-based deployment is the cleanest way to create repeatable, reviewable infrastructure with the Azure CLI already available in this environment.

---

## 5. Architecture

**Stack:** Containers

### Service Mapping

| Component | Azure Service | SKU |
|-----------|---------------|-----|
| `frontend-next` + `afriserve-api` | Azure Container Apps | Consumption profile, same image, web ingress on port `3000` |
| `afriserve-queue-worker` | Azure Container Apps | Consumption profile, separate worker app using the same image with worker startup command |
| PostgreSQL primary database | Azure Database for PostgreSQL Flexible Server | Burstable `Standard_B1ms` initially |
| Redis for auth/session/rate-limit/queue | Azure Cache for Redis | Basic C0 for the first rollout |
| Uploads volume | Azure Storage Account + Azure Files share | `Standard_LRS` |
| Container images | Azure Container Registry | `Basic` |

### Supporting Services

| Service | Purpose |
|---------|---------|
| Log Analytics | Centralized container and platform logging |
| Application Insights | Request tracing, dependency telemetry, and exception capture |
| Key Vault | Secret storage for JWT, database, Redis, and M-Pesa credentials |
| Managed Identity | Key Vault access and ACR pulls without embedded credentials |

### Architecture Notes

- The web container will serve the embedded `frontend-next` build from the existing Dockerfile so we avoid introducing Static Web Apps in the first Azure rollout.
- The worker stays separate because the repo has a real long-running queue worker entrypoint and the runtime config supports role separation through `JOB_QUEUE_ROLE`.
- This first deployment will stay public-networked and TLS-only to keep the student-subscription footprint viable. Private networking can be added later on a paid subscription.

---

## 6. Provisioning Limit Checklist

**Purpose:** Validate that the selected subscription and region have sufficient quota/capacity for all resources to be deployed.

### Phase 1: Prepare Resource Inventory

The target footprint is one resource group containing one Container Apps environment, two Container Apps, one PostgreSQL Flexible Server, one Azure Managed Redis instance, one storage account with an Azure Files share, one ACR registry, one Key Vault, one Log Analytics workspace, and one Application Insights component.

### Phase 2: Fetch Quotas and Validate Capacity

| Resource Type | Number to Deploy | Total After Deployment | Limit/Quota | Notes |
|---------------|------------------|------------------------|-------------|-------|
| `Microsoft.App/managedEnvironments` | 1 | 1 | 50 per region | `az quota list` was attempted first and returned `MissingRegistrationForResourceProvider` for `Microsoft.Quota`; current usage in `southafricanorth` is `0` via `az resource list`; provider metadata confirms South Africa North support. |
| `Microsoft.App/containerApps` | 2 | 2 | 500 apps per environment | Current usage in `southafricanorth` is `0` via `az resource list`; provider metadata confirms South Africa North support; planned total is well below the published per-environment hard limit. |
| `Microsoft.DBforPostgreSQL/flexibleServers` | 1 | 1 | Region supports Burstable and General Purpose SKUs; one server planned within product limits | Current usage in `southafricanorth` is `0` via `az resource list`; provider metadata confirms South Africa North support; `az postgres flexible-server list-skus --location southafricanorth` returned valid SKUs including `Standard_B1ms` and `Standard_B2s`. |
| `Microsoft.Cache/Redis` | 1 | 1 | Region supported; one cache planned within product limits | Current usage in `southafricanorth` is `0` via `az resource list`; provider metadata confirms South Africa North support for classic Redis and the rollout uses the smallest Basic tier for subscription safety. |
| `Microsoft.Storage/storageAccounts` | 1 | 1 | 250 per region by default, 500 by request | `az quota list` was attempted first and returned `MissingRegistrationForResourceProvider` for `Microsoft.Quota`; current usage in `southafricanorth` is `0` via `az resource list`; official Azure limits documentation publishes the 250 default. |
| `Microsoft.ContainerRegistry/registries` | 1 | 1 | 10 per subscription per region | `az quota list` returned `BadRequest`; current usage in `southafricanorth` is `0` via `az resource list`; official Azure limits documentation publishes the per-region limit. |
| `Microsoft.KeyVault/vaults` | 1 | 1 | Supported in South Africa North; single-vault plan is within a clean subscription footprint | Current usage in `southafricanorth` is `0` via `az resource list`; provider metadata confirms South Africa North support. |
| `Microsoft.OperationalInsights/workspaces` | 1 | 1 | Supported in South Africa North; single-workspace plan is within a clean subscription footprint | Current usage in `southafricanorth` is `0` via `az resource list`; provider metadata confirms South Africa North support. |
| `Microsoft.Insights/components` | 1 | 1 | Single component plan is within a clean subscription footprint | Current usage in `southafricanorth` is `0` via `az resource list`; this is a minimal single-component deployment. |

**Status:** OK - The proposed `southafricanorth` footprint fits the current empty-subscription resource inventory for a small dev/staging deployment.

**Capacity caveat:** Because this is an Azure for Students subscription, quota increases are effectively off the table. The deployment should stay on the lean path above until the subscription is upgraded.

---

## 7. Execution Checklist

### Phase 1: Planning
- [x] Analyze workspace
- [x] Gather requirements
- [x] Confirm subscription and location with user
- [x] Prepare resource inventory
- [x] Fetch quotas and validate capacity
- [x] Scan codebase
- [x] Select recipe
- [x] Plan architecture
- [x] **User approved this plan**

### Phase 2: Execution
- [x] Research components (load references, invoke skills)
- [x] Generate infrastructure files following service-specific guidance
- [x] Generate deployment parameters and configuration templates
- [x] Generate deployment/runbook documentation
- [x] Update plan status to `Ready for Validation`

### Phase 3: Validation
- [x] Invoke azure-validate skill
- [x] All validation checks pass
- [x] Bicep compilation (`az bicep build --file infra/main.bicep`)
- [x] Foundation template validation (`az deployment group validate --resource-group rg-afriserve-dev-san --template-file infra/main.bicep ...`)
- [x] Foundation what-if preview (`az deployment group what-if --resource-group rg-afriserve-dev-san --template-file infra/main.bicep ... --result-format ResourceIdOnly`)
- [x] Application template validation (`az deployment group validate --resource-group rg-afriserve-dev-san --template-file infra/apps.bicep ...`)
- [x] Azure authentication check (`az account show`)
- [x] Policy visibility check (`az policy assignment list --scope /subscriptions/5dd22bbf-548f-4b9e-bcfc-5be366d6dbbe`)
- [x] Compile verification (`npx tsc -p tsconfig.json --noEmit`)
- [x] Live smoke tests (`GET /health`, `GET /ready`, revision health via Azure CLI)
- [x] Update plan status to `Validated`
- [x] Record validation proof below

### Phase 4: Deployment
- [x] Invoke azure-deploy skill
- [x] Deployment successful
- [x] Report deployed endpoint URLs
- [x] Update plan status to `Deployed`

---

## 7. Validation Proof

| Check | Command Run | Result | Timestamp |
|-------|-------------|--------|-----------|
| Azure authentication | `az account show` | Passed. Confirmed subscription `Azure for Students` (`5dd22bbf-548f-4b9e-bcfc-5be366d6dbbe`) and authenticated user `ErickGitau@my.uopeople.edu`. | 2026-04-04 21:12:00 +03:00 |
| Bicep compilation | `az bicep build --file infra/main.bicep` | Passed with warnings only. No blocking compilation errors. | 2026-04-04 21:12:00 +03:00 |
| Foundation template validation | `az deployment group validate --resource-group rg-afriserve-dev-san --template-file infra/main.bicep --parameters @infra/main.parameters.json postgresAdminPassword=<validation-secret> jwtSecret=<validation-secret>` | Passed. Azure validated the deployed foundation resources in `rg-afriserve-dev-san`. | 2026-04-04 21:13:21 +03:00 |
| Foundation what-if | `az deployment group what-if --resource-group rg-afriserve-dev-san --template-file infra/main.bicep --parameters @infra/main.parameters.json postgresAdminPassword=<validation-secret> jwtSecret=<validation-secret> --result-format ResourceIdOnly` | Passed. Incremental what-if completed without blocking errors; existing Container Apps were ignored while foundation resources were safe to reconcile. | 2026-04-04 21:13:00 +03:00 |
| Application template validation | `az deployment group validate --resource-group rg-afriserve-dev-san --template-file infra/apps.bicep --parameters location=southafricanorth environmentName=dev namePrefix=afriserve uniqueSuffix=4jf5ap containerEnvironmentId=/subscriptions/5dd22bbf-548f-4b9e-bcfc-5be366d6dbbe/resourceGroups/rg-afriserve-dev-san/providers/Microsoft.App/managedEnvironments/cae-afriserve-dev-4jf5ap acrName=acrafriservedev4jf5ap acrLoginServer=acrafriservedev4jf5ap.azurecr.io uploadsStorageName=uploads imageRepository=afriservebackend imageTag=20260404205944 databaseUrl=<validation-secret> redisUrl=<validation-secret> jwtSecret=<validation-secret> corsOrigins=https://aca-afriserve-dev-web-4jf5ap.greenbeach-37755cdd.southafricanorth.azurecontainerapps.io apiBaseUrl=https://aca-afriserve-dev-web-4jf5ap.greenbeach-37755cdd.southafricanorth.azurecontainerapps.io/api uploadPublicBaseUrl=https://aca-afriserve-dev-web-4jf5ap.greenbeach-37755cdd.southafricanorth.azurecontainerapps.io/uploads` | Passed. Azure validated both Container Apps against the deployed environment and image tag. | 2026-04-04 21:13:10 +03:00 |
| Policy visibility | `az policy assignment list --scope /subscriptions/5dd22bbf-548f-4b9e-bcfc-5be366d6dbbe --query "[].{name:name,scope:scope,enforcementMode:enforcementMode}" --output json` | Passed. Subscription policy assignment `sys.regionrestriction` is present and the deployed region `southafricanorth` is already allowed by the live successful rollout. | 2026-04-04 21:14:00 +03:00 |
| Compile verification | `npx tsc -p tsconfig.json --noEmit` | Passed. TypeScript compiled cleanly without code errors. | 2026-04-04 21:14:40 +03:00 |
| Health probe smoke test | `Invoke-WebRequest https://aca-afriserve-dev-web-4jf5ap.greenbeach-37755cdd.southafricanorth.azurecontainerapps.io/health` | Passed with HTTP 200. Payload reported database, Redis, and queue checks all healthy. | 2026-04-04 21:12:00 +03:00 |
| Readiness probe smoke test | `Invoke-WebRequest https://aca-afriserve-dev-web-4jf5ap.greenbeach-37755cdd.southafricanorth.azurecontainerapps.io/ready` | Passed with HTTP 200. Payload reported service status `ready`. | 2026-04-04 21:14:59 +03:00 |
| Web revision health | `az containerapp revision show --name aca-afriserve-dev-web-4jf5ap --resource-group rg-afriserve-dev-san --revision aca-afriserve-dev-web-4jf5ap--dbfix6` | Passed. Revision is `Healthy`, `Provisioned`, `Running`, and serving 100% traffic on image `acrafriservedev4jf5ap.azurecr.io/afriservebackend:20260404205944`. | 2026-04-04 21:14:00 +03:00 |
| Worker revision health | `az containerapp revision show --name aca-afriserve-dev-worker-4jf5ap --resource-group rg-afriserve-dev-san --revision aca-afriserve-dev-worker-4jf5ap--wkfix1` | Passed. Revision is `Healthy`, `Provisioned`, and `RunningAtMaxScale` on image `acrafriservedev4jf5ap.azurecr.io/afriservebackend:20260404205944`. | 2026-04-04 21:14:00 +03:00 |

**Validated by:** Codex using Azure CLI validation plus live Azure smoke tests
**Validation timestamp:** 2026-04-04 21:14:59 +03:00

**Notes:**
- `npm run build:server` hit a local Windows file lock while Prisma attempted to rename the generated SQLite engine DLL. This was an environment-specific local process issue, not a deployment issue; TypeScript compilation still passed and the Azure ACR image build for tag `20260404205944` succeeded.
- Bicep validation emitted non-blocking warnings about secret-bearing outputs and `listKeys/listCredentials` usage. The deployment is healthy, but those warnings should be cleaned up before a stricter production hardening pass.

---

## 8. Files to Generate

| File | Purpose | Status |
|------|---------|--------|
| `.azure/plan.md` | This plan | done |
| `infra/main.bicep` | Resource group deployment entry point | done |
| `infra/modules/container-platform.bicep` | Container Apps environment, ACR, identities, and storage mounts | done |
| `infra/modules/data-services.bicep` | PostgreSQL, Azure Cache for Redis, Storage, Key Vault, and monitoring resources | done |
| `infra/parameters/dev.southafricanorth.json` | Cost-optimized defaults for the proposed subscription and region | done |
| `docs/deployment/azure-bicep.md` | Validate, deploy, smoke-test, and rollback runbook | done |
| `.azure/deployment-output.json` | Recorded deployment metadata and live endpoints | done |

---

## 9. Next Steps

> Current: Deployed

1. Web app live at `https://aca-afriserve-dev-web-4jf5ap.greenbeach-37755cdd.southafricanorth.azurecontainerapps.io`
2. Worker app live in the same Container Apps environment on revision `aca-afriserve-dev-worker-4jf5ap--wkfix1`
3. Recommended follow-up: clean up the remaining Bicep linter warnings and the local Prisma DLL file-lock issue so local `npm run build:server` matches the healthy Azure runtime path.

