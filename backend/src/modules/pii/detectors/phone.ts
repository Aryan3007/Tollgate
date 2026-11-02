import { findAll, type PiiDetector } from './types.js';

// Indian mobile: 10 digits starting 6-9, optionally split 5+5, with an
// optional +91 / 0091 / 91 / 0 prefix. Must not sit inside a longer digit run
// or a word, so order numbers and 16-digit cards do not match.
const PHONE = /(?<!\w)(?:(?:\+91|0091|91|0)[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g;

export const phoneDetector: PiiDetector = {
  type: 'phone',
  find: (text) => findAll('phone', PHONE, text),
};
