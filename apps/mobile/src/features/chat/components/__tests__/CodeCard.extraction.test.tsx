import { render } from '@testing-library/react-native';
import { renderMarkdownContent } from '../MessageContentRenderer';

const LONG_PYTHON = Array.from({ length: 24 }, (_, index) => `print(${index})`).join('\n');

const FENCES = [
  '```python\nprint(add(1,2))\ntotal=add(3,4)\n```',
  '```bash\nnpm install\n```',
  '```diff\n-old\n+new\n context\n```',
  '```\nplain words\n```',
  `\`\`\`python\n${LONG_PYTHON}\n\`\`\``,
  '```python\n\n```',
];

describe('code card extraction', () => {
  it.each(FENCES.map((fence, index) => [index, fence] as const))(
    'renders finished fence %i as before',
    (_index, fence) => {
      const screen = render(
        <>
          {renderMarkdownContent(fence, undefined, { highlightCode: true, capCodeBlocks: true })}
        </>,
      );
      expect(screen.toJSON()).toMatchSnapshot();
    },
  );

  it.each(FENCES.slice(0, 3).map((fence, index) => [index, fence] as const))(
    'renders streaming fence %i as before',
    (_index, fence) => {
      const screen = render(
        <>
          {renderMarkdownContent(fence, undefined, {
            highlightCode: false,
            streaming: true,
            capCodeBlocks: true,
          })}
        </>,
      );
      expect(screen.toJSON()).toMatchSnapshot();
    },
  );
});
