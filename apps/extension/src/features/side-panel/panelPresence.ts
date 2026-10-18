export const SIDE_PANEL_PORT_NAME = 'agi-side-panel';
export const SIDE_PANEL_PRESENCE_MESSAGE = 'AGI_SIDE_PANEL_PRESENCE';

export interface SidePanelPresenceMessage {
  type: typeof SIDE_PANEL_PRESENCE_MESSAGE;
  open: boolean;
}

export function isSidePanelPresenceMessage(value: unknown): value is SidePanelPresenceMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['type'] === SIDE_PANEL_PRESENCE_MESSAGE && typeof candidate['open'] === 'boolean'
  );
}
