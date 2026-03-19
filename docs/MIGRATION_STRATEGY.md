# Data model & migration strategy (scale and maintainability)

1. Mixed migration approaches increases cognitive load
   You have:

Prisma schema (prisma/schema.prisma)
Prisma migration SQL files
runtime “compatibility” schema evolution in src/db/schema.ts
legacy JS migrations in src/migrations/\*
This can work, but it’s easy to drift.

Suggested improvement:

Pick one canonical path for production (ideally Prisma migrate deploy + reviewed SQL).
Keep schema.ts only for dev-only compatibility or explicit bootstrapping, not long-term evolution.
For SQLite dev bootstrap: fine; for Postgres prod: keep strict migrations. 2) Generated Prisma clients per DB type
src/db/prismaClient.ts dynamically imports a generated sqlite/postgres client module. This is clever and can work, but it increases packaging complexity.

Suggested improvement:

Ensure CI builds both clients deterministically.
In production images, confirm generated/prisma/\* matches the deployed schema version.
Observability & ops (what I’d add for production)
Structured logging is present; add:
request sampling rules
explicit PII scrubbing policy (you started with sanitizeForLogs but ensure client PII fields are redacted too: nationalId, phone, KRA PIN, etc.)
Metrics:
add DB query timing histograms per endpoint category
add job execution metrics (duration, success/failure, last-run timestamps)
Health/readiness:
/ready should validate downstream dependencies used in production mode (DB + Redis + queue broker if enabled)
Docker & deployment notes
Dockerfile looks generally solid (multi-stage build, non-root user).
One likely bug: it creates /home/appdata/uploads (missing slash between app and data). That’s probably a typo and could cause confusing permissions issues.
Docker compose uses default PORT=3000 while README uses 4000 default locally. That’s not wrong, but it’s a constant source of “works on my machine” confusion—standardize.Data model & migration strategy (scale and maintainability)

1. Mixed migration approaches increases cognitive load
   You have:

Prisma schema (prisma/schema.prisma)
Prisma migration SQL files
runtime “compatibility” schema evolution in src/db/schema.ts
legacy JS migrations in src/migrations/\*
This can work, but it’s easy to drift.

Suggested improvement:

Pick one canonical path for production (ideally Prisma migrate deploy + reviewed SQL).
Keep schema.ts only for dev-only compatibility or explicit bootstrapping, not long-term evolution.
For SQLite dev bootstrap: fine; for Postgres prod: keep strict migrations. 2) Generated Prisma clients per DB type
src/db/prismaClient.ts dynamically imports a generated sqlite/postgres client module. This is clever and can work, but it increases packaging complexity.

Suggested improvement:

Ensure CI builds both clients deterministically.
In production images, confirm generated/prisma/\* matches the deployed schema version.
Observability & ops (what I’d add for production)
Structured logging is present; add:
request sampling rules
explicit PII scrubbing policy (you started with sanitizeForLogs but ensure client PII fields are redacted too: nationalId, phone, KRA PIN, etc.)
Metrics:
add DB query timing histograms per endpoint category
add job execution metrics (duration, success/failure, last-run timestamps)
Health/readiness:
/ready should validate downstream dependencies used in production mode (DB + Redis + queue broker if enabled)
Docker & deployment notes
Dockerfile looks generally solid (multi-stage build, non-root user).
One likely bug: it creates /home/appdata/uploads (missing slash between app and data). That’s probably a typo and could cause confusing permissions issues.
Docker compose uses default PORT=3000 while README uses 4000 default locally. That’s not wrong, but it’s a constant source of “works on my machine” confusion—standardize.
