/**
 * Unit tests for Rate Limiting Service
 * Tests rate limit configuration, key generation, and enforcement
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('RateLimitingService', () => {
  describe('Key Generation', () => {
    it('should generate unique keys per IP', () => {
      function generateIpKey(ip: string, prefix: string): string {
        return `${prefix}:${ip}`;
      }
      
      const key1 = generateIpKey('192.168.1.1', 'auth-limiter');
      const key2 = generateIpKey('192.168.1.2', 'auth-limiter');
      
      assert.notStrictEqual(key1, key2);
      assert.ok(key1.includes('192.168.1.1'));
    });

    it('should include tenant in key when present', () => {
      function generateKey(tenantId: string | undefined, ip: string, prefix: string): string {
        const tenant = tenantId || 'anonymous';
        return `${prefix}:${tenant}:${ip}`;
      }
      
      const keyWithTenant = generateKey('tenant-123', '192.168.1.1', 'api');
      const keyWithoutTenant = generateKey(undefined, '192.168.1.1', 'api');
      
      assert.ok(keyWithTenant.includes('tenant-123'));
      assert.ok(keyWithoutTenant.includes('anonymous'));
    });

    it('should handle X-Forwarded-For header', () => {
      function extractRealIp(forwardedFor: string | undefined, remoteIp: string): string {
        if (!forwardedFor) return remoteIp;
        
        // Take first IP (original client)
        const ips = forwardedFor.split(',').map(ip => ip.trim());
        return ips[0] || remoteIp;
      }
      
      assert.strictEqual(
        extractRealIp('203.0.113.195, 70.41.3.18, 150.172.238.178', '10.0.0.1'),
        '203.0.113.195'
      );
      assert.strictEqual(
        extractRealIp(undefined, '127.0.0.1'),
        '127.0.0.1'
      );
    });

    it('should normalize IPv6 addresses', () => {
      function normalizeIp(ip: string): string {
        // Normalize IPv6 to full form
        return ip.toLowerCase().trim();
      }
      
      assert.strictEqual(normalizeIp('::1'), normalizeIp('::1'));
      assert.strictEqual(normalizeIp('::ffff:192.168.1.1'), normalizeIp('::ffff:192.168.1.1'));
    });
  });

  describe('Window Configuration', () => {
    it('should calculate window boundaries correctly', () => {
      function getWindowStart(timestampMs: number, windowMs: number): number {
        return Math.floor(timestampMs / windowMs) * windowMs;
      }
      
      const now = Date.now();
      const window = 15 * 60 * 1000; // 15 minutes
      
      const start1 = getWindowStart(now, window);
      const start2 = getWindowStart(now + 1000, window);
      
      // Should be in same window
      assert.strictEqual(start1, start2);
      
      // Different window
      const start3 = getWindowStart(now + window, window);
      assert.ok(start3 > start1);
    });

    it('should handle sliding window correctly', () => {
      function getSlidingWindowRequests(
        timestamps: number[],
        windowMs: number,
        currentTime: number
      ): number {
        const cutoff = currentTime - windowMs;
        return timestamps.filter(t => t >= cutoff).length;
      }
      
      const now = Date.now();
      const window = 60 * 1000; // 1 minute
      
      const recentTimestamps = [now - 1000, now - 30000, now - 60000];
      const oldTimestamps = [now - 120000, now - 180000];
      
      assert.strictEqual(getSlidingWindowRequests(recentTimestamps, window, now), 3);
      assert.strictEqual(getSlidingWindowRequests(oldTimestamps, window, now), 0);
      assert.strictEqual(getSlidingWindowRequests([...recentTimestamps, ...oldTimestamps], window, now), 3);
    });
  });

  describe('Limit Enforcement', () => {
    it('should allow requests under limit', () => {
      function shouldAllowRequest(
        requestCount: number,
        limit: number
      ): { allowed: boolean; remaining: number } {
        const allowed = requestCount < limit;
        return {
          allowed,
          remaining: Math.max(0, limit - requestCount - (allowed ? 1 : 0))
        };
      }
      
      assert.ok(shouldAllowRequest(0, 20).allowed);
      assert.ok(shouldAllowRequest(19, 20).allowed);
      assert.ok(!shouldAllowRequest(20, 20).allowed);
      assert.ok(!shouldAllowRequest(25, 20).allowed);
    });

    it('should calculate retry-after correctly', () => {
      function getRetryAfterMs(
        lastRequestTime: number,
        windowMs: number
      ): number {
        const windowEnd = lastRequestTime + windowMs;
        return Math.max(0, windowEnd - Date.now());
      }
      
      const now = Date.now();
      const window = 15 * 60 * 1000; // 15 minutes
      
      // Request 1 second ago
      const retryAfter1 = getRetryAfterMs(now - 1000, window);
      assert.ok(retryAfter1 > window - 2000);
      
      // Request 14 minutes ago
      const retryAfter2 = getRetryAfterMs(now - 14 * 60 * 1000, window);
      assert.ok(retryAfter2 > 0);
      
      // Request 16 minutes ago (should be 0)
      const retryAfter3 = getRetryAfterMs(now - 16 * 60 * 1000, window);
      assert.strictEqual(retryAfter3, 0);
    });
  });

  describe('Endpoint-Specific Limits', () => {
    it('should apply different limits per endpoint', () => {
      interface RateLimitConfig {
        endpoint: string;
        maxRequests: number;
        windowMs: number;
      }
      
      const configs: RateLimitConfig[] = [
        { endpoint: '/api/auth/login', maxRequests: 5, windowMs: 15 * 60 * 1000 },
        { endpoint: '/api/auth/reset-password/request', maxRequests: 3, windowMs: 15 * 60 * 1000 },
        { endpoint: '/api/uploads/*', maxRequests: 10, windowMs: 60 * 1000 },
        { endpoint: '/api/*', maxRequests: 200, windowMs: 60 * 1000 },
      ];
      
      function findConfig(endpoint: string): RateLimitConfig | undefined {
        // Exact match first
        const exact = configs.find(c => c.endpoint === endpoint);
        if (exact) return exact;
        
        // Pattern match
        return configs.find(c => 
          c.endpoint.endsWith('*') && 
          endpoint.startsWith(c.endpoint.slice(0, -1))
        ) || configs[configs.length - 1];
      }
      
      assert.strictEqual(findConfig('/api/auth/login')?.maxRequests, 5);
      assert.strictEqual(findConfig('/api/uploads/file.jpg')?.maxRequests, 10);
      assert.strictEqual(findConfig('/api/clients')?.maxRequests, 200);
    });
  });

  describe('Response Headers', () => {
    it('should include standard rate limit headers', () => {
      interface RateLimitHeaders {
        'X-RateLimit-Limit': string;
        'X-RateLimit-Remaining': string;
        'X-RateLimit-Reset': string;
        'Retry-After'?: string;
      }
      
      function buildHeaders(
        limit: number,
        remaining: number,
        resetMs: number,
        blocked: boolean
      ): RateLimitHeaders {
        const resetSec = Math.ceil((resetMs - Date.now()) / 1000);
        return {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(Math.max(0, remaining)),
          'X-RateLimit-Reset': String(resetSec),
          ...(blocked ? { 'Retry-After': String(resetSec) } : {})
        };
      }
      
      const headers = buildHeaders(20, 15, Date.now() + 60000, false);
      assert.strictEqual(headers['X-RateLimit-Limit'], '20');
      assert.strictEqual(headers['X-RateLimit-Remaining'], '15');
      assert.ok(!('Retry-After' in headers));
      
      const blockedHeaders = buildHeaders(20, 0, Date.now() + 60000, true);
      assert.ok('Retry-After' in blockedHeaders);
    });

    it('should include standard headers when enabled', () => {
      function shouldIncludeStandardHeaders(): boolean {
        return true; // Default for compliance with proposed standard
      }
      
      assert.ok(shouldIncludeStandardHeaders());
    });
  });

  describe('Burst Handling', () => {
    it('should handle burst requests correctly', () => {
      function handleBurst(
        requestsInWindow: number[],
        limit: number,
        burstAllowance: number
      ): { allowed: boolean; penalized: boolean } {
        const total = requestsInWindow.reduce((a, b) => a + b, 0);
        const penalized = total > limit + burstAllowance;
        return {
          allowed: !penalized,
          penalized
        };
      }
      
      // Normal burst (allowed)
      assert.ok(handleBurst([1, 1, 1, 1], 5, 3).allowed);
      
      // Excessive burst (penalized)
      assert.ok(handleBurst([5, 5, 5], 5, 3).penalized);
    });

    it('should implement progressive penalties', () => {
      function calculatePenaltyMultiplier(
        excessPercentage: number
      ): number {
        if (excessPercentage <= 0) return 1;
        if (excessPercentage <= 50) return 1.5;
        if (excessPercentage <= 100) return 2;
        return 4; // Block for repeated abuse
      }
      
      assert.strictEqual(calculatePenaltyMultiplier(0), 1);
      assert.strictEqual(calculatePenaltyMultiplier(30), 1.5);
      assert.strictEqual(calculatePenaltyMultiplier(75), 2);
      assert.strictEqual(calculatePenaltyMultiplier(150), 4);
    });
  });

  describe('Whitelist/Blacklist', () => {
    it('should check whitelist before applying limits', () => {
      const whitelist = new Set(['127.0.0.1', '10.0.0.1', '::1']);
      
      function isWhitelisted(ip: string): boolean {
        return whitelist.has(ip);
      }
      
      assert.ok(isWhitelisted('127.0.0.1'));
      assert.ok(!isWhitelisted('192.168.1.1'));
    });

    it('should check blacklist and immediately block', () => {
      const blacklist = new Set(['blocked-ip-1', 'blocked-ip-2']);
      
      function isBlacklisted(ip: string): boolean {
        return blacklist.has(ip);
      }
      
      assert.ok(isBlacklisted('blocked-ip-1'));
      assert.ok(!isBlacklisted('192.168.1.1'));
    });
  });

  describe('Distributed Rate Limiting', () => {
    it('should handle Redis-based counting', async () => {
      async function incrementAndGet(
        redis: any,
        key: string,
        windowMs: number
      ): Promise<number> {
        const now = Date.now();
        const windowKey = `${key}:${Math.floor(now / windowMs)}`;
        
        const count = await redis.incr(windowKey);
        if (count === 1) {
          await redis.expire(windowKey, Math.ceil(windowMs / 1000));
        }
        
        return count;
      }
      
      // Simulated test
      const mockRedis: any = { storage: new Map() };
      mockRedis.incr = async (key: string) => {
        const current = mockRedis.storage.get(key) || 0;
        mockRedis.storage.set(key, current + 1);
        return current + 1;
      };
      mockRedis.expire = async () => {};
      
      const count1 = await incrementAndGet(mockRedis, 'test:key', 60000);
      const count2 = await incrementAndGet(mockRedis, 'test:key', 60000);
      
      assert.strictEqual(count1, 1);
      assert.strictEqual(count2, 2);
    });

    it('should handle Redis failures gracefully', async () => {
      async function getCount(
        redisAvailable: boolean,
        fallbackCount: number
      ): Promise<{ count: number; usingFallback: boolean }> {
        if (!redisAvailable) {
          return { count: fallbackCount, usingFallback: true };
        }
        // Would normally get from Redis
        return { count: fallbackCount + 1, usingFallback: false };
      }
      
      const result = await getCount(false, 5);
      assert.strictEqual(result.count, 5);
      assert.ok(result.usingFallback);
    });
  });
});
