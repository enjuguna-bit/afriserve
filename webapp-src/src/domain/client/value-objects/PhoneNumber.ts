/**
 * Phone Number Value Object
 * Validates and normalizes phone numbers (Kenyan format)
 */

export class PhoneNumber {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static fromString(value: string): PhoneNumber {
    const cleaned = value.trim().replace(/\s+/g, '');

    // Kenyan phone number validation
    // Accepts: +254XXXXXXXXX, 254XXXXXXXXX, 07XXXXXXXX, 01XXXXXXXX
    const kenyaPattern = /^(?:\+254|254|0)([17]\d{8})$/;
    const match = cleaned.match(kenyaPattern);

    if (!match) {
      throw new Error(
        `Invalid phone number format: ${value}. Expected Kenyan format (e.g., +254712345678, 0712345678)`
      );
    }

    // Normalize to +254 format
    const normalized = `+254${match[1]}`;
    return new PhoneNumber(normalized);
  }

  get value(): string {
    return this._value;
  }

  get localFormat(): string {
    // Convert +254712345678 to 0712345678
    return `0${this._value.slice(4)}`;
  }

  get internationalFormat(): string {
    return this._value;
  }

  equals(other: PhoneNumber): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
