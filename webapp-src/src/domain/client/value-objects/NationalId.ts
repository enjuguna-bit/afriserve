/**
 * National ID Value Object
 * Validates Kenyan national ID numbers
 */

export class NationalId {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static fromString(value: string): NationalId {
    const cleaned = value.trim().replace(/\s+/g, '');

    // Kenyan national ID: 6-9 digits
    const idPattern = /^\d{6,9}$/;

    if (!idPattern.test(cleaned)) {
      throw new Error(
        `Invalid national ID format: ${value}. Expected 6-9 digits`
      );
    }

    return new NationalId(cleaned);
  }

  get value(): string {
    return this._value;
  }

  equals(other: NationalId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
