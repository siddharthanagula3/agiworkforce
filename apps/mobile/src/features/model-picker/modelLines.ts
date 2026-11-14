import type { ModelDef, ModelTier } from './service';

export interface ModelLine {
  id: string;
  label: string;
  models: [ModelDef, ...ModelDef[]];
}

export function groupByModelLine(models: readonly ModelDef[]): ModelLine[] {
  const lines = new Map<string, ModelLine>();
  for (const model of models) {
    const line = lines.get(model.provider);
    if (line) line.models.push(model);
    else
      lines.set(model.provider, {
        id: model.provider,
        label: model.providerLabel,
        models: [model],
      });
  }
  return Array.from(lines.values());
}

export function leadModelOf(
  line: ModelLine,
  selectedModelId: string,
  recentModelIds: readonly string[],
  everydayTier: ModelTier | undefined,
): ModelDef {
  const usable = line.models.filter((model) => model.availability !== 'locked');
  const recentId = recentModelIds.find((id) => usable.some((model) => model.id === id));
  return (
    usable.find((model) => model.id === selectedModelId) ??
    usable.find((model) => model.id === recentId) ??
    usable.find((model) => model.tier === everydayTier) ??
    usable[0] ??
    line.models[0]
  );
}
