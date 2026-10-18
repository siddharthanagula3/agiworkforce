import { platformRequestHeaders } from './platformHeaders';

export function accountRequestHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...platformRequestHeaders(),
  };
}
