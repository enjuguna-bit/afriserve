export class ClientId {
  private constructor(readonly value: number) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid ClientId: ${value}`);
  }
  static fromNumber(value: number): ClientId { return new ClientId(value); }
  equals(other: ClientId): boolean { return this.value === other.value; }
  toString(): string { return String(this.value); }
}
