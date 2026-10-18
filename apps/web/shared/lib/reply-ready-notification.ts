const NOTIFICATION_VISIBLE_MS = 5000;

export function showReplyReadyNotification(reply: { tag: string; body: string }): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notification = new Notification('Reply ready', {
    body: reply.body,
    icon: '/favicon.ico',
    tag: reply.tag,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  setTimeout(() => notification.close(), NOTIFICATION_VISIBLE_MS);
}
