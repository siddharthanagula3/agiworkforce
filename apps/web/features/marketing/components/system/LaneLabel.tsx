import { LANE_NAMES, type LaneId } from './lanes';

export function LaneLabel({ lane, detail }: { lane: LaneId; detail?: readonly string[] }) {
  return (
    <span className="agi-ds-lane" data-lane={lane}>
      <span className="agi-ds-lane-dot" aria-hidden="true" />
      <span>{LANE_NAMES[lane]}</span>
      {detail?.map((part) => (
        <span className="agi-ds-lane-detail" key={part}>
          · {part}
        </span>
      ))}
    </span>
  );
}
