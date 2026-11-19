import { render, screen } from '@testing-library/react-native';
import { EXPLICIT_ARTIFACT_MARKER_FOR } from '@agiworkforce/artifacts';

jest.mock('@/src/features/chat/components/ArtifactFullScreen', () => ({
  ArtifactFullScreen: () => null,
}));

import { StreamingArtifactCard } from '../StreamingArtifactCard';

describe('the card of an artifact being written', () => {
  it('shows the code lines, not the title or artifact line', () => {
    const writing = [
      'Here is the component.',
      '',
      '```jsx',
      EXPLICIT_ARTIFACT_MARKER_FOR.react,
      '// @title: Tiny Counter',
      '',
      'function App() {',
    ].join('\n');

    render(
      <StreamingArtifactCard
        conversationId="conv-tail"
        messageId="msg-tail"
        content={writing}
        offered
        isStreaming
        failed={false}
        finalArtifacts={[]}
      />,
    );

    expect(screen.getByText('function App() {')).toBeTruthy();
    expect(screen.queryByText(/@title/)).toBeNull();
    expect(screen.queryByText(/@artifact/)).toBeNull();
  });
});
