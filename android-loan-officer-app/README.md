# Afriserve Loan Officer App

Production-grade Android onboarding workspace for field loan officers, built with Kotlin, Jetpack Compose, Room, WorkManager, and Retrofit.

## What is included

- Officer dashboard for pending onboardings, drafts, and completed applications
- Guided four-step onboarding flow: Identity, Financials, Risk Assessment, Approval
- Dual-entry customer handoff mode for privacy-sensitive actions like PIN capture
- Offline-first draft storage with encrypted PII payloads in Room
- Background sync queue with WorkManager retry support
- Backend integration for clients, KYC updates, guarantors, collateral, fee capture, and document uploads
- KYC scaffolding for OCR, liveness confirmation, and digital signature capture
- Biometric unlock support for reopening the officer workspace

## Project structure

- `app/src/main/java/com/afriserve/loanofficer/domain`
  Domain models and repository contracts
- `app/src/main/java/com/afriserve/loanofficer/data`
  Room entities, Retrofit APIs, repository implementations, and sync worker
- `app/src/main/java/com/afriserve/loanofficer/presentation`
  MVVM viewmodels, Compose screens, and reusable UI components
- `app/src/main/java/com/afriserve/loanofficer/core`
  Security helpers, masking utilities, theme, and KYC helpers

## Backend contract

The app is wired against the existing backend using the `/api` routes, so the configured
base URL should stay at the host root without appending `/api`:

- `POST /api/auth/login`
- `POST /api/clients`
- `PATCH /api/clients/{id}/kyc`
- `POST /api/clients/{id}/guarantors`
- `POST /api/clients/{id}/collaterals`
- `POST /api/clients/{id}/fees`
- `GET /api/clients/{id}/onboarding-status`
- `POST /api/uploads/client-document`

Tenant-aware requests use `X-Tenant-ID`, and authenticated requests attach `Authorization: Bearer <token>`.

## Local setup

1. Confirm the Android SDK is installed.
2. For debug builds, set `AFRISERVE_API_BASE_URL` if you want a custom local or shared backend.
3. For release builds, the default backend URL points at the current Azure Container Apps deployment. Override it with `AFRISERVE_RELEASE_API_BASE_URL` only when packaging against a different environment.
4. Build with:

```powershell
.\gradlew.bat assembleDebug
```

For a release package, run:

```powershell
.\gradlew.bat assembleRelease
```

The generated debug APK is written to:

- `app/build/outputs/apk/debug/app-debug.apk`
- `app/build/outputs/apk/release/app-release-unsigned.apk`

## Security notes

- Room draft payloads and session state are encrypted before persistence.
- Officer sessions can require biometric re-entry before the workspace unlocks.
- Masked values are used on dashboard surfaces to reduce casual PII exposure.

## Next production steps

- Replace the lightweight liveness heuristic with a certified facial match/liveness provider
- Add instrumentation/unit tests for repositories and viewmodels
- Add branded launcher icons and production signing config
