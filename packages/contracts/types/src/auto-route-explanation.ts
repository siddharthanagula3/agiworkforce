const AUTO_ROUTE_REASON_PHRASES: ReadonlyMap<string, string> = new Map([
  ['continuity', 'the model this chat was already using'],
  ['preferred_slot', 'the best fit for this kind of request'],
  ['task_family_pareto', 'the best balance of quality and cost for this kind of request'],
  ['fallback_slot', 'the models Auto prefers for this request were not available'],
  ['health_fallback', 'the model Auto would normally use was having trouble'],
  ['canary', 'Auto is trying a newer model on some requests'],
  ['capability_fallback', 'the model you picked cannot handle this request'],
]);

export function explainAutoRouteReason(reason: string | null | undefined): string | null {
  const code = reason?.trim();
  return code ? (AUTO_ROUTE_REASON_PHRASES.get(code) ?? null) : null;
}
