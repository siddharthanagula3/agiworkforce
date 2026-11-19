import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../CodeBlockCopyButton', () => ({ CodeBlockCopyButton: () => null }));

const mockExportSourceFile = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  exportSourceFile: (...args: unknown[]) => mockExportSourceFile(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

import { codeDownloadFile, renderMarkdownContent } from '../MessageContentRenderer';

function renderMarkdown(content: string) {
  return render(<>{renderMarkdownContent(content)}</>);
}

beforeEach(() => {
  mockExportSourceFile.mockReset().mockResolvedValue({ uri: 'file:///exports/code' });
  mockShareFile.mockReset().mockResolvedValue(undefined);
});

describe('code downloads', () => {
  it('saves a csv fence with formula cells neutralised, as web does', async () => {
    const screen = renderMarkdown('```csv\nname,total\nAda,=1+1\n```');
    fireEvent.press(screen.getByLabelText('Download code.csv'));
    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith('file:///exports/code'));
    expect(mockExportSourceFile).toHaveBeenCalledWith("name,total\nAda,'=1+1", 'code', 'csv');
  });

  it('neutralises a tsv fence too', () => {
    expect(codeDownloadFile('a\t=cmd', 'tsv')).toEqual({
      body: "a\t'=cmd",
      title: 'code',
      extension: 'tsv',
    });
  });

  it.each([
    ['kt', 'code', 'kt'],
    ['rb', 'code', 'rb'],
    ['rust', 'code', 'rs'],
    ['scss', 'code', 'scss'],
    ['less', 'code', 'less'],
    ['h', 'code', 'h'],
    ['makefile', 'Makefile', ''],
    ['dockerfile', 'Dockerfile', ''],
  ])('names a %s fence with the web rules', (language, title, extension) => {
    expect(codeDownloadFile('x', language)).toMatchObject({ title, extension });
  });

  it('reads the file name in the Download label', () => {
    expect(
      renderMarkdown('```kt\nfun main() {}\n```').getByLabelText('Download code.kt'),
    ).toBeTruthy();
  });

  it('offers no Download for an empty fence', () => {
    const screen = renderMarkdown('```python\n\n```');
    expect(screen.queryByLabelText(/^Download/)).toBeNull();
  });
});

describe('code card labels', () => {
  it('shows the language in lower case, as web does', () => {
    expect(renderMarkdown('```Python\nprint(1)\n```').getByText('python')).toBeTruthy();
  });

  it('reads the language from a fence that also names a path, as web does', () => {
    const screen = renderMarkdown('```ts:src/a.ts\nconst a = 1;\n```');
    expect(screen.getByText('ts')).toBeTruthy();
    expect(screen.queryByText('ts:src/a.ts')).toBeNull();
    expect(screen.getByLabelText('Download code.ts')).toBeTruthy();
    expect(screen.getByLabelText('ts code block')).toBeTruthy();
  });

  it('names the code body for VoiceOver with its language', () => {
    const screen = renderMarkdown('```python\nprint(1)\n```');
    const body = screen.getByLabelText('python code block');
    expect(body.props.accessibilityValue).toEqual({ text: 'print(1)' });
  });

  it('says shell commands have not been run', () => {
    const screen = renderMarkdown('```bash\nrm -rf build\n```');
    expect(
      screen.getByText('These commands are examples only; they have not been executed.'),
    ).toBeTruthy();
  });

  it('adds no note under other languages', () => {
    expect(renderMarkdown('```js\nlet a\n```').queryByTestId('code-commands-not-run')).toBeNull();
  });
});

const EXACT_TEXT = { normalizer: (text: string) => text };

describe('tabs in code', () => {
  it('lines tab-indented code up on four-column stops, as web does, and keeps the tabs for VoiceOver', () => {
    const source = 'func main() {\n\tx := 1\t// one\n\tif x {\n\t\treturn\n\t}\n}';
    const screen = renderMarkdown(`\`\`\`go\n${source}\n\`\`\``);
    const body = screen.getByLabelText('go code block');

    expect(body).toHaveTextContent(
      'func main() {\n    x := 1  // one\n    if x {\n        return\n    }\n}',
      EXACT_TEXT,
    );
    expect(body.props.accessibilityValue).toEqual({ text: source });
  });

  it('expands tabs in a plain fence and in diff lines', () => {
    const plain = renderMarkdown('```\na\tb\n```');
    expect(plain.getByLabelText('Plain text code block')).toHaveTextContent('a   b', EXACT_TEXT);

    const diff = renderMarkdown('```diff\n+\tadded\n```');
    expect(diff.getByTestId('markdown-diff-line-added')).toHaveTextContent('+   added', EXACT_TEXT);
  });
});
