import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { act, render, renderHook, within } from '@testing-library/react-native';
import type { CodeTranscriptItem } from '@agiworkforce/cloud-contracts';

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: () => null,
}));

import { Text } from '@/components/ui/Text';
import { TranscriptFontContext } from '@/components/ui/transcriptFont';
import { CloudCodeTranscript } from '@/src/features/cloud-code/components/CloudCodeTranscript';
import {
  codeFontOptions,
  resolveCodeFontFamily,
  resolveTranscriptFontFamily,
} from '@/src/features/settings/code/codeAppearance';
import { useCodePreferences } from '@/src/features/settings/code/store';
import {
  useCodeFontFamily,
  useTranscriptFontFamily,
} from '@/src/features/settings/code/useCodeAppearance';

type PlatformSpec = Record<string, unknown>;

function onPlatform(os: 'ios' | 'android') {
  jest
    .spyOn(Platform, 'select')
    .mockImplementation(((spec: PlatformSpec) =>
      os in spec ? spec[os] : spec.default) as typeof Platform.select);
}

function familyOf(node: { props: { style?: unknown } }): unknown {
  return StyleSheet.flatten(node.props.style as never)?.fontFamily;
}

beforeEach(() => {
  useCodePreferences.setState({ codeFont: 'default', transcriptFont: 'system' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('code font choices', () => {
  it('offers Menlo, Courier New and System mono on iOS', () => {
    onPlatform('ios');

    expect(codeFontOptions().map(({ id, label, family }) => [id, label, family])).toEqual([
      ['default', 'Menlo', 'Menlo'],
      ['courier', 'Courier New', 'Courier New'],
      ['system-mono', 'System mono', 'ui-monospace'],
    ]);
  });

  it('offers the system monospace and the serif monospace on Android', () => {
    onPlatform('android');

    expect(codeFontOptions().map(({ id, label, family }) => [id, label, family])).toEqual([
      ['default', 'Monospace', 'monospace'],
      ['serif-monospace', 'Serif monospace', 'serif-monospace'],
    ]);
  });

  it('falls back to the default face for a choice the platform does not offer', () => {
    onPlatform('android');
    expect(resolveCodeFontFamily('courier')).toBe('monospace');

    onPlatform('ios');
    expect(resolveCodeFontFamily('serif-monospace')).toBe('Menlo');
  });
});

describe('transcript font choices', () => {
  it('leaves the system face alone, uses Georgia or serif for Serif and the code font for Mono', () => {
    onPlatform('ios');
    expect(resolveTranscriptFontFamily('system', 'courier')).toBeUndefined();
    expect(resolveTranscriptFontFamily('serif', 'courier')).toBe('Georgia');
    expect(resolveTranscriptFontFamily('mono', 'courier')).toBe('Courier New');

    onPlatform('android');
    expect(resolveTranscriptFontFamily('serif', 'default')).toBe('serif');
    expect(resolveTranscriptFontFamily('mono', 'serif-monospace')).toBe('serif-monospace');
  });
});

describe('useCodeFontFamily', () => {
  it('follows the saved code font', () => {
    onPlatform('ios');
    const { result } = renderHook(() => useCodeFontFamily());
    expect(result.current).toBe('Menlo');

    act(() => useCodePreferences.getState().setCodeFont('system-mono'));
    expect(result.current).toBe('ui-monospace');

    act(() => useCodePreferences.getState().setCodeFont('courier'));
    expect(result.current).toBe('Courier New');
  });
});

describe('useTranscriptFontFamily', () => {
  it('follows the saved transcript font and the code font behind Mono', () => {
    onPlatform('ios');
    const { result } = renderHook(() => useTranscriptFontFamily());
    expect(result.current).toBeUndefined();

    act(() => useCodePreferences.getState().setTranscriptFont('serif'));
    expect(result.current).toBe('Georgia');

    act(() => {
      useCodePreferences.getState().setTranscriptFont('mono');
      useCodePreferences.getState().setCodeFont('courier');
    });
    expect(result.current).toBe('Courier New');
  });
});

describe('Text mono variant', () => {
  it('draws in the saved code font and follows a change made while it is on screen', () => {
    onPlatform('ios');
    const screen = render(<Text variant="mono">const a = 1;</Text>);
    expect(familyOf(screen.getByText('const a = 1;'))).toBe('Menlo');

    act(() => useCodePreferences.getState().setCodeFont('courier'));
    expect(familyOf(screen.getByText('const a = 1;'))).toBe('Courier New');
  });

  it('lets a style that names its own face win', () => {
    const screen = render(
      <Text variant="mono" style={{ fontFamily: 'Georgia' }}>
        own face
      </Text>,
    );
    expect(familyOf(screen.getByText('own face'))).toBe('Georgia');
  });

  it('leaves other variants without a face of their own', () => {
    const screen = render(<Text>plain</Text>);
    expect(familyOf(screen.getByText('plain'))).toBeUndefined();
  });

  it('takes the transcript face for prose below a provider but keeps code in the code font', () => {
    onPlatform('ios');
    const screen = render(
      <TranscriptFontContext.Provider value="Georgia">
        <Text>prose</Text>
        <Text variant="mono">code</Text>
      </TranscriptFontContext.Provider>,
    );
    expect(familyOf(screen.getByText('prose'))).toBe('Georgia');
    expect(familyOf(screen.getByText('code'))).toBe('Menlo');
  });
});

describe('cloud session transcript', () => {
  const items: CodeTranscriptItem[] = [
    {
      kind: 'task',
      id: 'task-1',
      at: '2026-11-14T00:00:00Z',
      text: 'Fix the parser',
      mode: 'agent',
    },
    {
      kind: 'reply',
      id: 'turn-1',
      at: '2026-11-14T00:00:01Z',
      text: 'Parser fixed.',
      stopReason: null,
      retryGoal: null,
      retryMode: 'agent',
    },
  ];

  it('keeps the system face for the task and the reply by default', () => {
    const screen = render(<CloudCodeTranscript items={items} />);

    expect(familyOf(screen.getByText('Fix the parser'))).toBeUndefined();
    expect(familyOf(screen.getByText('Parser fixed.'))).toBeUndefined();
  });

  it('draws the task and the reply in the serif face', () => {
    onPlatform('ios');
    useCodePreferences.setState({ transcriptFont: 'serif' });
    const screen = render(<CloudCodeTranscript items={items} />);

    expect(familyOf(screen.getByText('Fix the parser'))).toBe('Georgia');
    expect(familyOf(screen.getByText('Parser fixed.'))).toBe('Georgia');
  });

  it('draws the task and the reply in the chosen code font for Mono', () => {
    onPlatform('ios');
    useCodePreferences.setState({ transcriptFont: 'mono', codeFont: 'courier' });
    const screen = render(<CloudCodeTranscript items={items} />);

    expect(familyOf(screen.getByText('Fix the parser'))).toBe('Courier New');
    expect(familyOf(screen.getByText('Parser fixed.'))).toBe('Courier New');
  });

  it('keeps highlighted code in the code font rather than the transcript face', () => {
    onPlatform('ios');
    useCodePreferences.setState({ transcriptFont: 'serif' });
    const reply: CodeTranscriptItem = {
      kind: 'reply',
      id: 'turn-2',
      at: '2026-11-14T00:00:02Z',
      text: 'Use this.\n\n```ts\nconst answer = "yes"; // note\n```',
      stopReason: null,
      retryGoal: null,
      retryMode: 'agent',
    };
    const screen = render(<CloudCodeTranscript items={[reply]} />);

    const block = screen.getByLabelText(/code block/);
    expect(familyOf(block)).toBe('Menlo');
    ['const', '"yes"', '// note'].forEach((token) => {
      expect(familyOf(within(block).getByText(token))).not.toBe('Georgia');
    });
    expect(familyOf(screen.getByText('Use this.'))).toBe('Georgia');
  });

  it('keeps the system face for text outside replies and tasks', () => {
    onPlatform('ios');
    useCodePreferences.setState({ transcriptFont: 'serif' });
    const screen = render(
      <>
        <CloudCodeTranscript items={items} />
        <Text>outside</Text>
      </>,
    );

    expect(familyOf(screen.getByText('outside'))).toBeUndefined();
  });
});
