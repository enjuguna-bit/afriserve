/**
 * @param {number} principal
 * @param {number} interestRate
 * @param {number} termWeeks
 * @returns {number}
 */
function calculateExpectedTotal(principal: number, interestRate: number, termWeeks: number): number {
  const normalizedTermWeeks = Number(termWeeks);
  const effectiveTermWeeks = Number.isFinite(normalizedTermWeeks) && normalizedTermWeeks > 0
    ? normalizedTermWeeks
    : 52;
  const termFactor = effectiveTermWeeks / 52;
  const simpleInterest = principal * (interestRate / 100) * termFactor;
  const expectedTotal = principal + simpleInterest;
  return Number(expectedTotal.toFixed(2));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function parseId(value: unknown): number | null {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

/**
 * @param {string} isoDate
 * @param {number} monthsToAdd
 * @returns {string}
 */
function addMonthsIso(isoDate: string, monthsToAdd: number): string {
  const date = new Date(isoDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + monthsToAdd;
  const targetDate = new Date(Date.UTC(year, targetMonthIndex, 1));
  const lastDay = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 0)).getUTCDate();
  targetDate.setUTCDate(Math.min(day, lastDay));

  return targetDate.toISOString();
}

/**
 * @param {string} isoDate
 * @param {number} weeksToAdd
 * @returns {string}
 */
function addWeeksIso(isoDate: string, weeksToAdd: number): string {
  const date = new Date(isoDate);
  const millisPerWeek = 7 * 24 * 60 * 60 * 1000;
  const targetDate = new Date(date.getTime() + weeksToAdd * millisPerWeek);
  return targetDate.toISOString();
}

function createHttpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

/**
 * Normalizes a Kenyan phone number to E.164-style (no '+') international format.
 *
 * Handles all common DB variants:
 *   07XXXXXXXX   → 2547XXXXXXXX
 *   7XXXXXXXX    → 2547XXXXXXXX
 *   +2547XXXXXXXX / 2547XXXXXXXX → 2547XXXXXXXX (pass-through)
 *
 * Returns the normalized digits, or the original string if it cannot be
 * confidently recognized as a Kenyan mobile number.
 */
function normalizeKenyanPhone(value: unknown): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  // Already 254-prefixed (12 digits): 2547XXXXXXXX or 2541XXXXXXXX
  if (digits.length === 12 && digits.startsWith("254")) return digits;
  // Local 10-digit format: 07XXXXXXXX or 01XXXXXXXX
  if (digits.length === 10 && digits.startsWith("0")) return `254${digits.slice(1)}`;
  // Short 9-digit without leading zero: 7XXXXXXXX or 1XXXXXXXX
  if (digits.length === 9 && /^[71]/.test(digits)) return `254${digits}`;
  // Fallback: return stripped digits if long enough, otherwise keep raw
  return digits.length >= 7 ? digits : raw;
}

function formatKenyanPhoneDisplay(value: unknown): string | null {
  const normalized = normalizeKenyanPhone(value);
  if (!normalized) {
    return null;
  }
  if (/^254\d{9}$/.test(normalized)) {
    return `+${normalized}`;
  }
  return normalized;
}

export {
  calculateExpectedTotal,
  normalizeEmail,
  parseId,
  addMonthsIso,
  addWeeksIso,
  createHttpError,
  normalizeKenyanPhone,
  formatKenyanPhoneDisplay,
};
