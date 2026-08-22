import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ExecutionSidecarScreenView } from '../ExecutionSidecarScreenView';
import { useComputerUseStore } from '../../../stores/computerUseStore';
import { useSettingsStore } from '../../../stores/settingsStore';

Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

function setOverlayPreference(showComputerUseOverlay: boolean) {
  useSettingsStore.setState((state) => ({
    executionPreferences: { ...state.executionPreferences, showComputerUseOverlay },
  }));
}

function renderWithTypingAction() {
  render(<ExecutionSidecarScreenView />);
  fireEvent.load(screen.getByAltText('Computer Use'));
}

describe('ExecutionSidecarScreenView action overlay', () => {
  beforeEach(() => {
    useComputerUseStore.setState({
      isActive: true,
      currentScreenshot: 'iVBORw0KGgo=',
      screenWidth: 1920,
      screenHeight: 1080,
      actionLog: [
        {
          action_type: 'type',
          coordinates: [960, 540],
          text: 'hello',
          key: null,
          timestamp: 1,
        },
      ],
    });
    setOverlayPreference(true);
  });

  it('draws the action marker while the preference is on', () => {
    renderWithTypingAction();

    expect(screen.getByText('typing')).toBeInTheDocument();
  });

  it('draws no action marker once the preference is off', () => {
    setOverlayPreference(false);
    renderWithTypingAction();

    expect(screen.queryByText('typing')).not.toBeInTheDocument();
    expect(screen.getByAltText('Computer Use')).toBeInTheDocument();
  });
});
