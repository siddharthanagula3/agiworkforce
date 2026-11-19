import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { render } from '@testing-library/react-native';
import { SYNTHETIC_CLOUD_MODEL_ID } from '@/test-utils/modelFixtures';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('@/src/features/memory/services/contextBudgeter', () => ({
  computeContextBudget: () => ({ status: 'warn' }),
}));

jest.mock('@/src/features/chat/components/ContextDetailsSheet', () => ({
  ContextDetailsSheet: () => null,
}));

jest.mock('@/src/features/settings/cloud-privacy/NamedProviderConsentModal', () => ({
  NamedProviderConsentModal: () => null,
}));

const mockCanAccess = jest.fn();
jest.mock('@/src/features/model-picker/service', () => ({
  ...jest.requireActual('@/src/features/model-picker/service'),
  canAccessCloudModelForTier: (...args: unknown[]) => mockCanAccess(...args),
}));

jest.mock('@/lib/models', () => ({
  ...jest.requireActual('@/lib/models'),
  getModelById: (id: string) => ({ id, name: 'Fixture Cloud Model' }),
}));

import { BottomSearchBar } from '@/src/shared/components/BottomSearchBar';
import { ContextWarningChip } from '@/src/features/chat/components/ContextWarningChip';
import { ModelTierWarningBanner } from '@/src/features/chat/components/ModelTierWarningBanner';
import { ProviderConsentBanner } from '@/src/features/chat/components/ProviderConsentBanner';
import { SendErrorBanner } from '@/src/features/chat/components/SendErrorBanner';
import { UsageLimitBanner } from '@/src/features/chat/components/UsageLimitBanner';
import { useModelStore } from '@/src/features/model-picker/store';
import { VoiceInlineBar } from '@/src/features/voice/components/VoiceInlineBar';
import { READING_COLUMN_MAX_WIDTH } from '@/src/shared/layout/contentColumn';
import { MAX_GRID_CONTENT_WIDTH } from '@/src/shared/hooks/useResponsiveLayout';
import { useSettingsStore } from '@/stores/settingsStore';

function flat(node: { props: { style?: unknown } }) {
  return (StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) ?? {}) as ViewStyle;
}

function expectColumn(node: { props: { style?: unknown } }, maxWidth: number) {
  expect(flat(node)).toMatchObject({ width: '100%', maxWidth, alignSelf: 'center' });
}

function hostParent(node: { parent: unknown }) {
  let parent = node.parent as { type: unknown; parent: unknown; props: { style?: unknown } } | null;
  while (parent && typeof parent.type !== 'string') parent = parent.parent as typeof parent;
  return parent as { props: { style?: unknown } };
}

function expectFullBleed(node: { props: { style?: unknown } }) {
  const style = flat(node);
  expect(style.maxWidth).toBeUndefined();
  expect(style.alignSelf).toBeUndefined();
}

describe('the strips between the transcript and the composer on a wide pane', () => {
  it('holds the failed-send strip content to the reading column and leaves its tint full width', () => {
    const view = render(<SendErrorBanner error="Network down" onDismiss={jest.fn()} />);

    const content = view.getByTestId('send-error-banner.content');
    expectColumn(content, READING_COLUMN_MAX_WIDTH);
    expectFullBleed(hostParent(content));
    expect(flat(hostParent(content)).backgroundColor).toBeTruthy();
    expect(view.getByLabelText('Dismiss error')).toBeTruthy();
  });

  it('holds the provider consent strip content to the reading column', () => {
    const view = render(
      <ProviderConsentBanner
        state={{
          providerId: 'deepseek',
          displayName: 'Fixture Provider',
          code: 'cn_hq_provider_not_opted_in',
        }}
        onEnabled={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );

    expectColumn(view.getByTestId('provider-consent-banner.content'), READING_COLUMN_MAX_WIDTH);
    expectFullBleed(view.getByTestId('provider-consent-banner'));
  });

  it('holds the long-chat strip content to the reading column', () => {
    const view = render(
      <ContextWarningChip
        modelId={SYNTHETIC_CLOUD_MODEL_ID}
        messages={[]}
        onStartFreshChat={jest.fn()}
      />,
    );

    const content = view.getByTestId('context-warning-chip.content');
    expectColumn(content, READING_COLUMN_MAX_WIDTH);
    expectFullBleed(hostParent(content));
  });

  it('holds the model plan strip content to the reading column', () => {
    mockCanAccess.mockReturnValue(false);
    useModelStore.setState({ selectedModel: SYNTHETIC_CLOUD_MODEL_ID });
    const view = render(<ModelTierWarningBanner onChooseModel={jest.fn()} />);

    const content = view.getByTestId('model-tier-warning-banner.content');
    expectColumn(content, READING_COLUMN_MAX_WIDTH);
    expectFullBleed(hostParent(content));
  });

  it('holds the usage card to the reading column and keeps its own side margin', () => {
    const view = render(
      <UsageLimitBanner
        warning={{
          bucket: 'session',
          severity: 'warning',
          percentRemaining: 10,
          headline: 'Usage is running low',
          resetLabel: null,
        }}
        actionLabel={null}
        onAction={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );

    expectColumn(view.getByTestId('chat.usage-limit.column'), READING_COLUMN_MAX_WIDTH);
    const card = flat(view.getByTestId('chat.usage-limit'));
    expect(card.marginHorizontal).toBe(12);
    expect(card.maxWidth).toBeUndefined();
    expect(card.width).toBeUndefined();
  });
});

describe('the search field at the bottom of a list on a wide pane', () => {
  function renderBar(columnKind?: 'grid') {
    return render(
      <BottomSearchBar
        value=""
        onChangeText={jest.fn()}
        placeholder="Search"
        accessibilityLabel="Search"
        testID="bar"
        columnKind={columnKind}
      />,
    );
  }

  it('wraps the field in the reading column and leaves the field itself unchanged', () => {
    const view = renderBar();

    expectColumn(view.getByTestId('bottom-search-bar.column'), READING_COLUMN_MAX_WIDTH);
    expect(view.getByTestId('bottom-search-bar.column').props.pointerEvents).toBe('box-none');
    const field = flat(view.getByTestId('bar'));
    expect(field.marginHorizontal).toBe(16);
    expect(field.maxWidth).toBeUndefined();
    expect(field.width).toBeUndefined();
  });

  it('matches the grid width when a screen under a grid asks for it', () => {
    const view = renderBar('grid');

    expectColumn(view.getByTestId('bottom-search-bar.column'), MAX_GRID_CONTENT_WIDTH);
  });
});

describe('the inline voice bar on a wide pane', () => {
  it('holds its controls to the reading column while the glow keeps the whole pane', () => {
    useSettingsStore.setState({ hapticsEnabled: false });
    const view = render(
      <VoiceInlineBar visible phase="listening" onToggleMic={jest.fn()} onExit={jest.fn()} />,
    );

    const content = view.getByTestId('voice-inline-bar.content');
    expectColumn(content, READING_COLUMN_MAX_WIDTH);
    expect(flat(content).paddingHorizontal).toBe(16);
    expectFullBleed(view.getByTestId('voice-inline-bar'));
    expect(flat(view.getByTestId('voice-inline-bar')).paddingHorizontal).toBeUndefined();
    expect(
      view
        .getByTestId('voice-inline-bar')
        .findAll((node) => node.props.testID?.startsWith('voice-state-glow')).length,
    ).toBeGreaterThan(0);
  });
});
