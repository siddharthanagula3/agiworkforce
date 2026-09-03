import { LANE_NAMES, type LaneId } from '../system/lanes';

export function RouteReceipt({
  lane,
  detail,
  note,
}: {
  lane: LaneId;
  detail: readonly string[];
  note: string;
}) {
  return (
    <div className="agi-ds-receipt" data-lane={lane}>
      <div className="agi-ds-receipt-head">
        <span className="agi-ds-receipt-name">{LANE_NAMES[lane]}</span>
        {detail.map((part) => (
          <span className="agi-ds-receipt-detail" key={part}>
            · {part}
          </span>
        ))}
      </div>
      <p className="agi-ds-receipt-note">{note}</p>
    </div>
  );
}
