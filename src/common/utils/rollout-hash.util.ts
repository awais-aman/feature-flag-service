import { createHash } from 'crypto';

/**
 * Deterministically maps a (flagKey, userId) pair to an integer bucket in
 * [0, 99]. The same pair always produces the same bucket — this is what makes
 * percentage rollouts sticky: a user who's in the 30% rollout today is still
 * in it tomorrow, even as other users are added or removed from the flag.
 *
 * Keying the hash on `${flagKey}:${userId}` (not just userId) means each flag
 * gets an independent, uncorrelated bucket assignment per user — a user in
 * the first 10% of flag A is not necessarily in the first 10% of flag B, so
 * rollouts of unrelated flags don't accidentally always land on the same
 * cohort of users.
 *
 * SHA-256 gives a uniform, well-distributed output; we only need the first 4
 * bytes (32 bits) to get a bucket with far more resolution than 0-99 requires.
 */
export function bucketFor(flagKey: string, userId: string): number {
  const digest = createHash('sha256').update(`${flagKey}:${userId}`).digest();
  const uint32 = digest.readUInt32BE(0);
  return uint32 % 100;
}

/**
 * True if this user falls within the flag's rollout percentage. A flag rolled
 * out to 30% sends buckets [0, 29] to `true` — as rolloutPercentage increases
 * over time, users already in the enabled set (lower buckets) stay in it, and
 * new buckets are simply added on top. Nobody flips from true back to false
 * as the percentage climbs.
 */
export function isInRollout(flagKey: string, userId: string, rolloutPercentage: number): boolean {
  return bucketFor(flagKey, userId) < rolloutPercentage;
}

export interface WeightedVariant {
  value: string | number | boolean;
  weight: number; // relative weight, weights across all variants need not sum to 100
}

/**
 * Deterministically selects one variant for a user from a weighted list,
 * reusing the same bucket-in-[0,99] primitive as boolean rollouts. Weights
 * are normalized against their sum and mapped onto cumulative ranges of the
 * 0-99 bucket space, e.g. variants A(weight 1)/B(weight 1)/C(weight 2) map to
 * A=[0,24], B=[25,49], C=[50,99].
 */
export function selectVariant<T extends WeightedVariant>(flagKey: string, userId: string, variants: T[]): T {
  if (variants.length === 0) {
    throw new Error('Cannot select a variant from an empty list');
  }
  const bucket = bucketFor(flagKey, userId);
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight <= 0) {
    return variants[0];
  }

  let cumulative = 0;
  const scale = 100 / totalWeight;
  for (const variant of variants) {
    cumulative += variant.weight * scale;
    if (bucket < cumulative) {
      return variant;
    }
  }
  return variants[variants.length - 1];
}
