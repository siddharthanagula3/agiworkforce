export interface Stat {
  value: string;
  label: string;
  note?: string;
}

export function StatBand({ stats, label }: { stats: readonly Stat[]; label: string }) {
  return (
    <dl className="agi-ds-stats" aria-label={label} data-count={stats.length}>
      {stats.map((stat) => (
        <div className="agi-ds-stat" key={stat.label}>
          <dt className="agi-ds-stat-label">{stat.label}</dt>
          <dd className="agi-ds-stat-value">{stat.value}</dd>
          {stat.note ? <dd className="agi-ds-stat-note">{stat.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
