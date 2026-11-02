import { verhoeffValid } from './checksums.js';
import { digitsOnly, findAll, type PiiDetector } from './types.js';

// 12 digits, first digit 2-9, optionally grouped 4-4-4 with one consistent
// separator. The Verhoeff check digit removes ~90% of random 12-digit numbers.
const AADHAAR = /(?<!\d)[2-9]\d{3}([ -]?)\d{4}\1\d{4}(?!\d)/g;

export const aadhaarDetector: PiiDetector = {
  type: 'aadhaar',
  find: (text) => findAll('aadhaar', AADHAAR, text, (value) => verhoeffValid(digitsOnly(value))),
};
