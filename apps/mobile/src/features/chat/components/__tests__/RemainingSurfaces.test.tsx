import { render, screen } from '@testing-library/react-native';
import { renderMarkdownContent } from '../MessageContentRenderer';

const REPLY = [
  '```map',
  'Library | Main reading room',
  '```',
  '',
  '```transcript',
  '00:12 | Speaker 1 | Hello there',
  '```',
  '',
  '```timeline',
  'Plan | Define scope | Complete',
  '```',
  '',
  '```files',
  'notes.pdf | PDF | Summary',
  '```',
].join('\n');

describe('mobile remaining surfaces', () => {
  it('renders map, transcript, timeline, and files outside a code card', () => {
    render(<>{renderMarkdownContent(REPLY)}</>);
    expect(screen.getByTestId('answer-surface-map')).toBeTruthy();
    expect(screen.getByText(/Main reading room/)).toBeTruthy();
    expect(screen.getByText(/not an audio player/)).toBeTruthy();
    expect(screen.getByText(/Complete/)).toBeTruthy();
    expect(screen.getByText(/notes.pdf/)).toBeTruthy();
    expect(screen.queryByText('map')).toBeNull();
  });
});
