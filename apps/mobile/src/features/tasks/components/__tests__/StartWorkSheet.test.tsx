import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@clerk/expo', () => ({
  getClerkInstance: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return { Check: icon, X: icon };
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { StartWorkSheet } from '../StartWorkSheet';

const PROJECT: CloudProject = {
  id: 'project-1',
  name: 'Research',
  description: null,
  instructions: null,
  color: null,
  isArchived: false,
  metadata: null,
  source: 'mobile',
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
  deletedAt: null,
};

function renderSheet(overrides: Partial<React.ComponentProps<typeof StartWorkSheet>> = {}) {
  const props = {
    visible: true,
    submitting: false,
    error: null,
    onClose: jest.fn(),
    onSubmit: jest.fn(),
    ...overrides,
  };
  const view = render(<StartWorkSheet {...props} />);
  return {
    props,
    view,
    rerender: (next: Partial<React.ComponentProps<typeof StartWorkSheet>>) =>
      view.rerender(<StartWorkSheet {...props} {...next} />),
  };
}

function fillDraft(view: ReturnType<typeof render>) {
  fireEvent.changeText(view.getByLabelText('Task objective'), 'Compare vendors');
  fireEvent.changeText(view.getByLabelText('Task constraints'), 'Public sources only');
  fireEvent.changeText(view.getByLabelText('Task deliverable'), 'One page');
  fireEvent.press(view.getByLabelText('Project Research'));
}

describe('StartWorkSheet draft lifetime', () => {
  beforeEach(() => {
    useCloudProjectStore.setState({ projects: [PROJECT] });
  });

  it('starts empty when reopened after the parent hid it on a successful launch', () => {
    const { view, rerender } = renderSheet();
    fillDraft(view);

    rerender({ visible: false });
    rerender({ visible: true });

    expect(view.getByLabelText('Task objective').props.value).toBe('');
    expect(view.getByLabelText('Task constraints').props.value).toBe('');
    expect(view.getByLabelText('Task deliverable').props.value).toBe('');
    expect(view.getByLabelText('Project Research').props.accessibilityState?.selected).toBe(false);
  });

  it('does not carry a retired draft into the next submission', () => {
    const { view, props, rerender } = renderSheet();
    fillDraft(view);
    rerender({ visible: false });
    rerender({ visible: true });

    fireEvent.changeText(view.getByLabelText('Task objective'), 'Second objective');
    fireEvent.press(view.getByLabelText('Start task'));

    expect(props.onSubmit).toHaveBeenCalledWith({
      goal: 'Second objective',
      constraints: '',
      deliverable: '',
    });
  });

  it('keeps the draft while a failed submission leaves the sheet open', () => {
    const { view, rerender } = renderSheet();
    fillDraft(view);

    rerender({ error: 'Could not start the task' });

    expect(view.getByLabelText('Task objective').props.value).toBe('Compare vendors');
    expect(view.getByLabelText('Task constraints').props.value).toBe('Public sources only');
    expect(view.getByLabelText('Task deliverable').props.value).toBe('One page');
    expect(view.getByLabelText('Project Research').props.accessibilityState?.selected).toBe(true);
  });

  it('clears the draft when the user closes the sheet', () => {
    const { view, props, rerender } = renderSheet();
    fillDraft(view);

    fireEvent.press(view.getByLabelText('Close new task'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    rerender({ visible: false });
    rerender({ visible: true });

    expect(view.getByLabelText('Task objective').props.value).toBe('');
  });
});
