import { bucketFor, isInRollout, selectVariant } from '../../src/common/utils/rollout-hash.util';

function usersRange(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `user-${i}`);
}

describe('bucketFor (deterministic hashing)', () => {
  it('is deterministic: same flagKey+userId always yields the same bucket', () => {
    const results = new Set<number>();
    for (let i = 0; i < 50; i++) {
      results.add(bucketFor('checkout-redesign', 'user-42'));
    }
    expect(results.size).toBe(1);
  });

  it('always returns a value in [0, 99]', () => {
    for (const userId of usersRange(1000)) {
      const bucket = bucketFor('some-flag', userId);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(99);
    }
  });

  it('distributes users roughly uniformly across buckets', () => {
    const buckets = new Array(100).fill(0);
    const sampleSize = 20_000;
    for (const userId of usersRange(sampleSize)) {
      buckets[bucketFor('uniformity-check', userId)]++;
    }
    const expectedPerBucket = sampleSize / 100;
    for (const count of buckets) {
      // generous tolerance — this is a sanity check on distribution shape,
      // not a strict statistical test
      expect(count).toBeGreaterThan(expectedPerBucket * 0.5);
      expect(count).toBeLessThan(expectedPerBucket * 1.5);
    }
  });

  it('gives different, uncorrelated bucket assignments for different flag keys', () => {
    const users = usersRange(500);
    const bucketsA = users.map((u) => bucketFor('flag-a', u));
    const bucketsB = users.map((u) => bucketFor('flag-b', u));
    const sameCount = bucketsA.filter((b, i) => b === bucketsB[i]).length;
    // if buckets were correlated we'd see ~100% matches; uncorrelated should
    // land near the 1/100 chance of an accidental match
    expect(sameCount).toBeLessThan(users.length * 0.1);
  });
});

describe('isInRollout (percentage rollout)', () => {
  it('is deterministic and stable across repeated evaluations', () => {
    const first = isInRollout('new-checkout', 'user-7', 30);
    for (let i = 0; i < 20; i++) {
      expect(isInRollout('new-checkout', 'user-7', 30)).toBe(first);
    }
  });

  it('approximates the requested rollout percentage over many users', () => {
    const users = usersRange(20_000);
    const enabledCount = users.filter((u) => isInRollout('gradual-rollout', u, 30)).length;
    const actualPercentage = (enabledCount / users.length) * 100;
    expect(actualPercentage).toBeGreaterThan(27);
    expect(actualPercentage).toBeLessThan(33);
  });

  it('is monotonic: every user in a lower rollout % remains in every higher rollout %', () => {
    const users = usersRange(5000);
    const at10 = new Set(users.filter((u) => isInRollout('sticky-flag', u, 10)));
    const at30 = new Set(users.filter((u) => isInRollout('sticky-flag', u, 30)));
    const at70 = new Set(users.filter((u) => isInRollout('sticky-flag', u, 70)));

    for (const user of at10) {
      expect(at30.has(user)).toBe(true);
    }
    for (const user of at30) {
      expect(at70.has(user)).toBe(true);
    }
  });

  it('0% rollout enables nobody, 100% rollout enables everybody', () => {
    const users = usersRange(1000);
    expect(users.every((u) => !isInRollout('off-flag', u, 0))).toBe(true);
    expect(users.every((u) => isInRollout('fully-on-flag', u, 100))).toBe(true);
  });
});

describe('selectVariant (weighted variant selection)', () => {
  const variants = [
    { value: 'control', weight: 1 },
    { value: 'treatment-a', weight: 1 },
    { value: 'treatment-b', weight: 2 },
  ];

  it('is deterministic for a given user', () => {
    const first = selectVariant('experiment', 'user-99', variants);
    for (let i = 0; i < 10; i++) {
      expect(selectVariant('experiment', 'user-99', variants)).toEqual(first);
    }
  });

  it('distributes users across variants roughly matching their weights', () => {
    const users = usersRange(20_000);
    const counts: Record<string, number> = { control: 0, 'treatment-a': 0, 'treatment-b': 0 };
    for (const user of users) {
      const selected = selectVariant('weighted-experiment', user, variants);
      counts[selected.value as string]++;
    }
    // weights 1:1:2 => expected shares 25%/25%/50%
    expect(counts.control / users.length).toBeGreaterThan(0.2);
    expect(counts.control / users.length).toBeLessThan(0.3);
    expect(counts['treatment-b'] / users.length).toBeGreaterThan(0.45);
    expect(counts['treatment-b'] / users.length).toBeLessThan(0.55);
  });

  it('throws on an empty variant list', () => {
    expect(() => selectVariant('bad-experiment', 'user-1', [])).toThrow();
  });
});
