import type { RequestUserInputQuestion } from './RequestUserInputQuestion';

export type RequestUserInputEvent = {
  call_id: string;
  turn_id: string;
  questions: Array<RequestUserInputQuestion>;
};
