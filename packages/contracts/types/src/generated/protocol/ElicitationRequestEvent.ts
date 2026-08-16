import type { ElicitationRequest } from './ElicitationRequest';

export type ElicitationRequestEvent = {
  turn_id?: string;
  server_name: string;
  id: string | number;
  request: ElicitationRequest;
};
