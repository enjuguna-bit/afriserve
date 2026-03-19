/** Phone number value object. Stores raw and digit-only forms. */
export class PhoneNumber {
  readonly raw: string;
  readonly digits: string;

  private constructor(raw: string) {
    this.raw = raw.trim();
    this.digits = this.raw.replace(/\D+/g, "");
  }

  static fromString(value: string): PhoneNumber {
    const trimmed = (value || "").trim();
    if (trimmed.length < 6) throw new Error("Phone number must be at least 6 characters");
    if (trimmed.length > 40) throw new Error("Phone number must be at most 40 characters");
    return new PhoneNumber(trimmed);
  }

  equals(other: PhoneNumber): boolean { return this.digits === other.digits; }
  toString(): string { return this.raw; }
  get value(): string { return this.raw; }
}
