/**
 * Unit tests for input validation and sanitization utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Input sanitization utility - mimics the sanitization logic used throughout the app
 */
function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';

  const withoutUnsafeControls = Array.from(input)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
    })
    .join('')
  
  return withoutUnsafeControls
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Escape HTML entities to prevent XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * SQL injection prevention - parameterized query builder test helper
 */
function validateSqlIdentifier(identifier: string): boolean {
  // Only allow alphanumeric and underscore, must start with letter
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(identifier);
}

/**
 * Email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Phone number validation (Kenya format)
 */
function isValidKenyaPhone(phone: string): boolean {
  // Accept formats: +254..., 254..., 07..., 01..., 071..., 2547...
  const cleanPhone = phone.replace(/[\s\-()]/g, '');
  const kenyaRegex = /^(\+?254|0)[17]\d{8}$/;
  return kenyaRegex.test(cleanPhone);
}

/**
 * National ID validation (Kenya format)
 */
function isValidNationalId(id: string): boolean {
  // Kenya national ID is typically 8 digits
  const cleanId = id.replace(/\s/g, '');
  return /^\d{8,9}$/.test(cleanId);
}

/**
 * Amount validation for financial transactions
 */
function isValidAmount(amount: unknown): boolean {
  if (typeof amount === 'number') {
    return Number.isFinite(amount) && amount > 0 && amount <= 999999999;
  }
  if (typeof amount === 'string') {
    const parsed = parseFloat(amount);
    return !isNaN(parsed) && isValidAmount(parsed);
  }
  return false;
}

/**
 * URL validation
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

describe('Input Sanitization', () => {
  describe('XSS Prevention', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("xss")</script>';
      const sanitized = sanitizeInput(input);
      assert.ok(!sanitized.includes('<script>'));
      assert.ok(sanitized.includes('&lt;script&gt;'));
    });

    it('should escape ampersands', () => {
      const input = 'foo & bar';
      const sanitized = sanitizeInput(input);
      assert.ok(sanitized.includes('&amp;'));
    });

    it('should escape quotes', () => {
      const input = 'He said "hello"';
      const sanitized = sanitizeInput(input);
      assert.ok(sanitized.includes('&quot;'));
    });

    it('should remove null bytes', () => {
      const input = 'hello\0world';
      const sanitized = sanitizeInput(input);
      assert.ok(!sanitized.includes('\0'));
    });

    it('should remove control characters', () => {
      const input = 'hello\x07world';
      const sanitized = sanitizeInput(input);
      assert.ok(!sanitized.includes('\x07'));
    });

    it('should preserve whitespace', () => {
      const input = 'hello   world';
      const sanitized = sanitizeInput(input);
      assert.strictEqual(sanitized, 'hello   world');
    });

    it('should trim whitespace', () => {
      const input = '  hello  ';
      const sanitized = sanitizeInput(input);
      assert.strictEqual(sanitized, 'hello');
    });

    it('should return empty string for non-string input', () => {
      assert.strictEqual(sanitizeInput(null as any), '');
      assert.strictEqual(sanitizeInput(undefined as any), '');
      assert.strictEqual(sanitizeInput(123 as any), '');
    });

    it('should handle complex XSS payloads', () => {
      const payloads = [
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '<svg onload=alert(1)>',
        '<body onload=alert(1)>',
        'onclick=alert(1)',
      ];
      
      for (const payload of payloads) {
        const sanitized = sanitizeInput(payload);
        assert.ok(
          !sanitized.includes('<') || sanitized.includes('&lt;'),
          `Failed to sanitize: ${payload}`
        );
      }
    });
  });
});

describe('SQL Identifier Validation', () => {
  it('should accept valid identifiers', () => {
    assert.ok(validateSqlIdentifier('users'));
    assert.ok(validateSqlIdentifier('user_id'));
    assert.ok(validateSqlIdentifier('loanStatus'));
    assert.ok(validateSqlIdentifier('ABC123'));
  });

  it('should reject SQL injection attempts', () => {
    assert.ok(!validateSqlIdentifier("users; DROP TABLE users;--"));
    assert.ok(!validateSqlIdentifier("users--"));
    assert.ok(!validateSqlIdentifier("1 OR 1=1"));
    assert.ok(!validateSqlIdentifier("users\x00"));
    assert.ok(!validateSqlIdentifier(""));
    assert.ok(!validateSqlIdentifier("_starts_with_underscore"));
  });

  it('should reject identifiers with spaces', () => {
    assert.ok(!validateSqlIdentifier("user id"));
    assert.ok(!validateSqlIdentifier("user\tid"));
    assert.ok(!validateSqlIdentifier("user\nid"));
  });
});

describe('Email Validation', () => {
  it('shouldaccept valid emails', () => {
    assert.ok(isValidEmail('user@example.com'));
    assert.ok(isValidEmail('user.name@domain.co.uk'));
    assert.ok(isValidEmail('user+tag@example.com'));
  });

  it('should reject invalid emails', () => {
    assert.ok(!isValidEmail('invalid'));
    assert.ok(!isValidEmail('user@'));
    assert.ok(!isValidEmail('@domain.com'));
    assert.ok(!isValidEmail('user@domain'));
    assert.ok(!isValidEmail('user name@domain.com'));
  });

  it('should enforce length limit', () => {
    const longEmail = 'a'.repeat(250) + '@example.com';
    assert.ok(!isValidEmail(longEmail));
  });
});

describe('Kenya Phone Validation', () => {
  it('should accept valid Kenya phone numbers', () => {
    assert.ok(isValidKenyaPhone('+254700000000'));
    assert.ok(isValidKenyaPhone('254700000000'));
    assert.ok(isValidKenyaPhone('0700000000'));
    assert.ok(isValidKenyaPhone('0711234567'));
    assert.ok(isValidKenyaPhone('+254711234567'));
  });

  it('should accept phone with formatting', () => {
    assert.ok(isValidKenyaPhone('+254 700 000 000'));
    assert.ok(isValidKenyaPhone('0700-000-000'));
    assert.ok(isValidKenyaPhone('(0700) 000 000'));
  });

  it('should reject invalid phone numbers', () => {
    assert.ok(!isValidKenyaPhone('1234567890'));
    assert.ok(!isValidKenyaPhone('+254800000000')); // 800 is toll-free, not mobile
    assert.ok(!isValidKenyaPhone('abc'));
    assert.ok(!isValidKenyaPhone(''));
  });
});

describe('National ID Validation', () => {
  it('should accept valid national IDs', () => {
    assert.ok(isValidNationalId('12345678'));
    assert.ok(isValidNationalId('123456789'));
    assert.ok(isValidNationalId('  12345678  '));
  });

  it('should reject invalid national IDs', () => {
    assert.ok(!isValidNationalId('1234567')); // Too short
    assert.ok(!isValidNationalId('1234567890')); // Too long
    assert.ok(!isValidNationalId('ABC12345'));
    assert.ok(!isValidNationalId(''));
  });
});

describe('Amount Validation', () => {
  it('should accept valid amounts', () => {
    assert.ok(isValidAmount(100));
    assert.ok(isValidAmount(0.01));
    assert.ok(isValidAmount(1000000));
    assert.ok(isValidAmount('500'));
    assert.ok(isValidAmount('1000.50'));
  });

  it('should reject invalid amounts', () => {
    assert.ok(!isValidAmount(0));
    assert.ok(!isValidAmount(-100));
    assert.ok(!isValidAmount(1000000000));
    assert.ok(!isValidAmount(NaN));
    assert.ok(!isValidAmount(Infinity));
    assert.ok(!isValidAmount('abc'));
    assert.ok(!isValidAmount(null));
    assert.ok(!isValidAmount(undefined));
  });
});

describe('URL Validation', () => {
  it('should accept valid URLs', () => {
    assert.ok(isValidUrl('https://example.com'));
    assert.ok(isValidUrl('http://localhost:3000'));
    assert.ok(isValidUrl('https://example.com/path?query=value'));
    assert.ok(isValidUrl('https://example.com/path#anchor'));
  });

  it('should reject invalid URLs', () => {
    assert.ok(!isValidUrl('not-a-url'));
    assert.ok(!isValidUrl('ftp://example.com'));
    assert.ok(!isValidUrl('javascript:alert(1)'));
    assert.ok(!isValidUrl(''));
  });

  it('should reject javascript: protocol', () => {
    assert.ok(!isValidUrl('javascript:void(0)'));
    assert.ok(!isValidUrl('javascript:alert(document.cookie)'));
  });
});

describe('Edge Cases', () => {
  it('should handle unicode characters', () => {
    const input = 'Hello 你好 مرحبا';
    const sanitized = sanitizeInput(input);
    assert.ok(sanitized.includes('Hello'));
  });

  it('should handle very long input', () => {
    const input = 'x'.repeat(100000);
    const sanitized = sanitizeInput(input);
    assert.strictEqual(sanitized.length, 100000);
  });

  it('should handle empty strings', () => {
    assert.strictEqual(sanitizeInput(''), '');
    assert.strictEqual(sanitizeInput('   '), '');
  });
});
