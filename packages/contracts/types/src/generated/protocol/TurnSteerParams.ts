import type { UserInput } from './UserInput';

export type TurnSteerParams = {
  threadId: string;
  input: Array<UserInput>;
  expectedTurnId?: string;
};
