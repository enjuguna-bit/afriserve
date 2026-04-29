import { normalizeKenyanPhone } from "../../../utils/helpers.js";

/** Phone number value object. Normalises to Kenyan E.164-style (2547XXXXXXXX) on construction. */
export class PhoneNumber {
  readonly raw: string;
  readonly digits: string;
  readonly normalized: string;

  private constructor(raw: string) {
    this.raw = raw.trim();
    this.normalized = normalizeKenyanPhone(this.raw);
    this.digits = this.normalized.replace(/\D+/g, "");
  }

  static fromString(value: string): PhoneNumber {
    const trimmed = (value || "").trim();
    if (trimmed.length < 6) throw new Error("Phone number must be at least 6 characters");
    if (trimmed.length > 40) throw new Error("Phone number must be at most 40 characters");
    return new PhoneNumber(trimmed);
  }

  equals(other: PhoneNumber): boolean { return this.digits === other.digits; }
  toString(): string { return this.normalized; }
  /** Returns the normalised 2547XXXXXXXX form for DB storage. */
  get value(): string { return this.normalized; }
  /** Returns the original raw input (for display / audit trails). */
  get rawValue(): string { return this.raw; }
}
