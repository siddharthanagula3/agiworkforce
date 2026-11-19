import { describe, expect, it } from 'vitest';

import { CHAT_LARGE_FILE_POLICY } from '../chat-attachments';
import {
  CHAT_FILE_INTAKE_CANCEL_REASONS,
  CHAT_FILE_INTAKE_CLIENT_STATES,
  CHAT_FILE_INTAKE_FAILURE_CODES,
  CHAT_FILE_INTAKE_REFUSAL_CODES,
  CHAT_FILE_INTAKE_STATES,
  MANAGED_CLOUD_CHAT_FILE_INTAKES_PATH,
  ManagedCloudChatFileIntakeSchema,
  ManagedCloudChatFileIntakeStatusResponseSchema,
  chatFileIntakeClientState,
  chatFileIntakeLeaseMs,
  isChatFileIntakeCancellable,
  isChatFileIntakeTerminal,
  managedCloudChatFileIntakePath,
} from '../chat-file-intake';

const STEP_FUNCTION_MAX_MS = 800_000;
const INTAKE_ID = '00000000-0000-4000-8000-0000000000aa';
const ASSET_ID = '00000000-0000-4000-8000-0000000000bb';

describe('intake states', () => {
  it('names every state the intake row may hold, in pipeline order', () => {
    expect(CHAT_FILE_INTAKE_STATES).toEqual([
      'awaiting_parts',
      'uploaded',
      'inspecting',
      'scanning',
      'sealing',
      'sealed',
      'rejected',
      'failed',
      'cancelled',
    ]);
  });

  it('shows a client only six states, every server state mapped to one', () => {
    expect(CHAT_FILE_INTAKE_CLIENT_STATES).toEqual([
      'uploading',
      'checking',
      'ready',
      'rejected',
      'failed',
      'cancelled',
    ]);
    expect(
      Object.fromEntries(CHAT_FILE_INTAKE_STATES.map((s) => [s, chatFileIntakeClientState(s)])),
    ).toEqual({
      awaiting_parts: 'uploading',
      uploaded: 'checking',
      inspecting: 'checking',
      scanning: 'checking',
      sealing: 'checking',
      sealed: 'ready',
      rejected: 'rejected',
      failed: 'failed',
      cancelled: 'cancelled',
    });
  });

  it('treats sealed, rejected, failed and cancelled as terminal and nothing else', () => {
    expect(CHAT_FILE_INTAKE_STATES.filter(isChatFileIntakeTerminal)).toEqual([
      'sealed',
      'rejected',
      'failed',
      'cancelled',
    ]);
  });

  it('accepts a cancel only before the seal starts', () => {
    expect(CHAT_FILE_INTAKE_STATES.filter(isChatFileIntakeCancellable)).toEqual([
      'awaiting_parts',
      'uploaded',
      'inspecting',
      'scanning',
    ]);
  });

  it('carries every refusal, failure and cancel code, storage_full included', () => {
    expect(CHAT_FILE_INTAKE_REFUSAL_CODES).toEqual([
      'malware',
      'encrypted',
      'limits_exceeded',
      'active_pdf',
      'type_mismatch',
      'denylist',
      'dlp_blocked',
      'checksum_mismatch',
      'size_mismatch',
      'changed_during_check',
      'storage_full',
    ]);
    expect(CHAT_FILE_INTAKE_FAILURE_CODES).toEqual(['scan_unavailable', 'stalled']);
    expect(CHAT_FILE_INTAKE_CANCEL_REASONS).toEqual(['client', 'idle']);
  });
});

describe('intake leases', () => {
  it('leases each worked state from the policy and leaves the others unleased', () => {
    const { leaseMs, scanGiveUpMs } = CHAT_LARGE_FILE_POLICY.intake;
    expect(chatFileIntakeLeaseMs('uploaded')).toBe(leaseMs.uploaded);
    expect(chatFileIntakeLeaseMs('inspecting')).toBe(leaseMs.inspecting);
    expect(chatFileIntakeLeaseMs('scanning')).toBe(scanGiveUpMs + leaseMs.scanningExtra);
    expect(chatFileIntakeLeaseMs('sealing')).toBe(leaseMs.sealing);
    for (const state of ['awaiting_parts', 'sealed', 'rejected', 'failed', 'cancelled'] as const) {
      expect(chatFileIntakeLeaseMs(state)).toBeNull();
    }
  });

  it('outlives one step function in the seal, so no second run enters while a copy runs', () => {
    expect(CHAT_LARGE_FILE_POLICY.intake.leaseMs.sealing).toBeGreaterThan(STEP_FUNCTION_MAX_MS);
  });

  it('keeps a scanning lease longer than the scan give-up window', () => {
    expect(chatFileIntakeLeaseMs('scanning')).toBeGreaterThan(
      CHAT_LARGE_FILE_POLICY.intake.scanGiveUpMs,
    );
  });
});

describe('intake paths', () => {
  it('addresses one intake under the intakes path, with its id encoded', () => {
    expect(MANAGED_CLOUD_CHAT_FILE_INTAKES_PATH).toBe('/api/files/intakes');
    expect(managedCloudChatFileIntakePath(INTAKE_ID)).toBe(`/api/files/intakes/${INTAKE_ID}`);
    expect(managedCloudChatFileIntakePath('a/b?c')).toBe('/api/files/intakes/a%2Fb%3Fc');
  });
});

describe('the intake status a client polls', () => {
  const attachment = {
    id: ASSET_ID,
    name: 'report.pdf',
    mimeType: 'application/pdf',
    byteCount: 480 * 1024 * 1024,
    type: 'file' as const,
    url: `/api/files/${ASSET_ID}`,
  };

  it('parses the checking answer complete gives', () => {
    expect(ManagedCloudChatFileIntakeSchema.parse({ id: INTAKE_ID, state: 'checking' })).toEqual({
      id: INTAKE_ID,
      state: 'checking',
    });
  });

  it('carries the attachment once ready, and only then', () => {
    expect(
      ManagedCloudChatFileIntakeStatusResponseSchema.parse({
        intake: { id: INTAKE_ID, state: 'ready', attachment },
      }).intake.attachment,
    ).toEqual(attachment);
    expect(
      ManagedCloudChatFileIntakeSchema.safeParse({ id: INTAKE_ID, state: 'ready' }).success,
    ).toBe(false);
    expect(
      ManagedCloudChatFileIntakeSchema.safeParse({ id: INTAKE_ID, state: 'checking', attachment })
        .success,
    ).toBe(false);
  });

  it('requires the code that explains a refusal, a failure or a cancel', () => {
    const message = 'There is not enough storage left for this file.';
    expect(
      ManagedCloudChatFileIntakeSchema.parse({
        id: INTAKE_ID,
        state: 'rejected',
        refusalCode: 'storage_full',
        message,
      }),
    ).toEqual({ id: INTAKE_ID, state: 'rejected', refusalCode: 'storage_full', message });
    for (const status of [
      { state: 'rejected' },
      { state: 'failed' },
      { state: 'cancelled' },
      { state: 'rejected', failureCode: 'stalled' },
      { state: 'failed', refusalCode: 'malware' },
      { state: 'checking', refusalCode: 'malware' },
      { state: 'failed', failureCode: 'not_a_code' },
    ]) {
      expect(
        ManagedCloudChatFileIntakeSchema.safeParse({ id: INTAKE_ID, ...status }).success,
        JSON.stringify(status),
      ).toBe(false);
    }
    expect(
      ManagedCloudChatFileIntakeSchema.safeParse({
        id: INTAKE_ID,
        state: 'failed',
        failureCode: 'scan_unavailable',
      }).success,
    ).toBe(true);
    expect(
      ManagedCloudChatFileIntakeSchema.safeParse({
        id: INTAKE_ID,
        state: 'cancelled',
        cancelReason: 'idle',
      }).success,
    ).toBe(true);
  });

  it('refuses a server state, an unknown state or an id that is not a uuid', () => {
    for (const intake of [
      { id: INTAKE_ID, state: 'scanning' },
      { id: INTAKE_ID, state: 'done' },
      { id: 'intake-1', state: 'checking' },
    ]) {
      expect(ManagedCloudChatFileIntakeSchema.safeParse(intake).success).toBe(false);
    }
  });
});
