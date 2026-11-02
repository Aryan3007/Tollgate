// Verhoeff tables (the algorithm UIDAI uses for the Aadhaar check digit).
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;

const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9] as const;

const digitsOf = (value: string) => value.split('').map(Number);

/** True when the last digit of `digits` is a valid Verhoeff check digit. */
export function verhoeffValid(digits: string): boolean {
  let c = 0;
  digitsOf(digits)
    .reverse()
    .forEach((digit, i) => {
      c = D[c]![P[i % 8]![digit]!]!;
    });
  return c === 0;
}

/** The check digit to append to `payload` (used to build test fixtures). */
export function verhoeffCheckDigit(payload: string): number {
  let c = 0;
  digitsOf(payload)
    .reverse()
    .forEach((digit, i) => {
      c = D[c]![P[(i + 1) % 8]![digit]!]!;
    });
  return INV[c]!;
}

/** True when `digits` passes the Luhn check used by payment cards. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** The Luhn digit to append to `payload` (used to build test fixtures). */
export function luhnCheckDigit(payload: string): number {
  for (let candidate = 0; candidate < 10; candidate++) {
    if (luhnValid(payload + candidate)) return candidate;
  }
  throw new Error('unreachable');
}
