# ADR-001: TypeScript Migration Strategy

**Status:** Accepted  
**Date:** 2026-04-02  
**Deciders:** Engineering Team

---

## Context

The AfriserveBackend codebase currently uses a mixed approach with JavaScript (.js) and TypeScript (.ts) files. The codebase has 308 source files with partial TypeScript adoption. The project needs to improve type safety while minimizing disruption to existing workflows.

### Current State
- TypeScript is enabled for `src/utils/http.js`, `src/utils/helpers.js`, and select route/middleware files
- `tsconfig.strict.json` provides enhanced type checking for the "strict pilot"
- Many service and infrastructure files remain in JavaScript

### Business Drivers
1. Improve developer experience with better IDE support
2. Reduce runtime type errors in production
3. Enable safer refactoring
4. Improve code documentation through types

---

## Decision

We will adopt an **incremental TypeScript migration** strategy following the "utilities → services → routes" priority order.

### Migration Phases

#### Phase 1: Utilities & Type Definitions (Complete)
- ✅ Migrate shared utilities
- ✅ Define core type interfaces
- ✅ Add strict null checks

#### Phase 2: Domain Layer (In Progress)
- ✅ Domain entities (Client, Loan)
- ✅ Value objects (Money, KycStatus, LoanStatus)
- ⏳ Domain services
- ⏳ Domain events

#### Phase 3: Application Services
- ⏳ Command handlers
- ⏳ Query handlers
- ⏳ Sagas

#### Phase 4: Infrastructure & Routes
- ⏳ Repositories
- ⏳ External service integrations
- ⏳ Route handlers
- ⏳ Controllers

---

## Consequences

### Positive
- Reduced type-related bugs in migrated code
- Better IntelliSense and autocomplete
- Self-documenting code through types
- Easier onboarding for new developers

### Negative
- Initial migration overhead
- Learning curve for JS-only developers
- Compilation step adds to build time

### Mitigation
- Use `@ts-check` for gradual adoption
- Enable `noEmit` to avoid build dependency
- Provide migration guidelines and examples
- Set up CI to catch type errors

---

## Implementation Notes

### Compiler Options
```json
{
  "target": "ES2022",
  "module": "NodeNext",
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noEmitOnError": true
}
```

### Migration Checklist
- [ ] Convert file extension .js → .ts
- [ ] Add JSDoc type annotations where needed
- [ ] Fix any strict mode violations
- [ ] Update imports to use `.js` extensions (ESM)
- [ ] Run `npm run typecheck:strict`
- [ ] Add unit tests for migrated code

### Files Ready for Migration (Phase 2)
- `src/domain/loan/services/*.ts`
- `src/domain/client/services/*.ts`
- `src/domain/shared/services/*.ts`

---

## References
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Migrating from JS to TS](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- Project tsconfig files: `tsconfig.json`, `tsconfig.strict.json`
