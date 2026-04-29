# Azure Deployment Plan

> **Status:** Deployed

Generated: 2026-04-28 13:13:13 +03:00

---

## 1. Project Overview

**Goal:** Redeploy the current Afriserve workspace to the existing Azure dev environment so the Android app can be tested against a live backend for customer onboarding.

**Path:** Redeploy Existing Environment

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | Development / QA |
| Scale | Small |
| Budget | Cost-Optimized |
| **Subscription** | Azure for Students (`5dd22bbf-548f-4b9e-bcfc-5be366d6dbbe`) |
| **Location** | `southafricanorth` |
| **Resource Group** | `rg-afriserve-dev-san` |

---

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| `frontend-next` | Frontend | React 19 + Vite | `frontend-next` |
| `afriserve-api` | API | Node.js 22 + TypeScript + Express + Prisma | `src/server.ts` |
| `afriserve-queue-worker` | Worker | Node.js 22 + TypeScript + BullMQ | `src/worker.ts` |
| `postgres-schema` | Data layer | Prisma PostgreSQL schema + migrations | `prisma/postgres` |
| `container-image` | Build artifact | Multi-stage Docker image serving frontend + API | `Dockerfile` |
| `android-loan-officer-app` | Mobile client | Kotlin + Jetpack Compose | `android-loan-officer-app` |

---

## 4. Recipe Selection

**Selected:** Existing Bicep environment with Container App image refresh

**Rationale:** The environment is already provisioned in Azure and the current operator cannot read Key Vault secret values through RBAC. To avoid secret rotation and keep the live database/cache wiring intact, this rollout will validate the repo-managed Bicep files and then refresh the existing Container Apps with a newly built ACR image from the current workspace.

---

## 5. Architecture

**Stack:** Existing Azure Container Apps environment

| Resource | Value |
|----------|-------|
| Container Apps environment | `cae-afriserve-dev-4jf5ap` |
| Web app | `aca-afriserve-dev-web-4jf5ap` |
| Worker app | `aca-afriserve-dev-worker-4jf5ap` |
| ACR | `acrafriservedev4jf5ap` |
| PostgreSQL | `psql-afriserve-dev-4jf5ap` |
| Redis | `redis-afriserve-dev-4jf5ap` |
| Key Vault | `kv-afriserve-dev-4jf5ap` |

---

## 6. Execution Checklist

### Phase 1: Planning
- [x] Confirm existing Azure subscription and resource group
- [x] Reuse existing dev environment target
- [x] Choose safe redeploy path that preserves live secrets
- [x] User requested deployment of the current workspace

### Phase 2: Validation
- [x] Build verification (`npm run build`)
- [x] TypeScript verification (`npm run typecheck`)
- [x] Azure authentication check (`az account show`)
- [x] Bicep compilation (`az bicep build --file infra/main.bicep`)
- [x] Foundation template validation (`az deployment group validate ... infra/main.bicep ...`)
- [x] Application template validation (`az deployment group validate ... infra/apps.bicep ...`)
- [x] Record validation proof
- [x] Update status to `Validated`

### Phase 3: Deployment
- [x] Build and push new image to ACR
- [x] Update web Container App image
- [x] Update worker Container App image
- [x] Verify web health and readiness endpoints
- [x] Verify latest revisions are healthy
- [x] Update status to `Deployed`

---

## 7. Validation Proof

| Check | Command Run | Result | Timestamp |
|-------|-------------|--------|-----------|
| Local build | `npm run build` | Passed. Server and frontend production builds completed successfully in the current workspace. | 2026-04-24 11:04:15 +03:00 |
| Local typecheck | `npm run typecheck` | Passed. TypeScript compiled cleanly with no emit. | 2026-04-24 11:04:15 +03:00 |
| Azure authentication | `az account show` | Passed. Confirmed active subscription `Azure for Students` (`5dd22bbf-548f-4b9e-bcfc-5be366d6dbbe`) for user `ErickGitau@my.uopeople.edu`. | 2026-04-24 11:04:15 +03:00 |
| Bicep compilation | `az bicep build --file infra/main.bicep` | Passed with non-blocking warnings only. | 2026-04-24 11:04:15 +03:00 |
| Foundation validation | `az deployment group validate --resource-group rg-afriserve-dev-san --template-file infra/main.bicep ...` | Passed against the existing resource group using safe placeholder secret values for validation-only execution. | 2026-04-24 11:04:15 +03:00 |
| Application validation | `az deployment group validate --resource-group rg-afriserve-dev-san --template-file infra/apps.bicep ...` | Passed against the existing Container Apps environment using the current Azure resource identifiers and live ingress URLs. | 2026-04-24 11:04:15 +03:00 |
| Local build (history hotfix) | `npm run build` | Passed. Server and frontend production builds completed successfully before the image refresh deployment. | 2026-04-28 13:13:13 +03:00 |
| Local typecheck (history hotfix) | `npm run typecheck` | Passed. TypeScript compiled cleanly with no emit before the image refresh deployment. | 2026-04-28 13:13:13 +03:00 |
| Azure authentication (history hotfix) | `az account show` | Passed. Confirmed active subscription `Azure for Students` (`5dd22bbf-548f-4b9e-bcfc-5be366d6dbbe`) for user `ErickGitau@my.uopeople.edu`. | 2026-04-28 13:13:13 +03:00 |
| Bicep compilation (history hotfix) | `az bicep build --file infra/main.bicep` and `az bicep build --file infra/apps.bicep` | Passed. `infra/main.bicep` emitted existing non-blocking warnings only; `infra/apps.bicep` compiled cleanly. | 2026-04-28 13:13:13 +03:00 |

---

## 8. Deployment Result

Deployment completed successfully on 2026-04-28 13:13:13 +03:00.

| Item | Result |
|------|--------|
| Image pushed | `acrafriservedev4jf5ap.azurecr.io/afriservebackend:20260428130514` |
| Web revision | `aca-afriserve-dev-web-4jf5ap--0000022` |
| Worker revision | `aca-afriserve-dev-worker-4jf5ap--0000012` |
| Web health | `200 OK` from `/health` |
| Web readiness | `200 OK` from `/ready` |
| API checks | Database, Redis, and queue all reported healthy from the live environment after the in-place image refresh |
