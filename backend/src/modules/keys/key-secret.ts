import { createHmac, randomInt } from 'node:crypto';

const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const KEY_PREFIX = 'tg_live_';
const RANDOM_LENGTH = 32;
const DISPLAY_PREFIX_LENGTH = 12;

/** 32 base62 characters ≈ 190 bits of entropy. */
export function generateKeySecret(): string {
  let random = '';
  for (let i = 0; i < RANDOM_LENGTH; i++) {
    random += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${KEY_PREFIX}${random}`;
}

export function displayPrefix(secret: string): string {
  return secret.slice(0, DISPLAY_PREFIX_LENGTH);
}

/**
 * Keys are high-entropy, so a fast keyed hash is enough and keeps lookups to
 * one indexed query. The pepper means a leaked table cannot be used to check
 * guessed keys offline.
 */
export function hashKeySecret(pepper: string, secret: string): string {
  return createHmac('sha256', pepper).update(secret).digest('hex');
}

export function looksLikeKeySecret(value: string): boolean {
  return (
    value.startsWith(KEY_PREFIX) &&
    value.length === KEY_PREFIX.length + RANDOM_LENGTH
  );
}
