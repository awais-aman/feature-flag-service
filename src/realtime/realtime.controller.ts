import { Controller, MessageEvent, Param, Sse, UseGuards } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EnvironmentName } from '@prisma/client';
import { Observable, fromEvent } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { TenantMatchGuard } from '../common/guards/tenant-match.guard';
import { FlagChangedEvent, FLAG_CHANGED_EVENT } from '../common/events/flag-changed.event';

/**
 * Bonus real-time distribution: clients subscribe (one long-lived GET, no
 * WebSocket upgrade needed) and receive an event whenever a flag changes for
 * their tenant + environment. Reuses the same `flag.changed` event the
 * config cache invalidator listens to (see FlagConfigCacheService) — one
 * mutation, two independent downstream effects, neither aware of the other.
 *
 * Single-instance limitation: this broadcasts via an in-process EventEmitter,
 * so it only reaches clients connected to the same Cloud Run instance that
 * handled the mutation. Correct today (min instance count can be 0-1 per
 * environment in this deployment), but a multi-instance production
 * deployment would need Redis pub/sub to fan the event out to every
 * instance's connected clients — noted as a follow-up in the README rather
 * than built now, since it adds real complexity for a bonus feature.
 */
@Controller('api/v1/tenants/:tenantId/environments/:environment')
@UseGuards(ApiKeyGuard, TenantMatchGuard)
export class RealtimeController {
  constructor(private readonly events: EventEmitter2) {}

  @Sse('stream')
  stream(
    @Param('tenantId') tenantId: string,
    @Param('environment') environment: EnvironmentName,
  ): Observable<MessageEvent> {
    return fromEvent(this.events, FLAG_CHANGED_EVENT).pipe(
      filter((event: FlagChangedEvent) => {
        if (event.tenantId !== tenantId) return false;
        // undefined environment on the event means a flag-definition-level
        // change (name/description/defaultValue) that applies to every
        // environment, so it's relevant to every subscriber for this tenant.
        return !event.environment || event.environment === environment;
      }),
      map((event: FlagChangedEvent) => ({
        data: { flagKey: event.flagKey, environment: event.environment ?? null },
      })),
    );
  }
}
