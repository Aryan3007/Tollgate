import { findAll, type PiiDetector } from './types.js';

// AAAAA9999A. The 4th letter is the holder type (P person, C company, H HUF,
// F firm, A AOP, T trust, B BOI, L local authority, J juridical person,
// G government). Case-insensitive because people type it either way.
const PAN = /(?<![A-Za-z0-9])[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z](?![A-Za-z0-9])/gi;

export const panDetector: PiiDetector = {
  type: 'pan',
  find: (text) => findAll('pan', PAN, text),
};
