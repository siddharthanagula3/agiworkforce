import type { ExecOutputStream } from './ExecOutputStream';

export type ExecCommandOutputDeltaEvent = {
  call_id: string;
  stream: ExecOutputStream;
  chunk: string;
};
