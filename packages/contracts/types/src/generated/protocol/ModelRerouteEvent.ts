import type { ModelRerouteReason } from './ModelRerouteReason';

export type ModelRerouteEvent = {
  from_model: string;
  to_model: string;
  reason: ModelRerouteReason;
};
