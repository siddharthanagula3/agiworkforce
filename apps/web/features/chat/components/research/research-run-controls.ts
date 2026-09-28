'use client';

import { createContext, useContext } from 'react';
import type { ResearchConnectorOption } from './ResearchActivity';

export type ResearchRunAction =
  | { kind: 'pause' }
  | { kind: 'resume'; guidance?: string }
  | { kind: 'steer'; guidance: string }
  | { kind: 'sendAsNew'; guidance: string };

export type ResearchRunActionHandler = (
  messageId: string,
  action: ResearchRunAction,
) => Promise<boolean>;

export interface ResearchRunControls {
  act: ResearchRunActionHandler;
  connectorOptions: readonly ResearchConnectorOption[];
}

const ResearchRunControlsContext = createContext<ResearchRunControls | null>(null);

export const ResearchRunControlsProvider = ResearchRunControlsContext.Provider;

export function useResearchRunControls(): ResearchRunControls | null {
  return useContext(ResearchRunControlsContext);
}
