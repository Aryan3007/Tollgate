import { findAll, type PiiDetector } from './types.js';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export const emailDetector: PiiDetector = {
  type: 'email',
  find: (text) => findAll('email', EMAIL, text),
};
