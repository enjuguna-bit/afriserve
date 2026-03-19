/** Simple date-range value object. */
export class DateRange {
  readonly start: Date;
  readonly end: Date;

  private constructor(start: Date, end: Date) {
    if (end < start) throw new Error("DateRange end must be >= start");
    this.start = start;
    this.end = end;
  }

  static of(start: Date, end: Date): DateRange {
    return new DateRange(start, end);
  }

  contains(date: Date): boolean {
    return date >= this.start && date <= this.end;
  }

  daysSpan(): number {
    return Math.round((this.end.getTime() - this.start.getTime()) / (1000 * 60 * 60 * 24));
  }

  equals(other: DateRange): boolean {
    return this.start.getTime() === other.start.getTime() &&
           this.end.getTime() === other.end.getTime();
  }
}
