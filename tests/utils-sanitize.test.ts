/**
 * Unit tests for sanitization utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  escapeHtml,
  unescapeHtml,
  escapeJs,
  escapeJson,
  sanitizeClassName,
  sanitizeId,
  stripXssPatterns,
  isValidSqlIdentifier,
  sanitizeFilename,
  isSafeUrl,
  stripFormatting,
  formatPhoneDisplay,
  maskSensitiveData,
} from '../src/utils/sanitize.js';

describe('Sanitization Utilities', () => {
  describe('escapeHtml', () => {
    it('should escape ampersands', () => {
      assert.strictEqual(escapeHtml('foo & bar'), 'foo &amp; bar');
    });

    it('should escape angle brackets', () => {
      assert.strictEqual(escapeHtml('<div>'), '&lt;div&gt;');
    });

    it('should escape quotes', () => {
      assert.strictEqual(escapeHtml('say "hello"'), 'say &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      assert.strictEqual(escapeHtml("it's"), 'it&#x27;s');
    });

    it('should escape forward slashes', () => {
      assert.strictEqual(escapeHtml('a/b/c'), 'a&#x2F;b&#x2F;c');
    });

    it('should handle empty string', () => {
      assert.strictEqual(escapeHtml(''), '');
    });

    it('should handle non-string input', () => {
      assert.strictEqual(escapeHtml(null as any), '');
      assert.strictEqual(escapeHtml(undefined as any), '');
      assert.strictEqual(escapeHtml(123 as any), '');
    });

    it('should escape complex XSS payloads', () => {
      const payload = '<img src=x onerror="alert(1)">';
      const escaped = escapeHtml(payload);
      assert.ok(!escaped.includes('onerror'));
      assert.ok(escaped.includes('&lt;'));
    });

    it('should preserve safe characters', () => {
      assert.strictEqual(escapeHtml('Hello World 123'), 'Hello World 123');
    });
  });

  describe('unescapeHtml', () => {
    it('should unescape common entities', () => {
      assert.strictEqual(unescapeHtml('&amp;'), '&');
      assert.strictEqual(unescapeHtml('&lt;'), '<');
      assert.strictEqual(unescapeHtml('&gt;'), '>');
      assert.strictEqual(unescapeHtml('&quot;'), '"');
    });

    it('should round-trip escape/unescape', () => {
      const original = '<div class="test">Hello & "World"</div>';
      const escaped = escapeHtml(original);
      const unescaped = unescapeHtml(escaped);
      assert.strictEqual(unescaped, original);
    });
  });

  describe('escapeJs', () => {
    it('should escape quotes', () => {
      assert.strictEqual(escapeJs('say "hi"'), 'say \\"hi\\"');
      assert.strictEqual(escapeJs("it's"), "it\\'s");
    });

    it('should escape newlines', () => {
      assert.strictEqual(escapeJs('line1\nline2'), 'line1\\nline2');
    });

    it('should escape backslashes', () => {
      assert.strictEqual(escapeJs('path\\to\\file'), 'path\\\\to\\\\file');
    });

    it('should escape angle brackets for JS context', () => {
      assert.strictEqual(escapeJs('<script>'), '\\x3Cscript\\x3E');
    });

    it('should handle non-string input', () => {
      assert.strictEqual(escapeJs(null as any), '');
    });
  });

  describe('escapeJson', () => {
    it('should escape quotes', () => {
      assert.strictEqual(escapeJson('hello "world"'), 'hello \\"world\\"');
    });

    it('should escape control characters', () => {
      assert.strictEqual(escapeJson('line1\nline2'), 'line1\\nline2');
    });
  });

  describe('sanitizeClassName', () => {
    it('should allow alphanumeric and hyphens', () => {
      assert.strictEqual(sanitizeClassName('my-class'), 'my-class');
      assert.strictEqual(sanitizeClassName('btn-primary'), 'btn-primary');
    });

    it('should lowercase and remove invalid chars', () => {
      assert.strictEqual(sanitizeClassName('My_Class.Name'), 'my_classname');
      assert.strictEqual(sanitizeClassName('class@123'), 'class123');
    });

    it('should limit length', () => {
      const long = 'a'.repeat(100);
      assert.strictEqual(sanitizeClassName(long).length, 64);
    });

    it('should return empty string for invalid input', () => {
      assert.strictEqual(sanitizeClassName(''), '');
      assert.strictEqual(sanitizeClassName('123' as any), '');
    });
  });

  describe('sanitizeId', () => {
    it('should create valid HTML IDs', () => {
      assert.strictEqual(sanitizeId('my-id'), 'my-id');
      assert.strictEqual(sanitizeId('my_id'), 'my-id');
    });

    it('should handle spaces and special chars', () => {
      assert.strictEqual(sanitizeId('my id!'), 'my-id');
    });

    it('should remove leading/trailing hyphens', () => {
      assert.strictEqual(sanitizeId('-test-'), 'test');
    });

    it('should collapse multiple hyphens', () => {
      assert.strictEqual(sanitizeId('my---id'), 'my-id');
    });
  });

  describe('stripXssPatterns', () => {
    it('should remove javascript: URLs', () => {
      assert.strictEqual(stripXssPatterns('javascript:alert(1)'), 'alert(1)');
      assert.strictEqual(stripXssPatterns('JAVASCRIPT:alert(1)'), 'alert(1)');
    });

    it('should remove data: URLs', () => {
      assert.strictEqual(stripXssPatterns('data:text/html,<script>'), '');
    });

    it('should remove event handlers', () => {
      assert.strictEqual(stripXssPatterns('onclick=alert(1)'), '=alert(1)');
      assert.strictEqual(stripXssPatterns('onerror=alert(1)'), '=alert(1)');
    });

    it('should remove expression() CSS', () => {
      assert.strictEqual(stripXssPatterns('expression(alert(1))'), '');
    });

    it('should allow safe URLs', () => {
      assert.strictEqual(stripXssPatterns('https://example.com'), 'https://example.com');
    });
  });

  describe('isValidSqlIdentifier', () => {
    it('should accept valid identifiers', () => {
      assert.ok(isValidSqlIdentifier('users'));
      assert.ok(isValidSqlIdentifier('user_id'));
      assert.ok(isValidSqlIdentifier('camelCase'));
      assert.ok(isValidSqlIdentifier('TableName123'));
    });

    it('should reject invalid identifiers', () => {
      assert.ok(!isValidSqlIdentifier('123table'));
      assert.ok(!isValidSqlIdentifier('user-name'));
      assert.ok(!isValidSqlIdentifier('user name'));
      assert.ok(!isValidSqlIdentifier(''));
    });

    it('should reject SQL injection attempts', () => {
      assert.ok(!isValidSqlIdentifier("'; DROP TABLE users;--"));
      assert.ok(!isValidSqlIdentifier('1 OR 1=1'));
    });

    it('should enforce length limit', () => {
      const long = 'a'.repeat(100);
      assert.ok(!isValidSqlIdentifier(long));
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove path separators', () => {
      assert.strictEqual(sanitizeFilename('path/to/file.txt'), 'path_to_file.txt');
      assert.strictEqual(sanitizeFilename('path\\to\\file.txt'), 'path_to_file.txt');
    });

    it('should remove Windows special chars', () => {
      assert.strictEqual(sanitizeFilename('file<>:"|?*.txt'), 'file.txt');
    });

    it('should limit length', () => {
      const long = 'a'.repeat(300) + '.txt';
      assert.ok(sanitizeFilename(long).length <= 255);
    });

    it('should handle empty/invalid input', () => {
      assert.strictEqual(sanitizeFilename(''), 'unnamed');
      assert.strictEqual(sanitizeFilename(null as any), 'unnamed');
    });
  });

  describe('isSafeUrl', () => {
    it('should accept http/https URLs', () => {
      assert.ok(isSafeUrl('https://example.com'));
      assert.ok(isSafeUrl('http://localhost:3000'));
      assert.ok(isSafeUrl('https://example.com/path?query=value'));
    });

    it('should reject javascript: URLs', () => {
      assert.ok(!isSafeUrl('javascript:alert(1)'));
    });

    it('should reject data: URLs', () => {
      assert.ok(!isSafeUrl('data:text/html,<script>'));
    });

    it('should reject invalid URLs', () => {
      assert.ok(!isSafeUrl('not-a-url'));
      assert.ok(!isSafeUrl(''));
    });
  });

  describe('stripFormatting', () => {
    it('should remove HTML tags', () => {
      assert.strictEqual(stripFormatting('<b>bold</b>'), 'bold');
    });

    it('should remove Markdown', () => {
      assert.strictEqual(stripFormatting('**bold** and *italic*'), 'bold and italic');
    });

    it('should collapse whitespace', () => {
      assert.strictEqual(stripFormatting('hello    world'), 'hello world');
    });
  });

  describe('formatPhoneDisplay', () => {
    it('should format Kenya mobile numbers', () => {
      assert.strictEqual(formatPhoneDisplay('+254700000001'), '+254 700 000 001');
      assert.strictEqual(formatPhoneDisplay('0700000001'), '+254 700 000 001');
      assert.strictEqual(formatPhoneDisplay('254700000001'), '+254 700 000 001');
    });

    it('should handle formatted input', () => {
      assert.strictEqual(formatPhoneDisplay('+254-700-000-001'), '+254 700 000 001');
      assert.strictEqual(formatPhoneDisplay('(0700) 000 001'), '+254 700 000 001');
    });

    it('should return cleaned input for invalid format', () => {
      assert.strictEqual(formatPhoneDisplay('invalid'), 'invalid');
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask default sensitive fields', () => {
      const data = { username: 'john', password: 'secret123' };
      const masked = maskSensitiveData(data) as Record<string, string>;
      assert.strictEqual(masked.username, 'john');
      assert.strictEqual(masked.password, '***MASKED***');
    });

    it('should mask custom fields', () => {
      const data = { name: 'John', customSecret: 'xyz' };
      const masked = maskSensitiveData(data, ['customSecret']) as Record<string, string>;
      assert.strictEqual(masked.customSecret, '***MASKED***');
    });

    it('should handle nested objects', () => {
      const data = { user: { password: 'secret' } };
      const masked = maskSensitiveData(data) as any;
      assert.strictEqual(masked.user.password, '***MASKED***');
    });

    it('should handle arrays', () => {
      const data = [{ password: 'secret1' }, { password: 'secret2' }];
      const masked = maskSensitiveData(data) as Array<any>;
      assert.strictEqual(masked[0]!.password, '***MASKED***');
      assert.strictEqual(masked[1]!.password, '***MASKED***');
    });

    it('should preserve non-sensitive data', () => {
      const data = { id: 1, email: 'test@example.com', name: 'John' };
      const masked = maskSensitiveData(data) as Record<string, any>;
      assert.strictEqual(masked.id, 1);
      assert.strictEqual(masked.email, 'test@example.com');
      assert.strictEqual(masked.name, 'John');
    });
  });
});
