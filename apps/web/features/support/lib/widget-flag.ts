const KILL_SWITCH_VALUES: ReadonlySet<string> = new Set(['0', 'false', 'off', 'no']);

export function isSupportWidgetEnabled(): boolean {
  const raw = process.env['NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED'];
  return raw === undefined || !KILL_SWITCH_VALUES.has(raw.trim().toLowerCase());
}
