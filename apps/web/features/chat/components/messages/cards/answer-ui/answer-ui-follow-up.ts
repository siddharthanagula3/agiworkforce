'use client';

import { createContext, useContext } from 'react';

export type AnswerUiFollowUpSender = (text: string) => void;

const AnswerUiFollowUpContext = createContext<AnswerUiFollowUpSender | null>(null);

export const AnswerUiFollowUpProvider = AnswerUiFollowUpContext.Provider;

export function useAnswerUiFollowUp(): AnswerUiFollowUpSender | null {
  return useContext(AnswerUiFollowUpContext);
}
