# ADR-002: Security Hardening Strategy

**Status:** Accepted  
**Date:** 2026-04-02  
**Deciders:** Engineering Team, Security Review

---

## Context

The AfriserveBackend handles sensitive financial data for a microfinance system. While the current security baseline is solid, several enhancements are needed to meet enterprise security standards.

### Current Security Measures
- ✅ JWT authentication with configurable secrets
- ✅ RBAC with role-based permissions
- ✅ Rate limiting (auth: 20/15min, API: 200/min)
- ✅ Brute-force protection (5 attempts → 15min lockout)
- ✅ Helmet.js security headers
- ✅ Input validation with Zod
- ✅ Audit logging

### Identified Gaps
- ⚠️ No CSP nonce support for inline scripts
- ⚠️ Limited input sanitization for stored XSS
- ⚠️ Missing SQL injection audit in raw query builders
- ⚠️ No request body size limits beyond JSON parsing
- ⚠️ Missing security headers (HSTS, Referrer-Policy)

---

## Decision

We will implement enhanced security measures in the following priority order.

### Priority 1: Critical Headers (Phase 1)

Add missing security headers to helmet configuration:

```typescript
// In security.ts
helmet({
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false, // Required for Google Fonts
})
```

### Priority 2: Input Sanitization (Phase 2)

Implement output encoding for stored data:

```typescript
// New utility: src/utils/sanitize.ts
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeJs(unsafe: string): string {
  return JSON.stringify(unsafe).slice(1, -1);
}
```

### Priority 3: Enhanced Rate Limiting (Phase 3)

Add endpoint-specific rate limits for sensitive operations:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 | 15 min |
| `/api/auth/reset-password/request` | 3 | 15 min |
| `/api/uploads/*` | 10 | 1 min |
| `/api/reports/*` | 20 | 1 min |

### Priority 4: Request Validation Enhancement (Phase 4)

- Add maximum string length validation
- Implement recursive object depth limits
- Add content-type validation for file uploads

---

## Consequences

### Positive
- Protection against XSS attacks through CSP
- Prevention of SQL injection via parameterized queries
- Mitigation of DoS attacks through stricter limits
- Compliance with OWASP recommendations

### Negative
- CSP may break inline scripts (requires nonces)
- Stricter limits may affect legitimate high-volume users
- Additional processing overhead for sanitization

### Monitoring

Add security metrics:
- `security.xss_attempts_total`
- `security.sql_injection_attempts_total`
- `security.rate_limit_hits_total`
- `security.auth_failures_total`

---

## Implementation Checklist

- [ ] Add HSTS and Referrer-Policy headers
- [ ] Implement output encoding utility
- [ ] Add CSP nonce support for dashboard
- [ ] Create endpoint-specific rate limiters
- [ ] Add security metrics to observability
- [ ] Document security headers in README
- [ ] Add security tests to test suite

---

## References
- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
- [Content Security Policy](https://content-security-policy.com/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
