export type UrgencyLevel = 'info' | 'warning' | 'critical';

/**
 * The single usage-severity ladder.
 *
 * Exported because every surface was inventing its own: the desktop and mobile
 * meters used their own thresholds, and the web Settings usage bar had none at
 * all, it painted the accent colour at 1% and at 100% alike, so a user about to
 * be cut off saw the same bar as one who had barely started. Import this rather
 * than restating the numbers.
 */
export function getUsageUrgency(usagePercent: number): UrgencyLevel {
  if (usagePercent >= 95) return 'critical';
  if (usagePercent >= 90) return 'warning';
  return 'info';
}
