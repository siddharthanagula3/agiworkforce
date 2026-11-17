/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/features/chat/components/WorkModeSwitch', () => ({ HEADER_TEXT_SCALE_LIMIT: 2 }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

import React from 'react';
import { Dimensions } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { TextScaleBoundary } from '@/src/shared/components/TextScaleBoundary';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/ui/theme/tokens';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '@/test-utils/textScale';
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_INSTRUCTIONS_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '@agiworkforce/cloud-contracts';
import { ProjectEditorModal } from '../components/ProjectEditorModal';
import type { ProjectEditor } from '../useProjectEditor';

function editorStub(): ProjectEditor {
  return {
    visible: true,
    editingProject: null,
    isCloud: true,
    formName: '',
    setFormName: jest.fn(),
    formDescription: '',
    setFormDescription: jest.fn(),
    formInstructions: '',
    setFormInstructions: jest.fn(),
    selectedTemplateId: '',
    setSelectedTemplateId: jest.fn(),
    memoryScope: 'default',
    setMemoryScope: jest.fn(),
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    close: jest.fn(),
    requestClose: jest.fn(),
    save: jest.fn(),
    isScopeCurrent: jest.fn(() => true),
    currentScope: jest.fn(() => null),
  };
}

describe('the project editor fields', () => {
  it('take as many characters as the server accepts for each field', () => {
    render(<ProjectEditorModal editor={editorStub()} />);

    expect(screen.getByLabelText('Project name').props.maxLength).toBe(PROJECT_NAME_MAX_LENGTH);
    expect(screen.getByLabelText('Project description').props.maxLength).toBe(
      PROJECT_DESCRIPTION_MAX_LENGTH,
    );
    expect(screen.getByLabelText('Project instructions').props.maxLength).toBe(
      PROJECT_INSTRUCTIONS_MAX_LENGTH,
    );
  });
});

describe('the New Project header at large text sizes', () => {
  it.each([
    ['the default text size', 1],
    ['the largest text size', LARGEST_IOS_TEXT_SCALE],
  ])('keeps the Settings action whole beside the close control at %s', (_size, scale) => {
    const startingScale = Dimensions.get('window').fontScale;
    setTextScale(scale);
    try {
      render(
        <TextScaleBoundary>
          <ProjectEditorModal editor={editorStub()} />
        </TextScaleBoundary>,
      );
      const actions = screen.getByTestId('project-editor-actions');
      const settings = within(actions).getByText('Settings');
      expect(settings.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(within(actions).getByLabelText('Close project editor')).toBeTruthy();
      expect(within(actions).getByTestId('project-editor-settings')).toBeTruthy();
      const title = screen.getByText('New Project');
      expect(title.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      if (scale === 1) {
        expect(within(actions).getByText('New Project')).toBe(title);
        expect(screen.queryByTestId('project-editor-title-line')).toBeNull();
        return;
      }
      expect(within(actions).queryByText('New Project')).toBeNull();
      expect(within(screen.getByTestId('project-editor-title-line')).getByText('New Project')).toBe(
        title,
      );
    } finally {
      setTextScale(startingScale);
    }
  });
});
