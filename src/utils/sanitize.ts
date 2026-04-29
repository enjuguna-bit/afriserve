/**
 * Input/Output Sanitization Utilities
 * 
 * Provides HTML, SQL, and JavaScript escaping for preventing XSS attacks
 * and ensuring safe output in various contexts.
 */

/**
 * HTML entity encoding map
 */
const HTML_ESCAPE_MAP: ReadonlyMap<string, string> = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#x27;'],
  ['/', '&#x2F;'],
]);

function stripAsciiControlCharacters(value: string): string {
  return Array.from(String(value || ''))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
}

/**
 * Escape HTML special characters to prevent XSS.
 * Use when rendering user input in HTML templates or innerHTML.
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return '';
  }
  return stripXssPatterns(String(unsafe))
    .replace(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP.get(char) ?? char);
}

/**
 * Unescape HTML entities back to their original characters.
 */
export function unescapeHtml(safe: string): string {
  const UNESCAPE_MAP: ReadonlyMap<string, string> = new Map([
    ['&amp;', '&'],
    ['&lt;', '<'],
    ['&gt;', '>'],
    ['&quot;', '"'],
    ['&#x27;', "'"],
    ['&#x2f;', '/'],
    ['&apos;', "'"],
  ]);
  
  return String(safe).replace(/&(?:amp|lt|gt|quot|#x27|#x2F|apos);/g, (entity) => 
    UNESCAPE_MAP.get(entity.toLowerCase()) ?? entity
  );
}

/**
 * Escape JavaScript string content.
 * Use when embedding data in <script> tags or JS strings.
 */
export function escapeJs(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return '';
  }
  return String(unsafe)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/</g, '\\x3C')
    .replace(/>/g, '\\x3E');
}

/**
 * Escape for JSON string context.
 * Safer alternative to JSON.stringify for inline embedding.
 */
export function escapeJson(unsafe: string): string {
  return JSON.stringify(String(unsafe)).slice(1, -1);
}

/**
 * Validate that a string is safe for use as an HTML class name.
 */
export function sanitizeClassName(name: string): string {
  if (typeof name !== 'string') {
    return '';
  }
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/^[^a-z_]+/g, '')
    .slice(0, 64);
}

/**
 * Validate that a string is safe for use as an HTML ID.
 */
export function sanitizeId(id: string): string {
  if (typeof id !== 'string') {
    return '';
  }
  return String(id)
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/**
 * Remove common XSS payload patterns.
 * Does NOT replace proper escaping - use escapeHtml as primary defense.
 */
export function stripXssPatterns(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    // Remove javascript: URLs
    .replace(/javascript\s*:/gi, '')
    // Remove standalone disallowed data: URLs entirely
    .replace(/^data\s*:\s*(?!image\/(?:png|jpeg|gif|webp)|font\/)[\s\S]*$/i, '')
    // Remove data: URLs (except allowed data types)
    .replace(/data\s*:\s*(?!image\/(?:png|jpeg|gif|webp)|font\/)[^'"\\s)]*(?:,[^'"\\s)]*)?/gi, '')
    // Remove event handlers
    .replace(/\bon\w+\b/gi, '')
    // Remove expression() CSS
    .replace(/expression\s*\([^)]*\)\)?/gi, '')
    // Remove url() CSS with javascript
    .replace(/url\s*\(\s*['"]?\s*javascript:/gi, 'url(');
}

/**
 * Validate SQL identifier (table name, column name).
 * Only allows alphanumeric and underscores, must start with letter.
 */
export function isValidSqlIdentifier(identifier: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(identifier) && identifier.length <= 64;
}

/**
 * Sanitize filename for safe storage.
 * Removes path traversal attempts and dangerous characters.
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string' || !filename) {
    return 'unnamed';
  }
  return filename
    // Remove path separators
    .replace(/[/\\]/g, '_')
    // Remove null bytes and control characters
    .replace(/./gs, (segment) => stripAsciiControlCharacters(segment))
    // Remove dangerous Windows characters
    .replace(/[<>:"'|?*]/g, '')
    // Remove leading/trailing dots and spaces
    .replace(/^\.+|\.+$/g, '')
    .trim()
    // Limit length
    .slice(0, 255) || 'unnamed';
}

/**
 * Validate URL is safe (http/https only, no javascript:).
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Remove Markdown/HTML formatting for plain text output.
 */
export function stripFormatting(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove Markdown formatting
    .replace(/[[\]*_`#()>~]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitize phone number for display (Kenya format).
 * Preserves formatting but removes dangerous characters.
 */
export function formatPhoneDisplay(phone: string): string {
  const raw = typeof phone === 'string' ? phone.trim() : '';
  const cleaned = raw.replace(/[^\d+]/g, '');
  // Format: +254 700 000 000
  const match = cleaned.match(/^(\+?254|0)(\d{9})$/);
  if (match) {
    const num = match[2]!;
    return `+254 ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
  }
  return raw;
}

/**
 * Mask sensitive data for logging.
 */
export function maskSensitiveData(data: unknown, fields: string[] = []): unknown {
  const defaultFields = [
    'password', 'token', 'secret', 'key', 'authorization',
    'pin', 'cvv', 'ssn', 'credit_card', 'account_number'
  ];
  const fieldsToMask = [...new Set([...defaultFields, ...fields])];
  
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item, fieldsToMask));
  }
  
  if (data && typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (fieldsToMask.some(f => lowerKey.includes(f.toLowerCase()))) {
        result[key] = '***MASKED***';
      } else {
        result[key] = maskSensitiveData(value, fieldsToMask);
      }
    }
    return result;
  }
  
  return data;
}
