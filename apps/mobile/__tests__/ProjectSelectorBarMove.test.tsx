/* eslint-disable @typescript-eslint/no-require-imports */

import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = ({ size, color }: { size?: number; color?: string }) => (
    <Text>{`icon-${size}-${color}`}</Text>
  );
  return { FolderOpen: icon, ChevronDown: icon, X: icon, Check: icon, FolderMinus: icon };
});

const mockSetCloudActive = jest.fn();
const mockSetLocalActive = jest.fn();
const mockMoveConversationToProject = jest.fn();

jest.mock('@/stores/projects/cloudProjectStore', () => ({
  useCloudProjectStore: (
    selector: (state: {
      projects: { id: string; name: string; description: string | null; deletedAt: null }[];
      activeProjectId: string | null;
      setActiveCloudProject: (id: string | null) => void;
    }) => unknown,
  ) =>
    selector({
      projects: [
        { id: 'project-a', name: 'Alpha', description: null, deletedAt: null },
        { id: 'project-b', name: 'Beta', description: null, deletedAt: null },
      ],
      activeProjectId: 'project-a',
      setActiveCloudProject: mockSetCloudActive,
    }),
}));

jest.mock('@/src/features/projects/store', () => ({
  useProjectStore: (
    selector: (state: {
      projects: { id: string; name: string; description: string | null }[];
      activeProjectId: string | null;
      setActiveProject: (id: string | null) => void;
    }) => unknown,
  ) =>
    selector({
      projects: [
        { id: 'project-a', name: 'Alpha', description: null },
        { id: 'project-b', name: 'Beta', description: null },
      ],
      activeProjectId: 'project-a',
      setActiveProject: mockSetLocalActive,
    }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: { appMode: 'cloud' | 'local' }) => unknown) =>
    selector({ appMode: 'cloud' }),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (
    selector: (state: {
      moveConversationToProject: typeof mockMoveConversationToProject;
    }) => unknown,
  ) => selector({ moveConversationToProject: mockMoveConversationToProject }),
}));

import { ProjectSelectorBar } from '../src/features/chat/components/ProjectSelectorBar';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type ConversationProp = { id: string; projectId?: string; executionMode: 'local' | 'cloud' };

function renderBar(conversation?: ConversationProp) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ProjectSelectorBar conversation={conversation} />
    </SafeAreaProvider>,
  );
}

function chooseBeta(utils: ReturnType<typeof renderBar>) {
  fireEvent.press(utils.getByLabelText('Active project: Alpha. Tap to change'));
  fireEvent.press(utils.getByLabelText('Select project: Beta'));
}

describe('ProjectSelectorBar project changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('leaves the new-chat default alone when moving an existing chat is refused', async () => {
    mockMoveConversationToProject.mockResolvedValue(false);
    const utils = renderBar({ id: 'chat-1', projectId: 'project-a', executionMode: 'cloud' });

    chooseBeta(utils);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(mockMoveConversationToProject).toHaveBeenCalledWith('chat-1', 'project-b');
    expect(mockSetCloudActive).not.toHaveBeenCalled();
  });

  it('moves the new-chat default only after the chat move is confirmed', async () => {
    mockMoveConversationToProject.mockResolvedValue(true);
    const utils = renderBar({ id: 'chat-1', projectId: 'project-a', executionMode: 'cloud' });

    chooseBeta(utils);

    await waitFor(() => expect(mockSetCloudActive).toHaveBeenCalledWith('project-b'));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('sets the new-chat default immediately when no chat is attached', () => {
    const utils = renderBar();

    chooseBeta(utils);

    expect(mockMoveConversationToProject).not.toHaveBeenCalled();
    expect(mockSetCloudActive).toHaveBeenCalledWith('project-b');
  });
});
