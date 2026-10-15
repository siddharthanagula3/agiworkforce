import { command } from '@agiworkforce/client-runtime';

export async function getUserPreference(key: string): Promise<unknown> {
  return command<unknown>('get_user_preference', { key });
}
export async function setUserPreference(
  key: string,
  value: string,
  category: string,
  dataType: string,
  description?: string,
): Promise<void> {
  return command<void>('set_user_preference', { key, value, category, dataType, description });
}
