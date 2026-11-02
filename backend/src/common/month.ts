/** UTC month, e.g. "2026-10". Budgets and usage reset at 00:00 UTC on the 1st. */
export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}
