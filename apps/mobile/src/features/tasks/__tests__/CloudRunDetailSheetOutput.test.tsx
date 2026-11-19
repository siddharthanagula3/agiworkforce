import React from 'react';
import { render } from '@testing-library/react-native';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { SYNTHETIC_CLOUD_MODEL_ID } from '@/test-utils/modelFixtures';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('../store', () => ({
  useCloudTaskStore: (selector: (state: { answerInput: () => void }) => unknown) =>
    selector({ answerInput: jest.fn() }),
}));

jest.mock('../components/CloudRunSteerSection', () => ({ CloudRunSteerSection: () => null }));
jest.mock('../components/CloudRunInputForm', () => ({ CloudRunInputForm: () => null }));
jest.mock('../components/CloudRunFilesSection', () => ({ CloudRunFilesSection: () => null }));

import {
  CloudRunDetailSheet,
  stripProviderCitationTokens,
} from '../components/CloudRunDetailSheet';
import type { CloudRunDetail } from '../store';

const RUN_ID = '22222222-2222-4222-8222-222222222222';

const RUN: CloudAgentRun = {
  id: RUN_ID,
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conv-run',
  originSurface: 'mobile',
  workMode: 'research',
  state: 'completed',
  provider: 'managed',
  model: SYNTHETIC_CLOUD_MODEL_ID,
  lastEventSequence: 4,
  cancellationRequestedAt: null,
  completedAt: '2026-11-14T11:00:00.000Z',
  createdAt: '2026-11-14T10:00:00.000Z',
  updatedAt: '2026-11-14T11:00:00.000Z',
};

function renderSheet(transcript: string, status: CloudRunDetail['status'] = 'settled') {
  const detail: CloudRunDetail = {
    runId: RUN_ID,
    run: RUN,
    transcript,
    activity: [],
    plan: [],
    files: [],
    status,
    error: null,
    pendingAction: null,
  };
  return render(
    <CloudRunDetailSheet
      detail={detail}
      title="Research task"
      onClose={jest.fn()}
      onResolveApproval={jest.fn()}
      onStop={jest.fn()}
      onOpenConversation={jest.fn()}
    />,
  );
}

const PRIVATE_USE_TOKEN = 'citeturn6search0turn6view2';
const EMOJI_TOKEN = 'cite\u{1F6A2}turn620734view2\u{1F6B6}';

describe('the latest output of a cloud task', () => {
  it('draws markdown as formatted text rather than literal asterisks and brackets', () => {
    const screen = renderSheet(
      '1. **[Starship lands](https://news.example.test/starship)**\n\n**Wire service, November 14.** The stage was caught.',
    );

    expect(screen.getByText('Starship lands')).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(screen.queryByText(/\]\(https:/)).toBeNull();
  });

  it('never shows a provider citation token', () => {
    const screen = renderSheet(`The probes finished their flybys. ${EMOJI_TOKEN}\n\nNext step.`);

    expect(screen.queryByText(/cite/)).toBeNull();
    expect(screen.queryByText(/turn\d/)).toBeNull();
    expect(screen.getByText(/The probes finished their flybys\./)).toBeTruthy();
    expect(screen.getByText(/Next step\./)).toBeTruthy();
  });

  it('keeps the text after an unfinished token on an earlier line', () => {
    const screen = renderSheet('The probes finished.\uE200cite\uE202turn6search0\n\nNext step.');

    expect(screen.getByText(/Next step\./)).toBeTruthy();
    expect(screen.queryByText(/turn6/)).toBeNull();
  });

  it('highlights code once the run has settled but not while it is live', () => {
    const code = 'Setup:\n\n```bash\nnpm install\n```\n';

    expect(renderSheet(code, 'settled').queryAllByLabelText(/^Download /)).toHaveLength(1);
    expect(renderSheet(code, 'live').queryAllByLabelText(/^Download /)).toHaveLength(0);
  });
});

describe('stripProviderCitationTokens', () => {
  it('removes a private-use citation span and the emoji-separated form', () => {
    expect(stripProviderCitationTokens(`Mars flybys. ${PRIVATE_USE_TOKEN}`)).toBe('Mars flybys. ');
    expect(stripProviderCitationTokens(`Mars flybys. ${EMOJI_TOKEN}`)).toBe('Mars flybys. ');
  });

  it('keeps the text after a closed token and after an unclosed mark on an earlier line', () => {
    expect(stripProviderCitationTokens(`Mars flybys. ${PRIVATE_USE_TOKEN}\n\nNext step.`)).toBe(
      'Mars flybys. \n\nNext step.',
    );
    expect(stripProviderCitationTokens('Mars flybys. \uE200 stray\n\nNext step.')).toBe(
      'Mars flybys.  stray\n\nNext step.',
    );
    expect(stripProviderCitationTokens(`Mars. ${EMOJI_TOKEN}\n\nNext step.`)).toBe(
      'Mars. \n\nNext step.',
    );
  });

  it('removes a well-formed span of another kind and a citation with a hyphenated reference', () => {
    expect(
      stripProviderCitationTokens(
        'See the list.\uE200navlist\uE202Latest launches\uE202turn0news1\uE201 Then more.',
      ),
    ).toBe('See the list. Then more.');
    expect(stripProviderCitationTokens('a \uE200cite\uE202turn0file0-L5\uE201 b')).toBe('a  b');
  });

  it('keeps the text around a stray opening mark mid-line, with or without a later closing mark', () => {
    expect(
      stripProviderCitationTokens(
        'Use the glyph \uE200 before the path \uE201 and keep going.\nNext line.',
      ),
    ).toBe('Use the glyph  before the path  and keep going.\nNext line.');
    expect(stripProviderCitationTokens('Ends with a mark \uE200 and a last word')).toBe(
      'Ends with a mark  and a last word',
    );
  });

  it('keeps a line of shell prompt text that carries a marker character, minus the character', () => {
    expect(stripProviderCitationTokens('~/work \uE200main\uE201 $ npm test\nPASS')).toBe(
      '~/work main $ npm test\nPASS',
    );
    expect(stripProviderCitationTokens('format = "\uE200 $directory"')).toBe(
      'format = " $directory"',
    );
  });

  it('keeps the words after an unclosed citation whose reference holds a hyphen', () => {
    expect(
      stripProviderCitationTokens('a \uE200cite\uE202turn0file0-L5 then words\uE201 later'),
    ).toBe('a -L5 then words later');
  });

  it('removes a closed citation without joining an earlier stray mark to its closing mark', () => {
    expect(
      stripProviderCitationTokens(
        'Run \uE200cmd\uE202x \uE200cite\uE202turn0search0\uE201 then\uE201 now',
      ),
    ).toBe('Run cmdx  then now');
    expect(
      stripProviderCitationTokens('\uE200cite\uE200nav\uE202\uE200cite\uE202x\uE201\uE201cite'),
    ).toBe('citenavcite');
  });

  it('drops a span that is still arriving and leaves ordinary text alone', () => {
    expect(stripProviderCitationTokens('Mars flybys. \uE200cite\uE202turn6se')).toBe(
      'Mars flybys. ',
    );
    expect(stripProviderCitationTokens('Mars flybys. \uE200ci')).toBe('Mars flybys. ');
    expect(stripProviderCitationTokens('Cite the turn6 rule, see [1].')).toBe(
      'Cite the turn6 rule, see [1].',
    );
  });
});
