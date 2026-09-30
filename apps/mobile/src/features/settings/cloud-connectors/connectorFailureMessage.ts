import { ApiHttpError } from '@/services/apiErrors';

export function connectorFailureMessage(error: unknown, action: 'connect' | 'reauthorize'): string {
  if (error instanceof ApiHttpError && error.status === 501) {
    return 'This connector is unavailable in this deployment. Try another connector.';
  }
  return action === 'connect'
    ? 'The connector was not connected. Try again.'
    : 'The connector was not reauthorized. Try again.';
}
