const MICRO_PER_RUPEE = 1_000_000;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const integer = new Intl.NumberFormat("en-IN");

/** The API reports money as integer micro-rupees (₹1 = 1,000,000). */
export function formatInr(microRupees: number): string {
  const rupees = microRupees / MICRO_PER_RUPEE;
  // Single requests often cost under a paisa; show enough digits to be non-zero.
  return Math.abs(rupees) > 0 && Math.abs(rupees) < 0.01
    ? inrPrecise.format(rupees)
    : inr.format(rupees);
}

export function formatCount(value: number): string {
  return integer.format(value);
}

/** Converts a rupee amount typed by a user into integer micro-rupees. */
export function rupeesToMicro(rupees: number): number {
  return Math.round(rupees * MICRO_PER_RUPEE);
}

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}
