export function formatNotificationTime(iso: string, now = Date.now()): string {
  const receivedAt = new Date(iso).getTime();
  if (!Number.isFinite(receivedAt)) return 'just now';

  const diffMs = Math.max(0, now - receivedAt);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(receivedAt),
  );
}
