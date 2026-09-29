import { describe, expect, it } from 'vitest';
import { controlPayloadSchema } from '../src/control-payload.js';

describe('control payloads the relay forwards', () => {
  it.each([
    'dispatch.task.create',
    'dispatch.task.cancel',
    'dispatch.task.reply',
    'dispatch.task.status',
  ])('forwards %s with a full-length prompt inside its signed envelope', (action) => {
    const envelope = { v: 3, sig: 'a'.repeat(64), payload: { prompt: 'x'.repeat(20_000) } };
    expect(controlPayloadSchema.safeParse({ action, data: envelope }).success).toBe(true);
  });

  it('still refuses an action it does not know', () => {
    expect(
      controlPayloadSchema.safeParse({ action: 'dispatch.task.delete', data: {} }).success,
    ).toBe(false);
  });

  it('keeps the small limit for other control messages', () => {
    expect(
      controlPayloadSchema.safeParse({ action: 'heartbeat', data: { pad: 'x'.repeat(5_000) } })
        .success,
    ).toBe(false);
  });
});
