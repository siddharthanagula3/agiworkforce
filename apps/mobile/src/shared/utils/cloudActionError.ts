import { ApiHttpError } from '@/services/apiErrors';

export function cloudActionError(error: unknown, fallback: string): string {
  if (error instanceof ApiHttpError && error.status < 500 && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
