import { NoopTelemetry } from '@shared/telemetry';
import { getSupabaseClient } from '@core/auth/infrastructure/SupabaseClient';
import type { TelemetryEventName } from '@core/telemetry/domain/TelemetryEventName';
import type { UserAgentInspector } from '@shared/browser';
import type { Telemetry } from '@core/telemetry/domain/Telemetry';

export interface TelemetryDependencies {
  readonly userAgentInspector: UserAgentInspector;
  readonly appVersion: string;
}

export interface TelemetryModule {
  readonly telemetry: Telemetry;
}



/** Only aggregate completion counters are saved; never media, captions or event properties. */
export function bootTelemetry(_deps: TelemetryDependencies): TelemetryModule {
  const client = getSupabaseClient();
  if (!client) return { telemetry: new NoopTelemetry() };
  return { telemetry: {
    capture(event: TelemetryEventName) {
      if (!['export_completed', 'export_failed', 'preprocessing_completed', 'transcription_completed'].includes(event)) return;
      // Resolve the current identity at capture time, not after an asynchronous account switch.
      void client.auth.getSession().then(({ data }) => {
        const owner = data.session?.user.id;
        if (!owner) return;
        const eventId = crypto.randomUUID();
        return client.rpc('reelstudio_record_usage', { event_id: eventId, event_kind: event })
          .setHeader('Authorization', `Bearer ${data.session!.access_token}`);
      }).catch(() => { /* Usage reporting must not interrupt editing. */ });
    },
  } };
}
