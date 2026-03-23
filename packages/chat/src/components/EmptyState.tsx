export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-[var(--chat-text-muted)]">
      <div className="text-4xl">AGI Workforce</div>
      <p className="text-sm">How can I help you today?</p>
    </div>
  );
}
