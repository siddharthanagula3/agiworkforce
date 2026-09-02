export const LANE_IDS = ['local', 'byok', 'cloud'] as const;

export type LaneId = (typeof LANE_IDS)[number];

export const LANE_NAMES: Record<LaneId, string> = {
  local: 'Local',
  byok: 'Your key',
  cloud: 'AGI Cloud',
};
