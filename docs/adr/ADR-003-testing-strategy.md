# ADR-003: Testing Strategy

**Status:** Accepted  
**Date:** 2026-04-02  
**Deciders:** Engineering Team

---

## Context

The AfriserveBackend currently has 74 test files covering various integration scenarios. However, unit test coverage for domain logic and utility functions needs improvement. This ADR defines our testing strategy moving forward.

### Current Testing State
- ✅ Integration tests for API routes
- ✅ Domain entity tests (DDD patterns)
- ✅ Financial precision regression tests
- ✅ Security hardening tests
- ⚠️ Limited unit tests for value objects
- ⚠️ Limited unit tests for service layer
- ⚠️ No snapshot tests for API contracts

---

## Decision

We will adopt a **Test Pyramid** strategy with emphasis on unit tests for business logic.

### Testing Layers

```
         ▲
        /E2E\        E2E Tests (few, critical flows)
       /──────\
      /Integration\   Integration Tests (API contracts, DB)
     /────────────\
    /  Unit Tests  \  Unit Tests (domain, services, utils)
   /──────────────\
  /     Types      \  Type Tests (TypeScript contracts)
```

### Layer 1: Unit Tests (Priority)

**Target Coverage: 80% for domain logic**

| Module | Test Files | Coverage Goal |
|--------|------------|---------------|
| Domain Entities | `domain-*entity*.test.ts` | 90% |
| Value Objects | `domain-*value*.test.ts` | 95% |
| Domain Services | `domain-services.test.ts` | 80% |
| Utilities | `utils-*.test.ts` | 85% |

**Test Structure:**
```typescript
describe('ModuleName', () => {
  describe('methodName', () => {
    it('should do X when Y', () => {});
    it('should throw error when Z', () => {});
    // Edge cases
    // Boundary conditions
  });
});
```

### Layer 2: Integration Tests (Maintain)

**Keep existing patterns:**
- `tests/auth-security.test.ts` - Authentication flows
- `tests/loan-workflows.test.ts` - Loan lifecycle
- `tests/financial-precision-regression.test.ts` - Decimal calculations

**Improvements:**
- Add API contract tests
- Add database migration tests
- Add rate limiting verification tests

### Layer 3: E2E Tests (Future)

- Critical user journeys (login → create loan → repay)
- Dashboard rendering validation
- Report generation

---

## Consequences

### Positive
- Faster test feedback (unit tests run in <1s)
- Better isolation of failures
- Documentation through tests
- Confidence for refactoring

### Negative
- More test code to maintain
- Need to mock external dependencies
- Test utility library overhead

---

## Implementation Plan

### Q2 2026: Foundation
- [x] Unit tests for Money value object
- [x] Unit tests for Loan entity
- [x] Unit tests for Client entity
- [x] Unit tests for LoanStatus, InterestRate, LoanTerm
- [x] Validation/sanitization unit tests
- [ ] Unit tests for LoanTerm (complete)
- [ ] Unit tests for LoanId, ClientId value objects

### Q3 2026: Expansion
- [ ] Unit tests for all domain services
- [ ] Unit tests for audit service
- [ ] Unit tests for hierarchy service
- [ ] Integration tests for report endpoints

### Q4 2026: Automation
- [ ] Add coverage reporting to CI
- [ ] Set coverage thresholds (70% minimum)
- [ ] Add mutation testing for critical paths

---

## Test Naming Conventions

```
tests/
├── domain-                    # Domain logic tests
│   ├── value-objects-*.test.ts
│   ├── client-entity.test.ts
│   └── loan-entity.test.ts
├── services-                  # Service layer tests
│   └── *.test.ts
├── integration-               # Integration tests
│   └── *.test.ts
└── api-                       # API contract tests
    └── *.test.ts
```

---

## References
- [Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy)
- [F.I.R.S.T. Principles of Testing](https://prismtechventures.com/software-engineering/f-i-r-s-t-principles-of-testing/)
- Project test helpers: `tests/integration-helpers.ts`
