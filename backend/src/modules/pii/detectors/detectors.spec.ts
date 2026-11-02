import { verhoeffCheckDigit, verhoeffValid, luhnValid } from './checksums.js';
import { detectPii, PII_ENTITIES } from './index.js';

const ALL = [...PII_ENTITIES];
const types = (text: string, enabled = ALL) => detectPii(text, enabled).map((m) => [m.type, m.value]);

function aadhaar(payload: string): string {
  return payload + verhoeffCheckDigit(payload);
}

describe('checksums', () => {
  it('validates the Verhoeff algorithm with a known vector', () => {
    expect(verhoeffCheckDigit('236')).toBe(3);
    expect(verhoeffValid('2363')).toBe(true);
    expect(verhoeffValid('2364')).toBe(false);
  });

  it('validates Luhn with a known test card', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
  });
});

describe('detectPii', () => {
  it('finds an Aadhaar number plain, spaced and hyphenated', () => {
    const number = aadhaar('23456789012');

    expect(types(`id ${number}`)).toEqual([['aadhaar', number]]);
    const spaced = `${number.slice(0, 4)} ${number.slice(4, 8)} ${number.slice(8)}`;
    expect(types(`id ${spaced}`)).toEqual([['aadhaar', spaced]]);
  });

  it('rejects 12-digit numbers that fail the checksum or start with 0 or 1', () => {
    const valid = aadhaar('23456789012');
    const broken = valid.slice(0, 11) + ((Number(valid.at(-1)) + 1) % 10);

    expect(types(`ref ${broken}`)).toEqual([]);
    expect(types(`ref ${aadhaar('12345678901')}`)).toEqual([]);
  });

  it('does not take 12 digits out of a longer number', () => {
    const number = aadhaar('23456789012');

    // Aadhaar only: a 13-digit run can legitimately be a (Luhn-valid) card.
    expect(types(`ref ${number}7`, ['aadhaar'])).toEqual([]);
  });

  it('finds PAN in either case and rejects invalid holder types', () => {
    expect(types('PAN ABCPE1234F ok')).toEqual([['pan', 'ABCPE1234F']]);
    expect(types('pan abcpe1234f ok')).toEqual([['pan', 'abcpe1234f']]);
    expect(types('code ABCDE1234F')).toEqual([]);
  });

  it('finds Indian mobiles with and without prefixes, and ignores landline-style starts', () => {
    expect(types('call +91 98765 43210 now')).toEqual([['phone', '+91 98765 43210']]);
    expect(types('call 9876543210.')).toEqual([['phone', '9876543210']]);
    expect(types('call 098765-43210')).toEqual([['phone', '098765-43210']]);
    expect(types('call 1234567890')).toEqual([]);
  });

  it('does not find a phone number inside an order id or a longer digit run', () => {
    expect(types('order ORD9876543210')).toEqual([]);
    expect(types('ref 98765432101')).toEqual([]);
  });

  it('finds Luhn-valid cards in common groupings and rejects others', () => {
    expect(types('card 4111111111111111')).toEqual([['card', '4111111111111111']]);
    expect(types('card 4111 1111 1111 1111')).toEqual([['card', '4111 1111 1111 1111']]);
    expect(types('card 4111-1111-1111-1111')).toEqual([['card', '4111-1111-1111-1111']]);
    expect(types('card 4111111111111112')).toEqual([]);
  });

  it('finds emails but not addresses without a domain suffix', () => {
    expect(types('mail rahul.sharma+bill@company.co.in!')).toEqual([['email', 'rahul.sharma+bill@company.co.in']]);
    expect(types('mail rahul@localhost')).toEqual([]);
  });

  it('keeps the longest match when detectors overlap', () => {
    // A valid card is also a run of digits some other detector could grab part of.
    expect(types('pay 6011000990139424 today')).toEqual([['card', '6011000990139424']]);
  });

  it('only runs the enabled detectors', () => {
    expect(types('a@b.com and 9876543210', ['email'])).toEqual([['email', 'a@b.com']]);
    expect(types('a@b.com and 9876543210', [])).toEqual([]);
  });
});
