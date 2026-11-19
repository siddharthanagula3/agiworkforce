import 'server-only';

import { applySecretHandlingToTexts } from '@/app/api/llm/v1/chat/completions/lib/secret-handling-gate';
import { createError } from '@/lib/errors';

export async function refuseBlockedSchedulePrompt(
  userId: string,
  body: Record<string, unknown>,
): Promise<void> {
  if (typeof body['prompt'] !== 'string') return;
  const secrets = await applySecretHandlingToTexts(userId, [body['prompt']]);
  if (secrets.action === 'blocked') {
    throw createError.validation(
      'This prompt was not saved because it appears to contain a secret, such as an API key or access token. Remove it and save again.',
    );
  }
}
