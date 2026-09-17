import 'server-only';

import { resolvePromptText } from '@/lib/prompts/prompt-registry';

export const LIVE_VOICE_INSTRUCTIONS_PROMPT_ID = 'voice.live_instructions';
export const LIVE_VOICE_BACKEND_INSTRUCTIONS_PROMPT_ID = 'voice.live_backend_instructions';

export const LIVE_VOICE_INSTRUCTIONS = resolvePromptText(LIVE_VOICE_INSTRUCTIONS_PROMPT_ID);

export const LIVE_VOICE_BACKEND_INSTRUCTIONS = resolvePromptText(
  LIVE_VOICE_BACKEND_INSTRUCTIONS_PROMPT_ID,
);
