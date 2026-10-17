import { describe, expect, it, vi } from 'vitest';
import { bootTelemetry } from './telemetry';
import type { TelemetryDependencies } from './telemetry';

const fixture = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@core/auth/infrastructure/SupabaseClient', () => ({ getSupabaseClient: () => fixture.client }));
const deps = {} as TelemetryDependencies;

describe('account usage reporting', () => {
  it('sends only allowed counters and pins them to the captured session token', async () => {
    const header = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockReturnValue({ setHeader: header });
    fixture.client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'owner' }, access_token: 'captured-token' } } }) }, rpc };
    const { telemetry } = bootTelemetry(deps);
    telemetry.capture('captions_text_edited', { text: 'Private caption' });
    telemetry.capture('export_completed', { file_name: 'Private file' });
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith('reelstudio_record_usage', { event_id: expect.any(String), event_kind: 'export_completed' });
    expect(header).toHaveBeenCalledWith('Authorization', 'Bearer captured-token');
  });
  it('does not report unsigned local usage and ignores authentication failures', async () => {
    const rpc = vi.fn();
    fixture.client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) }, rpc };
    bootTelemetry(deps).telemetry.capture('transcription_completed');
    await Promise.resolve();
    expect(rpc).not.toHaveBeenCalled();
    fixture.client = { auth: { getSession: vi.fn().mockRejectedValue(new Error('Offline')) }, rpc };
    expect(() => bootTelemetry(deps).telemetry.capture('export_completed')).not.toThrow();
    await Promise.resolve(); await Promise.resolve();
    expect(rpc).not.toHaveBeenCalled();
  });
});
