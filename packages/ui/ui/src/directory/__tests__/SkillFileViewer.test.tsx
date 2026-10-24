import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fileExtension, highlightLine, isCodeFile, isTextFile, splitLines } from '../highlight';
import { CodeBlock, SkillFileBody, SkillFileTree } from '../SkillFileViewer';

afterEach(cleanup);

describe('file classification', () => {
  it('reads the extension, including a dotless name', () => {
    expect(fileExtension('fonts/Bold.ttf')).toBe('ttf');
    expect(fileExtension('LICENSE')).toBe('license');
    expect(fileExtension('a/b/script.sh')).toBe('sh');
  });

  it('treats code and shell files as code', () => {
    expect(isCodeFile('run.sh')).toBe(true);
    expect(isCodeFile('index.ts')).toBe(true);
    expect(isCodeFile('SKILL.md')).toBe(false);
    expect(isCodeFile('Bold.ttf')).toBe(false);
  });

  it('treats markdown and text as previewable but not a font', () => {
    expect(isTextFile('SKILL.md')).toBe(true);
    expect(isTextFile('LICENSE')).toBe(true);
    expect(isTextFile('notes.txt')).toBe(true);
    expect(isTextFile('Bold.ttf')).toBe(false);
    expect(isTextFile('logo.png')).toBe(false);
  });
});

describe('highlightLine', () => {
  it('marks a whole line comment', () => {
    expect(highlightLine('// a note')).toEqual([{ text: '// a note', kind: 'comment' }]);
    expect(highlightLine('# shell note')).toEqual([{ text: '# shell note', kind: 'comment' }]);
  });

  it('marks strings, numbers and keywords', () => {
    const tokens = highlightLine('const x = "hi" + 42');
    expect(tokens.find((token) => token.text === 'const')?.kind).toBe('keyword');
    expect(tokens.find((token) => token.text === '"hi"')?.kind).toBe('string');
    expect(tokens.find((token) => token.text === '42')?.kind).toBe('number');
    expect(tokens.some((token) => token.kind === 'plain' && token.text.includes('x'))).toBe(true);
  });

  it('keeps an unterminated string on one line', () => {
    expect(highlightLine('echo "open')).toContainEqual({ text: '"open', kind: 'string' });
  });

  it('does not treat an escaped quote as the end of a string', () => {
    const tokens = highlightLine('a = "he said \\"hi\\"" end');
    expect(tokens.find((token) => token.kind === 'string')?.text).toBe('"he said \\"hi\\""');
  });

  it('rebuilds the original line exactly', () => {
    const line = 'if (count > 3) { return "done"; } // finish';
    expect(
      highlightLine(line)
        .map((token) => token.text)
        .join(''),
    ).toBe(line);
  });

  it('splits lines and drops one trailing newline', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('')).toEqual(['']);
  });
});

describe('CodeBlock', () => {
  it('numbers every line', () => {
    render(<CodeBlock content={'first\nsecond\nthird'} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('second')).toBeTruthy();
  });
});

describe('SkillFileTree', () => {
  const files = [
    { path: 'SKILL.md' },
    { path: 'LICENSE.txt' },
    { path: 'fonts/Bold.ttf' },
    { path: 'fonts/Regular.ttf' },
  ];

  it('lists top level files and keeps folders collapsed', () => {
    render(<SkillFileTree files={files} selectedPath="SKILL.md" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'SKILL.md' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'LICENSE.txt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'fonts' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bold.ttf' })).toBeNull();
  });

  it('reveals the files inside a folder when it is expanded', () => {
    render(<SkillFileTree files={files} selectedPath="SKILL.md" onSelect={vi.fn()} />);
    const folder = screen.getByRole('button', { name: 'fonts' });
    expect(folder.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(folder);
    expect(folder.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Bold.ttf' })).toBeTruthy();
  });

  it('selects a file', () => {
    const onSelect = vi.fn();
    render(<SkillFileTree files={files} selectedPath="SKILL.md" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'LICENSE.txt' }));
    expect(onSelect).toHaveBeenCalledWith('LICENSE.txt');
  });

  it('marks the selected file for assistive technology', () => {
    render(<SkillFileTree files={files} selectedPath="SKILL.md" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'SKILL.md' }).getAttribute('aria-current')).toBe(
      'true',
    );
  });
});

describe('SkillFileBody', () => {
  it('opens a markdown file rendered, with a raw toggle', () => {
    render(<SkillFileBody path="SKILL.md" content={'One\n\nTwo'} previewable />);
    expect(screen.getByRole('button', { name: 'Rendered' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('One')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('opens a code file raw so line numbers show first', () => {
    render(<SkillFileBody path="run.sh" content={'echo hi'} previewable />);
    expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('copies the file contents', () => {
    const onCopy = vi.fn();
    render(<SkillFileBody path="SKILL.md" content="body" previewable onCopy={onCopy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy file contents' }));
    expect(onCopy).toHaveBeenCalledWith('body');
  });

  it('offers a single download for a file it cannot preview', () => {
    const onDownload = vi.fn();
    render(
      <SkillFileBody
        path="fonts/Bold.ttf"
        content={undefined}
        previewable={false}
        onDownload={onDownload}
      />,
    );
    expect(screen.getByText('No preview. This file type cannot be previewed.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Raw' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download file' }));
    expect(onDownload).toHaveBeenCalled();
  });

  it('shows the no preview state with no download control when none is offered', () => {
    render(<SkillFileBody path="fonts/Bold.ttf" content={undefined} previewable={false} />);
    expect(screen.getByText('No preview. This file type cannot be previewed.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download file' })).toBeNull();
  });
});
