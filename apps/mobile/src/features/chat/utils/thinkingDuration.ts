export function thinkingDurationSecondsOf(
  metadata: Record<string, unknown> | undefined,
): number | undefined {
  const seconds = metadata?.['thinkingDurationSeconds'] ?? metadata?.['thinkingDuration'];
  return typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : undefined;
}
