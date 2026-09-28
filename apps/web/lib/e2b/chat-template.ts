export const E2B_CHAT_TEMPLATE_ENV = 'AGI_E2B_CHAT_TEMPLATE';

export function e2bChatTemplate(): string | null {
  return process.env[E2B_CHAT_TEMPLATE_ENV]?.trim() || null;
}
