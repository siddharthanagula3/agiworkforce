import 'server-only';

export const DURABLE_INITIAL_TURNS_ENV = 'AGI_DURABLE_INITIAL_TURNS';

export function areDurableInitialTurnsEnabled(): boolean {
  const raw = process.env[DURABLE_INITIAL_TURNS_ENV]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}
