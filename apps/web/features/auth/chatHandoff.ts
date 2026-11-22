const CHAT_HANDOFF_KEY = 'agi.auth.chat-handoff';
const CHAT_HANDOFF_WINDOW_MS = 30_000;

export function beginChatHandoff(): boolean {
  try {
    const previous = Number(window.sessionStorage.getItem(CHAT_HANDOFF_KEY));
    const elapsed = Date.now() - previous;
    if (previous > 0 && elapsed >= 0 && elapsed < CHAT_HANDOFF_WINDOW_MS) return false;
    window.sessionStorage.setItem(CHAT_HANDOFF_KEY, String(Date.now()));
  } catch {
    // Browsers with storage disabled can still navigate to chat.
  }
  return true;
}

export function finishChatHandoff(): void {
  try {
    window.sessionStorage.removeItem(CHAT_HANDOFF_KEY);
  } catch {
    return;
  }
}
