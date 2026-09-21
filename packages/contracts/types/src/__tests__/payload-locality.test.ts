import { describe, expect, it } from 'vitest';

import { SURFACE_STATE_RULES } from '../lifecycle-status';
import {
  PAYLOAD_HOLDER_STATES,
  PAYLOAD_UNAVAILABILITY_REASONS,
  SYNC_OBJECT_SEMANTICS,
  SYNC_OBJECT_TYPES,
  deviceBoundSyncObjectTypes,
  payloadHolderIsPossible,
  payloadReadOutcome,
  surfaceStateForPayloadRead,
  type PayloadHolderState,
  type SyncPayloadLocation,
} from '../sync/object-semantics';

const PAYLOAD_LOCATIONS: readonly SyncPayloadLocation[] = [
  'cloud',
  'cloud-or-device',
  'device-only',
];

const every = (): ReadonlyArray<{
  payload: SyncPayloadLocation;
  holder: PayloadHolderState;
  remoteAccessAllowed: boolean;
}> =>
  PAYLOAD_LOCATIONS.flatMap((payload) =>
    PAYLOAD_HOLDER_STATES.flatMap((holder) =>
      [true, false].map((remoteAccessAllowed) => ({ payload, holder, remoteAccessAllowed })),
    ),
  ).filter(({ payload, holder }) => payloadHolderIsPossible(payload, holder));

describe('not every synced row has bytes in the cloud', () => {
  it('names the types whose bytes may be on a disk we do not hold', () => {
    const deviceBound = deviceBoundSyncObjectTypes();
    expect(deviceBound.length).toBeGreaterThan(0);
    for (const type of SYNC_OBJECT_TYPES) {
      const cloudOnly = SYNC_OBJECT_SEMANTICS[type].payload === 'cloud';
      expect(deviceBound.includes(type), type).toBe(!cloudOnly);
    }
  });

  it('refuses a holder the payload location cannot have', () => {
    expect(payloadHolderIsPossible('cloud', 'this_device')).toBe(false);
    expect(payloadHolderIsPossible('device-only', 'cloud')).toBe(false);
    expect(payloadHolderIsPossible('cloud-or-device', 'cloud')).toBe(true);
    expect(payloadHolderIsPossible('cloud-or-device', 'lost')).toBe(true);
  });
});

describe('every reachable combination reads the same way', () => {
  it('answers with a reason exactly when the bytes cannot be produced', () => {
    for (const input of every()) {
      const outcome = payloadReadOutcome(input);
      expect(outcome.available, JSON.stringify(input)).toBe(outcome.reason === null);
      if (outcome.reason !== null) {
        expect(PAYLOAD_UNAVAILABILITY_REASONS, JSON.stringify(input)).toContain(outcome.reason);
      }
    }
  });

  it('never renders bytes nobody can produce as an object with nothing in it', () => {
    for (const input of every()) {
      const state = surfaceStateForPayloadRead(payloadReadOutcome(input));
      expect(SURFACE_STATE_RULES[state].meansNoData, JSON.stringify(input)).toBe(false);
    }
  });

  it('offers a restore for a device that will not come back, and never a spinner', () => {
    for (const holder of ['removed', 'lost'] as const) {
      const outcome = payloadReadOutcome({ payload: 'device-only', holder });
      expect(outcome.available).toBe(false);
      expect(outcome.recoverable).toBe(false);
      const state = surfaceStateForPayloadRead(outcome);
      expect(SURFACE_STATE_RULES[state].remedy).toBe('restore');
      expect(SURFACE_STATE_RULES[state].permanentFailure).toBe(true);
    }
  });

  it('calls a sleeping device temporary, and says so', () => {
    const outcome = payloadReadOutcome({
      payload: 'device-only',
      holder: 'unreachable',
      remoteAccessAllowed: true,
    });
    expect(outcome).toEqual({
      available: false,
      reason: 'holder_unreachable',
      recoverable: true,
    });
    expect(SURFACE_STATE_RULES[surfaceStateForPayloadRead(outcome)].permanentFailure).toBe(false);
  });

  it('blames the policy, not the device, when remote access is off', () => {
    const outcome = payloadReadOutcome({ payload: 'device-only', holder: 'reachable' });
    expect(outcome.reason).toBe('remote_access_denied');
    expect(SURFACE_STATE_RULES[surfaceStateForPayloadRead(outcome)].remedy).toBe('change_policy');
  });

  it('produces the bytes when remote access is on and the device answers', () => {
    expect(
      payloadReadOutcome({
        payload: 'device-only',
        holder: 'reachable',
        remoteAccessAllowed: true,
      }).available,
    ).toBe(true);
  });

  it('keeps a cloud copy reachable whatever became of the device', () => {
    for (const holder of PAYLOAD_HOLDER_STATES) {
      if (!payloadHolderIsPossible('cloud-or-device', holder)) continue;
      const outcome = payloadReadOutcome({ payload: 'cloud-or-device', holder: 'cloud' });
      expect(outcome.available, holder).toBe(true);
    }
  });

  it('owes the reader a sentence for every reason it can give', () => {
    for (const reason of PAYLOAD_UNAVAILABILITY_REASONS) {
      const state = surfaceStateForPayloadRead({ available: false, reason, recoverable: false });
      expect(SURFACE_STATE_RULES[state].needsExplanation, reason).toBe(true);
    }
  });
});
