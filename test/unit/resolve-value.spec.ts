import { FlagType } from '@prisma/client';
import { resolveValue } from '../../src/evaluation/evaluation.service';
import { ResolvedFlagConfig } from '../../src/evaluation/flag-config-cache.service';
import { isInRollout } from '../../src/common/utils/rollout-hash.util';

function config(overrides: Partial<ResolvedFlagConfig>): ResolvedFlagConfig {
  return {
    flagId: 'flag-1',
    key: 'checkout',
    type: FlagType.BOOLEAN,
    defaultValue: false,
    archivedAt: null,
    environmentId: 'env-1',
    enabled: true,
    rolloutPercentage: 100,
    variants: null,
    targetingRules: null,
    ...overrides,
  };
}

describe('resolveValue', () => {
  it('lets a targeting override win even when the flag is disabled', () => {
    const result = resolveValue(
      config({ enabled: false, targetingRules: { userIds: ['qa-user'], value: true } }),
      'qa-user',
    );
    expect(result).toMatchObject({ value: true, reason: 'targeting_override' });
  });

  it('falls back to defaultValue for a targeted user when the rule has no value', () => {
    const result = resolveValue(
      config({ defaultValue: false, targetingRules: { userIds: ['qa-user'] } }),
      'qa-user',
    );
    expect(result).toMatchObject({ value: false, reason: 'targeting_override' });
  });

  it('serves defaultValue with flag_disabled when the environment is off', () => {
    const result = resolveValue(
      config({ type: FlagType.STRING, defaultValue: 'blue', enabled: false }),
      'u1',
    );
    expect(result).toMatchObject({ value: 'blue', reason: 'flag_disabled' });
  });

  it('gates BOOLEAN flags on the deterministic rollout bucket', () => {
    const users = Array.from({ length: 200 }, (_, i) => `user-${i}`);
    for (const user of users) {
      const result = resolveValue(config({ rolloutPercentage: 40 }), user);
      const expected = isInRollout('checkout', user, 40);
      expect(result.value).toBe(expected);
      expect(result.reason).toBe(expected ? 'percentage_rollout' : 'default');
    }
  });

  it('picks a STRING variant inside the rollout and defaultValue outside it', () => {
    const variants = [
      { value: 'short', weight: 1 },
      { value: 'long', weight: 1 },
    ];
    const inside = resolveValue(config({ type: FlagType.STRING, defaultValue: 'control', variants }), 'u1');
    expect(['short', 'long']).toContain(inside.value);
    expect(inside.reason).toBe('percentage_rollout');

    const outside = resolveValue(
      config({ type: FlagType.STRING, defaultValue: 'control', variants, rolloutPercentage: 0 }),
      'u1',
    );
    expect(outside).toMatchObject({ value: 'control', reason: 'default' });
  });

  it('serves defaultValue for a STRING flag with no variants configured', () => {
    const result = resolveValue(config({ type: FlagType.STRING, defaultValue: 'control' }), 'u1');
    expect(result).toMatchObject({ value: 'control', reason: 'default' });
  });

  it('serves defaultValue for an enabled NUMBER flag regardless of rollout', () => {
    const result = resolveValue(
      config({ type: FlagType.NUMBER, defaultValue: 25, rolloutPercentage: 0 }),
      'u1',
    );
    expect(result).toMatchObject({ value: 25, reason: 'default' });
  });
});
