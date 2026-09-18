import { describe, expect, it } from 'vitest';

import {
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  clampSidePanelWidth,
  useUIStore,
} from '../uiStore';

describe('side panel width bounds', () => {
  it('publishes one pair of bounds for every surface that drags the panel', () => {
    expect(MIN_SIDE_PANEL_WIDTH).toBeLessThan(MAX_SIDE_PANEL_WIDTH);
    expect(clampSidePanelWidth(MIN_SIDE_PANEL_WIDTH - 200)).toBe(MIN_SIDE_PANEL_WIDTH);
    expect(clampSidePanelWidth(MAX_SIDE_PANEL_WIDTH + 200)).toBe(MAX_SIDE_PANEL_WIDTH);
    expect(clampSidePanelWidth(420)).toBe(420);
  });

  it('clamps what the store stores, through the same function', () => {
    useUIStore.getState().setArtifactPanelWidth(10_000);
    expect(useUIStore.getState().artifactPanelWidth).toBe(MAX_SIDE_PANEL_WIDTH);

    useUIStore.getState().setArtifactPanelWidth(0);
    expect(useUIStore.getState().artifactPanelWidth).toBe(MIN_SIDE_PANEL_WIDTH);
  });
});
