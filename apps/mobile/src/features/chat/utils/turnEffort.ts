export function resolveTurnEffort<E extends string>(opts: {
  selectedEffort: E;
  supportedEfforts: readonly string[];
  reasoningControl?: string;
  thinkingEnabled: boolean;
}): E | undefined {
  const supported = opts.supportedEfforts.includes(opts.selectedEffort);
  const isEffortControlModel = opts.reasoningControl === 'effort_levels';
  return supported && (isEffortControlModel || opts.thinkingEnabled)
    ? opts.selectedEffort
    : undefined;
}
