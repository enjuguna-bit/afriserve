/** Wraps a national ID string. Stores normalized (trimmed, lowercased) form. */
export class NationalId {
  readonly raw: string;
  readonly normalized: string;

  private constructor(raw: string) {
    this.raw = raw.trim();
    this.normalized = this.raw.toLowerCase();
  }

  static fromString(value: string): NationalId {
    const trimmed = (value || "").trim();
    if (trimmed.length < 4) throw new Error("National ID must be at least 4 characters");
    if (trimmed.length > 50) throw new Error("National ID must be at most 50 characters");
    return new NationalId(trimmed);
  }

  equals(other: NationalId): boolean { return this.normalized === other.normalized; }
  toString(): string { return this.raw; }
  get value(): string { return this.raw; }
}
