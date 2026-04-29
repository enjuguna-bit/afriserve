# ADR-005: Deployment & Infrastructure Strategy

**Status:** Accepted  
**Date:** 2026-04-02  
**Deciders:** Engineering Team, DevOps

---

## Context

The AfriserveBackend needs a robust deployment strategy that supports:
- Development workflows
- Staging environments
- Production scaling
- Disaster recovery

---

## Decision

### Deployment Environments

| Environment | Purpose | Configuration |
|-------------|---------|---------------|
| Development | Local development | SQLite, localhost |
| Staging | Pre-production testing | PostgreSQL, separate instance |
| Production | Live system | PostgreSQL, Redis, Azure Container Apps |

### Infrastructure Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Load Balancer                        │
│              (Azure Front Door / Cloudflare)             │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Container 1  │   │  Container 2  │   │  Container 3  │
│  (API Server) │   │  (API Server) │   │  (API Server) │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
              ┌─────────────────────────────┐
              │         PostgreSQL          │
              │    (Azure Database for      │
              │         PostgreSQL)         │
              └─────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │           Redis             │
              │      (Azure Cache for       │
              │         Redis)              │
              └─────────────────────────────┘
```

---

## Container Strategy

### Multi-Stage Dockerfile

```dockerfile
# Stage 1: Build
FROM node:22 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:22-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY package*.json ./
RUN npm ci --omit=dev

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s CMD node -e "fetch('http://localhost:3000/health').then(r=>r.ok||process.exit(1))"
CMD ["node", "dist/src/server.js"]
```

### Resource Limits

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 0.5 cores | 1 core |
| Memory | 512 MB | 1 GB |
| Disk | 1 GB | 5 GB |

---

## Database Strategy

### PostgreSQL Configuration

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://user:pass@host:5432/afriserve
PG_POOL_MAX=20
PG_IDLE_TIMEOUT_MS=30000
PG_CONNECTION_TIMEOUT_MS=5000
```

### Backup Strategy

| Type | Frequency | Retention |
|------|-----------|-----------|
| Automated | Every 6 hours | 14 days |
| Weekly | Weekly | 12 weeks |
| Monthly | Monthly | 12 months |
| Pre-deployment | Before migrations | 30 days |

---

## Environment Variables

### Required Variables

```env
# Security (MUST be set)
JWT_SECRET=<min-32-char-secret>

# Database
DB_CLIENT=postgres
DATABASE_URL=<connection-string>

# Optional Services
REDIS_URL=<redis-connection-string>  # For rate limiting & caching
```

### Optional Variables

```env
# Observability
LOG_LEVEL=info
SENTRY_DSN=<sentry-dsn>

# Rate Limiting
RATE_LIMIT_REDIS_URL=<redis-url>
AUTH_SESSION_CACHE_REDIS_URL=<redis-url>

# File Storage
UPLOAD_STORAGE_DRIVER=s3
UPLOAD_S3_BUCKET=<bucket-name>

# Monitoring
UPTIME_HEARTBEAT_URL=<heartbeat-url>
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] Run all tests: `npm test`
- [ ] Run type check: `npm run typecheck:strict`
- [ ] Run lint: `npm run lint`
- [ ] Build: `npm run build`
- [ ] Backup database
- [ ] Review migration SQL

### Deployment
- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Monitor error rates
- [ ] Deploy to production
- [ ] Verify health checks
- [ ] Check Prometheus metrics

### Post-Deployment
- [ ] Update documentation
- [ ] Notify stakeholders
- [ ] Monitor for 24 hours

---

## Rollback Strategy

### Quick Rollback
```bash
# Using deployment script
./deploy.sh rollback

# Or manually
kubectl rollout undo deployment/afriserve-api
```

### Database Rollback
```bash
# Prisma migrate down
npm run migrate:dev -- --name revert_<migration_name>

# Or restore from backup
pg_restore -d postgres backup.sql
```

---

## Monitoring & Alerting

### Health Endpoint
```bash
curl https://api.afriserve.com/health
curl https://api.afriserve.com/health/details
```

### Prometheus Metrics
```bash
curl https://api.afriserve.com/metrics
```

### Key Metrics to Monitor
- HTTP request rate
- Error rate (5xx)
- Response time (P95)
- Database connection pool
- Redis connectivity
- Queue depth (if using jobs)

---

## References
- [Azure Container Apps Documentation](https://docs.microsoft.com/en-us/azure/container-apps/)
- [PostgreSQL Best Practices](https://www.postgresql.org/docs/current/best-practices.html)
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
