import { luhnValid } from './checksums.js';
import { digitsOnly, findAll, type PiiDetector } from './types.js';

// 13-19 digits, optionally separated by single spaces or hyphens, passing Luhn.
const CARD = /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g;

export const cardDetector: PiiDetector = {
  type: 'card',
  find: (text) =>
    findAll('card', CARD, text, (value) => {
      const digits = digitsOnly(value);
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
    }),
};
