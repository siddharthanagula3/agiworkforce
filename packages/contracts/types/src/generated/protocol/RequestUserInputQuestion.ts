import type { RequestUserInputQuestionOption } from './RequestUserInputQuestionOption';

export type RequestUserInputQuestion = {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: Array<RequestUserInputQuestionOption> | null;
};
