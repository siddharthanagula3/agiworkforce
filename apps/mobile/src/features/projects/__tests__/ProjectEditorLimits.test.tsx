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
import { render, screen } from '@testing-library/react-native';
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
