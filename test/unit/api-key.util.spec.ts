import { apiKeyPrefix, generateApiKey, hashApiKey } from '../../src/common/utils/api-key.util';

describe('api-key.util', () => {
  it('generates keys with the expected prefix and sufficient entropy', () => {
    const key = generateApiKey();
    expect(key.startsWith('ffk_')).toBe(true);
    expect(key.length).toBeGreaterThan(40);
  });

  it('generates unique keys on each call', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateApiKey()));
    expect(keys.size).toBe(1000);
  });

  it('hashApiKey is deterministic for the same key and pepper', () => {
    const key = generateApiKey();
    expect(hashApiKey(key, 'pepper-1')).toBe(hashApiKey(key, 'pepper-1'));
  });

  it('hashApiKey produces different digests for different peppers (pepper actually matters)', () => {
    const key = generateApiKey();
    expect(hashApiKey(key, 'pepper-1')).not.toBe(hashApiKey(key, 'pepper-2'));
  });

  it('hashApiKey produces different digests for different keys', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(hashApiKey(a, 'pepper')).not.toBe(hashApiKey(b, 'pepper'));
  });

  it('apiKeyPrefix returns the first 8 characters', () => {
    const key = 'ffk_abcdefghijklmnop';
    expect(apiKeyPrefix(key)).toBe('ffk_abcd');
  });
});
