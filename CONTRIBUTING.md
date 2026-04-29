# Contributing

## Local Setup In 5 Steps

1. Install dependencies with `npm install`.
2. Copy the env template with `copy .env.example .env` and set at least `JWT_SECRET`.
3. Start SQLite-backed local development with `npm run dev`.
4. In a second terminal, verify the app with `npm run lint`, `npm run typecheck`, and `npm test`.
5. Before opening a PR, run `npm run build:server` so generated Prisma assets and the server build stay in sync.

## Daily Commands

- Start the API: `npm run dev`
- Start the worker: `npm run dev:worker`
- Lint: `npm run lint`
- Type-check: `npm run typecheck`
- Strict type-check: `npm run typecheck:strict`
- Full test suite: `npm test`
- Coverage run: `npm run test:coverage`
- Server-only build: `npm run build:server`

## Branch Conventions

- Create feature and fix branches from `main`.
- Use the `codex/`, `feature/`, `fix/`, or `chore/` prefix consistently, for example `feature/tenant-report-filters`.
- Keep pull requests scoped to one concern when possible: route refactor, migration work, accounting fix, docs update, and so on.

## Migration Workflow

### SQLite and Postgres both matter

- `prisma/schema.prisma` is the SQLite schema source.
- `prisma/postgres/schema.prisma` is generated for Postgres compatibility.
- Runtime SQLite migrations still need to stay aligned with both Prisma schemas.

### Making a schema change

1. Update `prisma/schema.prisma`.
2. Run `node scripts/prisma-manager.mjs generate-schema` to refresh generated Prisma artifacts, including the Postgres schema.
3. Add or update the matching SQL migrations for SQLite runtime behavior and Postgres Prisma migrations as needed.
4. Run `npm run build:server`.
5. Run drift checks:
   - `npm run ci:prisma-check:sqlite`
   - `npm run ci:prisma-check:postgres` with a Postgres `DATABASE_URL`

### Useful migration commands

- SQLite / selected datasource push: `npm run prisma:migrate`
- Create and apply a development migration: `npm run migrate:dev -- --name <migration_name>`
- Reset the selected datasource: `npm run migrate:reset`
- Run runtime migrations: `npm run migrate`
- Migrate SQLite data into Postgres: `npm run migrate:postgres`

## Pull Request Checklist

- `npm run lint`
- `npm run typecheck`
- `npm test`
- Update docs when routes, workflows, or setup steps change
- Note any env var, migration, or rollout requirement in the PR description
