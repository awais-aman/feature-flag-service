import { createHmac, randomBytes } from 'crypto';

const KEY_PREFIX_LENGTH = 8;

/**
 * Generates a new raw API key. Format: ffk_<43 base64url chars> (~32 bytes of entropy).
 * The raw value is returned to the caller exactly once at creation time and is
 * never persisted — only its digest (see hashApiKey) is stored.
 */
export function generateApiKey(): string {
  const token = randomBytes(32).toString('base64url');
  return `ffk_${token}`;
}

export function apiKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, KEY_PREFIX_LENGTH);
}

/**
 * HMAC-SHA256 digest of an API key using a server-side pepper (API_KEY_PEPPER).
 * Deterministic by design so it can be used as a unique, indexable lookup
 * column — unlike bcrypt, which salts randomly and requires an O(n)
 * compare-against-every-row scan to find a match. High-entropy, random,
 * machine-generated tokens (unlike user passwords) don't need bcrypt's slow,
 * per-candidate hashing to resist brute force; they need a fast, safe lookup.
 */
export function hashApiKey(rawKey: string, pepper: string): string {
  return createHmac('sha256', pepper).update(rawKey).digest('hex');
}
