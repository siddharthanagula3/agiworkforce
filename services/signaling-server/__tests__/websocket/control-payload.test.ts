import { describe, expect, it } from 'vitest';
import { MAX_CODE_CONTROL_PAYLOAD_SIZE, MAX_CONTROL_PAYLOAD_SIZE } from '../../src/constants.js';
import { controlPayloadSchema } from '../../src/control-payload.js';

function envelope(size: number) {
  return { hmac: 'h', nonce: 'n', ts: 1, type: 't', v: 3, payload: { text: 'x'.repeat(size) } };
}

describe('relayed control payloads', () => {
  it('forwards every Remote Control action for developer sessions', () => {
    for (const action of [
      'code.sessions.list',
      'code.session.attach',
      'code.session.detach',
      'code.session.steer',
      'code.turn.interrupt',
      'code.approval.respond',
      'code.sessions',
      'code.session.snapshot',
      'code.session.event',
      'control.receipt',
    ]) {
      expect(controlPayloadSchema.safeParse({ action, data: envelope(10) }).success).toBe(true);
    }
  });

  it('lets a session snapshot through that a legacy control could never carry', () => {
    const snapshot = { action: 'code.session.snapshot', data: envelope(20_000) };
    expect(JSON.stringify(snapshot).length).toBeGreaterThan(MAX_CONTROL_PAYLOAD_SIZE);
    expect(controlPayloadSchema.safeParse(snapshot).success).toBe(true);
    expect(
      controlPayloadSchema.safeParse({ action: 'approval_response', data: envelope(20_000) })
        .success,
    ).toBe(false);
  });

  it('still bounds session payloads and refuses actions it does not know', () => {
    expect(
      controlPayloadSchema.safeParse({
        action: 'code.session.snapshot',
        data: envelope(MAX_CODE_CONTROL_PAYLOAD_SIZE),
      }).success,
    ).toBe(false);
    expect(controlPayloadSchema.safeParse({ action: 'code.shell.run', data: {} }).success).toBe(
      false,
    );
  });
});
