'use client';

import { createContext, useContext } from 'react';

export type ResearchRunAction =
  { kind: 'pause' } | { kind: 'resume'; guidance?: string } | { kind: 'steer'; guidance: string };

export type ResearchRunActionHandler = (
  messageId: string,
  action: ResearchRunAction,
) => Promise<boolean>;

const ResearchRunActionContext = createContext<ResearchRunActionHandler | null>(null);

export const ResearchRunActionProvider = ResearchRunActionContext.Provider;

export function useResearchRunAction(): ResearchRunActionHandler | null {
  return useContext(ResearchRunActionContext);
}
