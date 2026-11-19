import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';
import type { FileDiff } from '@agiworkforce/types';

import { ToolFileDiffBlock } from '@/src/features/chat/components/ToolFileDiffBlock';
import { codeFontOptions } from '@/src/features/settings/code/codeAppearance';
import { useCodePreferences } from '@/src/features/settings/code/store';

const DIFF: FileDiff = {
  filePath: 'src/app.ts',
  additions: 1,
  deletions: 1,
  lines: [
    { type: 'meta', content: '@@ -1,2 +1,2 @@' },
    { type: 'context', content: 'const keep = 1;' },
    { type: 'remove', content: 'const old = 2;' },
    { type: 'add', content: 'const next = 3;' },
  ],
};

function signOf(view: ReturnType<typeof render>, testID: string): string {
  const row = view.getByTestId(testID);
  const first = row.children[0] as { props: { children?: unknown } };
  return String(first.props.children);
}

function familyOf(node: { props: { style?: unknown } }): unknown {
  return StyleSheet.flatten(node.props.style as never)?.fontFamily;
}

beforeEach(() => {
  useCodePreferences.setState({ codeFont: 'default', showDiffSigns: true });
});

describe('tool diff block appearance', () => {
  it('shows plus and minus signs while the Diff signs switch is on', () => {
    const view = render(<ToolFileDiffBlock diff={DIFF} />);
    expect(signOf(view, 'tool-file-diff-line-add')).toBe('+');
    expect(signOf(view, 'tool-file-diff-line-remove')).toBe('-');
    expect(signOf(view, 'tool-file-diff-line-context')).toBe(' ');
  });

  it('leaves the sign column blank when the Diff signs switch is off, and follows it live', () => {
    const view = render(<ToolFileDiffBlock diff={DIFF} />);
    act(() => useCodePreferences.setState({ showDiffSigns: false }));
    expect(signOf(view, 'tool-file-diff-line-add')).toBe(' ');
    expect(signOf(view, 'tool-file-diff-line-remove')).toBe(' ');
    expect(view.getByText('const next = 3;')).toBeTruthy();
    expect(view.getByText('const old = 2;')).toBeTruthy();
    act(() => useCodePreferences.setState({ showDiffSigns: true }));
    expect(signOf(view, 'tool-file-diff-line-add')).toBe('+');
  });

  it('draws the lines and the header in the chosen Code font', () => {
    const chosen = codeFontOptions().find((option) => option.id !== 'default');
    expect(chosen).toBeDefined();
    useCodePreferences.setState({ codeFont: chosen!.id });
    const view = render(<ToolFileDiffBlock diff={DIFF} />);
    expect(familyOf(view.getByText('const next = 3;'))).toBe(chosen!.family);
    expect(familyOf(view.getByText('src/app.ts'))).toBe(chosen!.family);
  });

  it('uses the default Code font when none is chosen', () => {
    const view = render(<ToolFileDiffBlock diff={DIFF} />);
    expect(familyOf(view.getByText('const next = 3;'))).toBe(codeFontOptions()[0]!.family);
  });

  it('announces whether a line was added or removed whether or not signs are drawn', () => {
    const view = render(<ToolFileDiffBlock diff={DIFF} />);
    expect(view.getByLabelText('Added, const next = 3;')).toBeTruthy();
    expect(view.getByLabelText('Removed, const old = 2;')).toBeTruthy();
    act(() => useCodePreferences.setState({ showDiffSigns: false }));
    expect(view.getByLabelText('Added, const next = 3;')).toBeTruthy();
    expect(view.getByLabelText('Removed, const old = 2;')).toBeTruthy();
    expect(view.getByLabelText('const keep = 1;')).toBeTruthy();
  });
});
