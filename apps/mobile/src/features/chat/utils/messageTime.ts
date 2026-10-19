export function messageSentAtLabel(createdAt: string | undefined): string | null {
  if (!createdAt) return null;
  const sent = new Date(createdAt);
  if (Number.isNaN(sent.getTime())) return null;
  const sameDay = sent.toDateString() === new Date().toDateString();
  const time = sent.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay
    ? `Sent at ${time}`
    : `Sent ${sent.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}
