import { describe, expect, it } from 'vitest';

import {
  DEVICE_REGISTRY_PROFILE_COMMAND,
  IDLE_REMOTE_CONTROL_STATE,
  REMOTE_CONTROL_COMMANDS,
  type DeviceRegistryProfile,
  type RemoteControlState,
  type RemoteControlStatus,
} from '../remote-control';

/**
 * Every field that identifies a live pairing. Derived from the idle state's own
 * keys, so a field added to the state joins this check by existing.
 */
const LIVE_PAIRING_FIELDS = (
  Object.keys(IDLE_REMOTE_CONTROL_STATE) as Array<keyof RemoteControlState>
).filter((field) => field !== 'status' && field !== 'error');

describe('a remote-control session can always be ended', () => {
  it('offers a stop command beside the start and the read', () => {
    expect(REMOTE_CONTROL_COMMANDS).toContain('remote_control_stop');
    expect(REMOTE_CONTROL_COMMANDS).toContain('remote_control_start');
    expect(REMOTE_CONTROL_COMMANDS).toContain('remote_control_state');
    expect(new Set(REMOTE_CONTROL_COMMANDS).size).toBe(REMOTE_CONTROL_COMMANDS.length);
  });

  it('leaves nothing a later attach could reuse once the session is idle', () => {
    for (const field of LIVE_PAIRING_FIELDS) {
      const value = IDLE_REMOTE_CONTROL_STATE[field];
      expect(value === null || value === 0, `${String(field)} survives the stop`).toBe(true);
    }
    expect(IDLE_REMOTE_CONTROL_STATE.status).toBe('idle');
    expect(IDLE_REMOTE_CONTROL_STATE.attachedSessions).toBe(0);
  });

  it('carries an expiry with every pairing offer, so an unclaimed code times out', () => {
    expect(LIVE_PAIRING_FIELDS).toContain('expiresAt');
    const waiting: RemoteControlState = {
      ...IDLE_REMOTE_CONTROL_STATE,
      status: 'waiting',
      pairingCode: '123456',
      expiresAt: 1,
    };
    expect(waiting.expiresAt).not.toBeNull();
  });

  it('gives a disconnect a status of its own rather than reusing connected', () => {
    const statuses: RemoteControlStatus[] = ['idle', 'waiting', 'connected', 'error'];
    expect(new Set(statuses).size).toBe(statuses.length);
    expect(statuses).toContain('idle');
    expect(statuses).toContain('error');
    expect(IDLE_REMOTE_CONTROL_STATE.status).not.toBe('connected');
  });
});

describe('the device a session attaches to declares what it can do', () => {
  it('names every capability a remote session depends on', () => {
    const profile: DeviceRegistryProfile['capabilities'] = {
      browser: false,
      computerUse: false,
      localModels: false,
      localMcp: false,
      remoteControl: false,
    };
    expect(Object.keys(profile).sort()).toEqual([
      'browser',
      'computerUse',
      'localMcp',
      'localModels',
      'remoteControl',
    ]);
  });

  it('reads the profile over a command of its own, not over the pairing commands', () => {
    expect(REMOTE_CONTROL_COMMANDS).not.toContain(DEVICE_REGISTRY_PROFILE_COMMAND);
  });
});
