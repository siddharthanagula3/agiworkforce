import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import {
  ProjectFileCitations,
  projectFileCitationsFromMetadata,
} from '../src/features/chat/components/ProjectFileCitations';

const PROJECT_ID = '0190a000-0000-7000-8000-0000000000d1';
const FILE_ID = '0190a000-0000-7000-8000-0000000000d2';

const METADATA = {
  projectSources: [
    {
      fileName: 'report.pdf',
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      snippet: 'Revenue grew 12 percent in the third quarter.',
      anchor: { page: 12 },
    },
    {
      fileName: 'report.pdf',
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      snippet: 'A second passage from the same page.',
      anchor: { page: 12 },
    },
    { fileName: 'handbook.md', anchor: { headingPath: ['Pricing', 'Refunds'] } },
  ],
};

let alert: jest.SpyInstance;

beforeEach(() => {
  mockPush.mockReset();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => alert.mockRestore());

describe('project files an answer drew on', () => {
  it('reads one chip per file and place from the stored turn', () => {
    expect(projectFileCitationsFromMetadata(METADATA).map((c) => c.fileName)).toEqual([
      'report.pdf',
      'handbook.md',
    ]);
    expect(projectFileCitationsFromMetadata(null)).toEqual([]);
  });

  it('shows the page and the heading trail beside each file name', () => {
    const screen = render(
      <ProjectFileCitations citations={projectFileCitationsFromMetadata(METADATA)} />,
    );
    expect(screen.getByLabelText('Project file report.pdf, p. 12')).toBeTruthy();
    expect(screen.getByText('· p. 12')).toBeTruthy();
    expect(screen.getByLabelText('Project file handbook.md, Pricing › Refunds')).toBeTruthy();
  });

  it('previews the passage and opens the project file at its page', () => {
    const screen = render(
      <ProjectFileCitations citations={projectFileCitationsFromMetadata(METADATA)} />,
    );
    fireEvent.press(screen.getByLabelText('Project file report.pdf, p. 12'));

    const [title, message, buttons] = alert.mock.calls[0] as [
      string,
      string,
      { text: string; onPress?: () => void }[],
    ];
    expect(title).toBe('report.pdf');
    expect(message).toBe('p. 12\n\nRevenue grew 12 percent in the third quarter.');
    buttons.find((button) => button.text === 'Open file')?.onPress?.();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/projects/[id]',
      params: { id: PROJECT_ID, knowledgeFile: FILE_ID, page: '12' },
    });
  });

  it('lists the passage the answer names first', () => {
    const screen = render(
      <ProjectFileCitations
        citations={projectFileCitationsFromMetadata(METADATA)}
        answerText="Pricing › Refunds explains the window."
      />,
    );
    const labels = screen
      .getAllByLabelText(/^Project file /)
      .map((node) => node.props.accessibilityLabel);
    expect(labels).toEqual([
      'Project file handbook.md, Pricing › Refunds',
      'Project file report.pdf, p. 12',
    ]);
  });

  it('is a plain label, not a link, when the turn carried no file id', () => {
    const screen = render(
      <ProjectFileCitations citations={projectFileCitationsFromMetadata(METADATA)} />,
    );
    const label = screen.getByLabelText('Project file handbook.md, Pricing › Refunds');
    expect(label.props.accessibilityRole).toBe('text');
    fireEvent.press(label);
    expect(alert).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('gives each chip a 44 point tap area', () => {
    const screen = render(
      <ProjectFileCitations citations={projectFileCitationsFromMetadata(METADATA)} />,
    );
    const chip = screen.getByLabelText('Project file report.pdf, p. 12');
    const style = Object.assign({}, ...[chip.props.style].flat());
    expect(
      style.minHeight + chip.props.hitSlop.top + chip.props.hitSlop.bottom,
    ).toBeGreaterThanOrEqual(44);
  });
});
