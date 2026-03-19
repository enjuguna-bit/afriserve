/**
 * Client ID Value Object
 * Represents a unique client identifier
 */

export class ClientId {
  private readonly _value: number;

  private constructor(value: number) {
    this._value = value;
  }

  static fromNumber(value: number): ClientId {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid client ID: ${value}. Must be a positive integer`);
    }
    return new ClientId(value);
  }

  static generate(): ClientId {
    // Note: In real implementation, this would generate a unique ID
    // For now, we'll let the database handle auto-increment
    return new ClientId(0); // Placeholder, will be set by database
  }

  get value(): number {
    return this._value;
  }

  equals(other: ClientId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value.toString();
  }

  toReferenceCode(): string {
    return `BRW-${String(this._value).padStart(6, '0')}`;
  }
}
