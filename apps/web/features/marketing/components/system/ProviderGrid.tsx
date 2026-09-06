export interface ProviderTile {
  id: string;
  label: string;
  defaultModel: string;
  modelCount: number;
  price: string;
  kind: 'cloud' | 'gateway' | 'local';
}

const KIND_LABEL: Record<ProviderTile['kind'], string> = {
  cloud: 'Your key',
  gateway: 'Gateway',
  local: 'Local runtime',
};

const MODEL_UNIT = { one: 'model', many: 'models' } as const;

export function ProviderGrid({ tiles, label }: { tiles: readonly ProviderTile[]; label: string }) {
  return (
    <ul className="agi-ds-providers" aria-label={label}>
      {tiles.map((tile) => (
        <li className="agi-ds-provider" data-kind={tile.kind} key={tile.id}>
          <span className="agi-ds-provider-mark" aria-hidden="true">
            {tile.label.slice(0, 1)}
          </span>
          <span className="agi-ds-provider-name">{tile.label}</span>
          <span className="agi-ds-provider-meta">
            {tile.modelCount > 0
              ? `${tile.modelCount} ${tile.modelCount === 1 ? MODEL_UNIT.one : MODEL_UNIT.many}`
              : 'Lists its own models'}
          </span>
          {tile.defaultModel ? (
            <span className="agi-ds-provider-default">{tile.defaultModel}</span>
          ) : null}
          <span className="agi-ds-provider-foot">
            <span>{KIND_LABEL[tile.kind]}</span>
            <span>{tile.price}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
