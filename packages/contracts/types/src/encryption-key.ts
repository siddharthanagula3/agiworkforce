export const KEY_REWRAP_STATES = ['pending', 'running', 'complete', 'failed'] as const;

export type KeyRewrapState = (typeof KEY_REWRAP_STATES)[number];

export function isKeyRewrapState(value: unknown): value is KeyRewrapState {
  return typeof value === 'string' && (KEY_REWRAP_STATES as readonly string[]).includes(value);
}
