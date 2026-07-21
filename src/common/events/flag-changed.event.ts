import { EnvironmentName } from '@prisma/client';

export const FLAG_CHANGED_EVENT = 'flag.changed';

/**
 * Emitted once a flag mutation has committed. Two independent listeners
 * subscribe to this: the evaluation config cache (invalidate the stale
 * entry) and the SSE broadcaster (push the change to subscribed clients).
 * Keeping mutation and side-effects decoupled via events means neither
 * FlagsService nor its callers need to know the cache or realtime layers
 * exist.
 */
export class FlagChangedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly flagKey: string,
    // undefined when the change was flag-definition-level (name/description/
    // defaultValue) rather than scoped to one environment
    public readonly environment?: EnvironmentName,
  ) {}
}
