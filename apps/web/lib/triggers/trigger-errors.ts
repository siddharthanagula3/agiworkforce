import { createError } from '@/lib/errors';

import { TriggerLimitError, TriggerNotFoundError, TriggerValidationError } from './trigger-service';

export function rethrowTriggerError(error: unknown): never {
  if (error instanceof TriggerLimitError) throw createError.forbidden(error.message);
  if (error instanceof TriggerValidationError) throw createError.validation(error.message);
  if (error instanceof TriggerNotFoundError) throw createError.notFound('Trigger not found');
  throw error;
}
