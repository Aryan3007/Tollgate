import { luhnCheckDigit, verhoeffCheckDigit } from '../../../src/modules/pii/detectors/checksums.js';
import type { PiiEntity } from '../../../src/modules/pii/detectors/index.js';

// A labelled test set, generated deterministically (seeded) so every run sees
// the same 300+ sentences. Positives carry the exact spans that must be found;
// negatives are look-alikes that must NOT be flagged.

export interface Span {
  type: PiiEntity;
  value: string;
}
export interface Case {
  text: string;
  expected: Span[];
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const rand = rng(20261030);
const int = (n: number) => Math.floor(rand() * n);
const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
const digits = (n: number, first?: string) => (first ?? '') + Array.from({ length: n - (first?.length ?? 0) }, () => int(10)).join('');

function aadhaar(): string {
  const payload = digits(11, String(2 + int(8)));
  return payload + verhoeffCheckDigit(payload);
}
function badAadhaar(): string {
  const valid = aadhaar();
  const last = (Number(valid.at(-1)) + 1 + int(9)) % 10;
  return valid.slice(0, 11) + last;
}
const group4 = (n: string, sep: string) => `${n.slice(0, 4)}${sep}${n.slice(4, 8)}${sep}${n.slice(8)}`;

function pan(): string {
  const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + int(26))).join('');
  const raw = `${letters(3)}${pick('PCHFATBLJG'.split(''))}${letters(1)}${digits(4)}${letters(1)}`;
  return rand() < 0.15 ? raw.toLowerCase() : raw;
}
function badPan(): string {
  const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + int(26))).join('');
  // 4th letter outside the valid holder types, or the wrong shape entirely.
  return pick([
    `${letters(3)}${pick('DEIKMNOQRSUVWXYZ'.split(''))}${letters(1)}${digits(4)}${letters(1)}`,
    `${letters(4)}${digits(4)}${letters(1)}`,
    `${letters(3)}P${letters(1)}${digits(5)}${letters(1)}`,
  ]);
}

function phone(): string {
  const local = digits(10, String(6 + int(4)));
  return pick([
    local,
    `${local.slice(0, 5)} ${local.slice(5)}`,
    `+91 ${local}`,
    `+91-${local.slice(0, 5)}-${local.slice(5)}`,
    `0${local}`,
    `91${local}`,
  ]);
}
function badPhone(): string {
  return pick([digits(10, String(1 + int(5))), digits(9, String(6 + int(4))), digits(11, '9')]);
}

function card(): string {
  const length = pick([13, 15, 16, 16, 16, 19]);
  const payload = digits(length - 1, pick(['4', '5', '37', '6']));
  const full = payload + luhnCheckDigit(payload);
  return pick([full, full.replace(/(\d{4})(?=\d)/g, '$1 '), full.replace(/(\d{4})(?=\d)/g, '$1-')]);
}
function badCard(): string {
  const length = pick([13, 16, 16, 19]);
  const payload = digits(length - 1, '4');
  const check = luhnCheckDigit(payload);
  return payload + ((check + 1 + int(8)) % 10);
}

const NAMES = ['rahul.sharma', 'priya_k', 'anil.verma99', 'support', 'meera.iyer', 'dev+billing'];
const DOMAINS = ['gmail.com', 'company.co.in', 'outlook.com', 'startup.io', 'mail.example.org'];
const email = () => `${pick(NAMES)}@${pick(DOMAINS)}`;
const badEmail = () => pick(['rahul.sharma@localhost', 'rahul.sharma at gmail dot com', '@gmail.com', 'not-an-email@']);

const POSITIVE_TEMPLATES: Record<PiiEntity, Array<(v: string) => string>> = {
  aadhaar: [
    (v) => `My Aadhaar number is ${v}, please update my address.`,
    (v) => `Verify aadhaar ${v} against the KYC record`,
    (v) => `आधार ${v} से लिंक करें`,
    (v) => `uid: ${v}.`,
  ],
  pan: [
    (v) => `PAN: ${v} for the tax filing.`,
    (v) => `Customer's PAN card number ${v} is on file`,
    (v) => `Please check ${v}, it was rejected.`,
  ],
  phone: [
    (v) => `Call me on ${v} after 5pm.`,
    (v) => `Contact: ${v}, ask for Rahul`,
    (v) => `mera number ${v} hai.`,
    (v) => `WhatsApp ${v}`,
  ],
  card: [
    (v) => `My card number is ${v}, expiry 08/28.`,
    (v) => `Charge ${v} for the renewal`,
    (v) => `Card ${v}.`,
  ],
  email: [
    (v) => `Send the invoice to ${v} today.`,
    (v) => `Email: ${v}`,
    (v) => `cc ${v}, and keep it short`,
  ],
};

const NEGATIVE_TEMPLATES = [
  (v: string) => `Order ${v} has shipped.`,
  (v: string) => `Reference ${v} was not found`,
  (v: string) => `The code is ${v}.`,
  (v: string) => `Ticket #${v}`,
];

const PLAIN = [
  'Summarise our refund policy in two lines.',
  'What is the GST rate on software services in India?',
  'Translate "good morning" into Tamil.',
  'Write a SQL query that lists orders from the last 7 days.',
  'The meeting is on 12/11/2026 at 10:30 in room 4.',
  'Our revenue grew 12.5% to ₹4,50,00,000 this quarter.',
  'Invoice INV-2026-004512 totals 118000 rupees.',
  'Pincode 560001, Bengaluru.',
];

const generators: Record<PiiEntity, () => string> = { aadhaar, pan, phone, card, email };
const badGenerators: Record<PiiEntity, () => string> = {
  aadhaar: badAadhaar,
  pan: badPan,
  phone: badPhone,
  card: badCard,
  email: badEmail,
};

function build(): Case[] {
  const cases: Case[] = [];

  for (const type of Object.keys(generators) as PiiEntity[]) {
    for (let i = 0; i < 40; i++) {
      let value = generators[type]();
      if (type === 'aadhaar') value = pick([value, group4(value, ' '), group4(value, '-')]);
      cases.push({ text: pick(POSITIVE_TEMPLATES[type])(value), expected: [{ type, value }] });
    }
    for (let i = 0; i < 20; i++) {
      cases.push({ text: pick(NEGATIVE_TEMPLATES)(badGenerators[type]()), expected: [] });
    }
  }

  // Several kinds in one message.
  for (let i = 0; i < 20; i++) {
    const a = aadhaar();
    const p = phone();
    const e = email();
    cases.push({
      text: `Customer ${e} (Aadhaar ${a}) can be reached on ${p}.`,
      expected: [
        { type: 'email', value: e },
        { type: 'aadhaar', value: a },
        { type: 'phone', value: p },
      ],
    });
  }

  for (const text of PLAIN) for (let i = 0; i < 3; i++) cases.push({ text, expected: [] });
  return cases;
}

export const DATASET: Case[] = build();
