import { createWebChatWorkspaceFixture } from './WebChatWorkspaceFixture';
import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('react-i18next');
type ScanModule1 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule2 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule5 = typeof import('@agiworkforce/ui');
type ScanModule6 = typeof import('@agiworkforce/unified-chat');
type ScanModule7 = typeof import('../../components/ConversationTitleMenu');

const mocks = vi.hoisted(() => ({
  composerProps: null as null | Record<string, unknown>,
  messageListProps: null as null | Record<string, unknown>,
  voiceSurfaceProps: null as null | Record<string, unknown>,
  freeModelPromotion: null as null | { modelId: string; endsAt: string },
  openUpgradeDialog: vi.fn(),
  continueGeneration: vi.fn(async () => undefined),
  updateConversation: vi.fn(async () => true),
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000921';
const ASSISTANT_MESSAGE_ID = '00000000-0000-4000-8000-0000000009c2';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ sessionId: CONVERSATION_ID }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/chat/${CONVERSATION_ID}`,
}));

vi.mock('@clerk/nextjs', async () => {
  const { createClerkSessionFixture } =
    await import('@/lib/identity/__tests__/clerk-session-fixture');
  const session = createClerkSessionFixture(
    () => ({
      getToken: async () => 'fixture-token',
      isLoaded: true,
      userId: 'fixture-user',
      isSignedIn: true,
      sessionId: 'fixture-session',
    }),
    { signOut: vi.fn() },
  );
  return {
    ...session,
    useUser: () => ({ user: null }),
  };
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
}));
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
  readAutonomousToolApprovalsAllowed: async () => false,
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

vi.mock('@/lib/hooks/useConversations', async (importOriginal) => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useConversations: () => ({
      conversations: useChatStore((state) => state.conversations),
      isLoading: false,
      createConversation: vi.fn(),
      loadConversation: vi.fn(),
      deleteConversation: vi.fn(async () => true),
      updateConversation: mocks.updateConversation,
      setActiveConversation: vi.fn(),
    }),
  };
});

vi.mock('@/lib/hooks/useManagedUsageSummary', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getWorstUsagePercent: () => 0,
  readManagedUsageBuckets: () => [],
  useManagedUsageSummary: () => ({ usage: null }),
}));

vi.mock('@/lib/hooks/useMediaGeneration', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return {
    ...actual,
    useMediaGeneration: () => ({
      generateImage: vi.fn(),
      generateVideo: vi.fn(),
      startVideoGeneration: vi.fn(),
      watchVideoGeneration: vi.fn(),
    }),
  };
});

vi.mock('@features/billing/hooks/useUpgradePlanFlow', () => ({
  useUpgradePlanFlow: () => ({ openUpgradeDialog: mocks.openUpgradeDialog, upgradeDialogs: null }),
}));
vi.mock('../../hooks/use-free-model-promotion', () => ({
  useFreeModelPromotion: () => ({ ready: true, promotion: mocks.freeModelPromotion }),
}));

vi.mock('../../components/Composer/ChatComposerNew', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatComposerNew: (props: Record<string, unknown>) => {
    mocks.composerProps = props;
    return null;
  },
  SEND_GUARD_BLOCKED: 'fixture-send-guard-blocked',
}));
vi.mock('../../components/Voice/VoiceModeSurface', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  VoiceModeSurface: (props: Record<string, unknown>) => {
    mocks.voiceSurfaceProps = props;
    return <div data-testid="voice-surface" />;
  },
}));
vi.mock('../../components/Voice/VoiceHeaderLabel', () => ({ VoiceHeaderLabel: () => null }));
vi.mock('../../components/messages/ChatMessageList', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatMessageList: (props: Record<string, unknown>) => {
    mocks.messageListProps = props;
    return <div data-testid="message-list" />;
  },
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', () => ({
  GreetingBanner: () => null,
}));
vi.mock('../../components/ChatStreamRuntimeProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useChatStreamRuntime: () => ({
    sendMessage: vi.fn(),
    stopGeneration: vi.fn(),
    continueGeneration: mocks.continueGeneration,
    resolveToolApproval: vi.fn(),
  }),
}));
vi.mock('../../hooks/use-artifact-cloud-sync', () => ({ useArtifactCloudSync: vi.fn() }));
vi.mock('../../hooks/use-share-conversation', () => ({
  useShareConversation: () => ({
    share: vi.fn(),
    isSharing: false,
    view: null,
    isViewCurrent: () => false,
    workspacePending: false,
    workspaceUnavailable: false,
    inventoryIncomplete: false,
  }),
}));
vi.mock('../../hooks/use-conversation-branches', () => ({
  useConversationBranches: () => ({
    groupsByMessageId: {},
    branchingMessageId: null,
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
  }),
}));
vi.mock('../../hooks/use-keyboard-shortcuts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSettingsModal: () => ({ openSettings: vi.fn() }),
}));
vi.mock('@/features/connectors/stores/tool-permissions-store', async (importOriginal) => {
  const state = { hydrateFromServer: vi.fn() };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useToolPermissionsStore: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

vi.mock('@features/projects', async (importOriginal) => {
  const projectState = {
    projects: [],
    activeProjectId: null,
    setActiveProject: vi.fn(),
    updateProject: vi.fn(),
    removeProject: vi.fn(),
    setProjects: vi.fn(),
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useManagedCloudProjects: () => ({ projects: [], isReady: true }),
    useProjectStore: (selector: (value: typeof projectState) => unknown) => selector(projectState),
    ProjectSettingsDialog: () => null,
  };
});
vi.mock('@features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: {
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    createProject: vi.fn(),
  },
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<ScanModule5>();
  return { ...actual, Sidebar: () => null };
});
vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<ScanModule6>();
  return {
    ...actual,
    LocalByokHandoffDialog: () => null,
    UsageWarningBanner: () => null,
  };
});

vi.mock('@/features/time-focus/TimeFocusReminder', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  TimeFocusReminder: () => null,
}));
vi.mock('../../components/ConversationTitleMenu', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  ConversationTitleMenu: () => null,
}));
vi.mock('../../components/approvals/ApprovalInbox', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ApprovalInbox: () => null,
}));
vi.mock('../../components/work-session/WorkSessionPanel', () => ({
  hasWorkSession: () => false,
  WorkSessionPanel: () => null,
  WorkSessionToggleButton: () => null,
}));
vi.mock('../../components/artifacts/ArtifactsPanel', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ArtifactsPanel: () => null,
  ArtifactsToggleButton: () => null,
}));
vi.mock('../../components/research/ResearchPanel', async (importOriginal) => ({
  ...(await importOriginal()),
  ResearchPanel: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ResearchToggleButton: () => null,
}));
vi.mock('@shared/components/agi/SidebarWordmark', () => ({ SidebarWordmark: () => null }));

import WebChatPage from '../WebChatPage';
import {
  getAutoRoutingProfileTiers,
  getDefaultAutoRoutingProfile,
  getProviderOfferings,
  isAutoModeModelId,
  MODEL_FAMILY_REGISTRY,
  ROUTING_PROFILE_CHOICES,
} from '@agiworkforce/types';
import type { LocalModel } from '@agiworkforce/local-runtime-contract';
import { VOICE_SESSION_EVENT } from '@agiworkforce/unified-chat';
import { useLocalModelSelection } from '@features/desktop-host';
import promotionConfig from '@/config/free-model-promotion.json';
import { FREE_TRIAL_MODEL } from '@/lib/free-trial-config';
import { useChatStore } from '@shared/stores/web-chat-store';
import { AVAILABLE_MODELS, useModelStore } from '@shared/stores/model-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { getProviderModeForModel } from '@shared/lib/provider-mode-for-model';
import { freeQuotaSelection } from '../../lib/free-quota-selection';
import { useFreeTrialStore } from '../../stores/freeTrialStore';
import { useVoiceSessionStore } from '../../stores/voice-session-store';

const workspaceFixture = createWebChatWorkspaceFixture();

const LOCAL_MODEL: LocalModel = {
  id: 'local:ollama/qwen2.5:1.5b',
  serverId: 'ollama',
  serverLabel: 'Ollama',
  name: 'qwen2.5:1.5b',
};

const AUTO_MODEL_ID = getDefaultAutoRoutingProfile().id;
const PINNED_MODEL_ID = AVAILABLE_MODELS.find((model) => !isAutoModeModelId(model.id))?.id;
const PROMOTED_MODEL = Object.values(MODEL_FAMILY_REGISTRY).find(
  (family) =>
    family.provider === promotionConfig.provider && family.tier === promotionConfig.modelFamilyTier,
)?.activeModelId;
const FREE_QUOTA_OFFERING = Object.keys(getProviderOfferings()).find(
  (key) => freeQuotaSelection(key) !== null,
);
const INTELLIGENCE_CHOICES = [
  ...ROUTING_PROFILE_CHOICES,
  ...getAutoRoutingProfileTiers().map((tier) => tier.profile),
];
const UNMANAGED_FREE_OFFERING = Object.keys(getProviderOfferings()).find((key) => {
  const mode = getProviderModeForModel(key);
  return freeQuotaSelection(key) !== null && mode !== 'ManagedGateway' && mode !== 'ManagedNative';
});

function signIn(tier: string): void {
  useBillingStore.setState({
    user: { id: 'fixture-user' },
    subscription: {
      tier: tier as never,
      display_name: tier,
      status: 'active',
      current_period_end: null,
      plan_name: tier,
    },
    initialized: true,
    isLoading: false,
    unauthenticated: false,
    error: null,
  });
}

function openConversation(): void {
  useChatStore.getState().reset();
  useChatStore.getState().setConversations([
    {
      id: CONVERSATION_ID,
      title: 'Local chat',
      createdAt: '2026-11-18T00:00:00.000Z',
      updatedAt: '2026-11-18T00:00:00.000Z',
    },
  ]);
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
    {
      id: '00000000-0000-4000-8000-0000000009c1',
      role: 'user',
      content: 'Summarise this',
      createdAt: '2026-11-18T00:00:01.000Z',
    },
    {
      id: ASSISTANT_MESSAGE_ID,
      role: 'assistant',
      content: 'A partial answer',
      createdAt: '2026-11-18T00:00:02.000Z',
    },
  ]);
}

function spendCloudAllowance(): void {
  useFreeTrialStore.getState().markLimitReached();
  useChatStore.getState().setAccountUsageBlock({
    feature: 'rolling_capacity',
    requiredTier: 'basic',
    reason: 'You have used this window.',
    recoveryAction: 'upgrade',
  });
}

async function renderPage(): Promise<void> {
  render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
  await screen.findByTestId('message-list');
  await waitFor(() => expect(mocks.composerProps).not.toBeNull());
}

function composerUsageBlock(): unknown {
  return mocks.composerProps?.['usageBlock'];
}

function composerFreeTrial(): { enabled: boolean; limitReached: boolean } | undefined {
  return mocks.composerProps?.['freeTrial'] as
    { enabled: boolean; limitReached: boolean } | undefined;
}

beforeEach(() => {
  mocks.composerProps = null;
  mocks.messageListProps = null;
  mocks.voiceSurfaceProps = null;
  mocks.freeModelPromotion = null;
  mocks.openUpgradeDialog.mockClear();
  mocks.continueGeneration.mockClear();
  mocks.updateConversation.mockClear();
  useModelStore.getState().setRoutingProfile('auto');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  );
  openConversation();
});

afterEach(() => {
  useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.exit });
  useLocalModelSelection.getState().select(null);
  useFreeTrialStore.getState().clearLimitReached();
  useChatStore.getState().setAccountUsageBlock(null);
  useModelStore.getState().setRoutingProfile('auto');
  useBillingStore.setState({
    user: null,
    subscription: null,
    initialized: false,
    isLoading: true,
  });
  vi.unstubAllGlobals();
});

describe('cloud usage while a model on this device answers the chat', () => {
  beforeEach(() => {
    signIn('free');
    useModelStore.getState().setSelectedModelId(FREE_TRIAL_MODEL);
    spendCloudAllowance();
  });

  it('leaves the composer able to send locally', async () => {
    useLocalModelSelection.getState().select(LOCAL_MODEL);
    await renderPage();

    expect(composerUsageBlock()).toBeUndefined();
    expect(composerFreeTrial()?.limitReached).toBe(false);
  });

  it('still holds a cloud model to the spent allowance', async () => {
    await renderPage();

    expect(composerUsageBlock()).toBeDefined();
    expect(composerFreeTrial()?.limitReached).toBe(true);
  });

  it('continues a local answer instead of opening the upgrade dialog', async () => {
    useLocalModelSelection.getState().select(LOCAL_MODEL);
    await renderPage();

    await act(async () => {
      await (mocks.messageListProps?.['onContinue'] as (id: string) => Promise<void>)(
        ASSISTANT_MESSAGE_ID,
      );
    });

    expect(mocks.continueGeneration).toHaveBeenCalledWith(ASSISTANT_MESSAGE_ID);
    expect(mocks.openUpgradeDialog).not.toHaveBeenCalled();
  });

  it('opens the upgrade dialog instead of continuing on a cloud model', async () => {
    await renderPage();

    await act(async () => {
      await (mocks.messageListProps?.['onContinue'] as (id: string) => Promise<void>)(
        ASSISTANT_MESSAGE_ID,
      );
    });

    expect(mocks.openUpgradeDialog).toHaveBeenCalledTimes(1);
    expect(mocks.continueGeneration).not.toHaveBeenCalled();
  });
});

describe('where voice mode is offered', () => {
  it('offers voice on the Free default model', async () => {
    signIn('free');
    useModelStore.getState().setSelectedModelId(FREE_TRIAL_MODEL);
    await renderPage();

    expect(mocks.composerProps?.['onEnterVoiceMode']).toEqual(expect.any(Function));
  });

  it('does not offer voice while a model on this device answers the chat', async () => {
    signIn('free');
    useModelStore.getState().setSelectedModelId(FREE_TRIAL_MODEL);
    useLocalModelSelection.getState().select(LOCAL_MODEL);
    await renderPage();

    expect(mocks.composerProps?.['onEnterVoiceMode']).toBeUndefined();
  });

  // llm-guardrail-allow: catalog-derived fixture, runs only while the catalog has a free-quota offering outside the managed routes
  it.skipIf(!UNMANAGED_FREE_OFFERING)(
    'does not offer voice on a free quota model that live voice cannot serve',
    async () => {
      signIn('free');
      useModelStore.getState().setSelectedModelId(UNMANAGED_FREE_OFFERING!);
      await renderPage();

      expect(useModelStore.getState().selectedModelId).toBe(UNMANAGED_FREE_OFFERING);
      expect(mocks.composerProps?.['onEnterVoiceMode']).toBeUndefined();
    },
  );
});

describe('the chat intelligence control in voice settings', () => {
  async function renderVoiceSurface(): Promise<void> {
    await renderPage();
    act(() => {
      useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.enter });
    });
    await screen.findByTestId('voice-surface');
  }

  function chatIntelligence() {
    return mocks.voiceSurfaceProps?.['chatIntelligence'] as
      { choice: string; onChange: (choice: string) => void } | undefined;
  }

  function intelligenceControls(): Array<(choice: string) => unknown> {
    return Object.entries(mocks.voiceSurfaceProps ?? {}).flatMap(([key, value]) => {
      if (!/intelligence/i.test(key)) return [];
      if (typeof value === 'function') return [value as (choice: string) => unknown];
      const onChange = (value as { onChange?: unknown } | undefined)?.onChange;
      return typeof onChange === 'function' ? [onChange as (choice: string) => unknown] : [];
    });
  }

  async function expectFreeChoiceKept(freeChoice: string): Promise<void> {
    signIn('free');
    useModelStore.getState().setSelectedModelId(freeChoice);
    await renderVoiceSurface();

    expect(chatIntelligence()).toBeUndefined();
    await act(async () => {
      for (const control of intelligenceControls()) {
        for (const choice of INTELLIGENCE_CHOICES) control(choice);
      }
    });

    expect(useModelStore.getState().selectedModelId).toBe(freeChoice);
    expect(mocks.updateConversation).not.toHaveBeenCalled();
  }

  it('is not offered on Free, so it never replaces the promoted free model', async () => {
    expect(PROMOTED_MODEL).toBeDefined();
    expect(PROMOTED_MODEL).not.toBe(FREE_TRIAL_MODEL);
    mocks.freeModelPromotion = {
      modelId: PROMOTED_MODEL!,
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    };

    await expectFreeChoiceKept(PROMOTED_MODEL!);
  });

  it('is not offered on Free, so it never replaces a chosen free quota model', async () => {
    expect(FREE_QUOTA_OFFERING).toBeDefined();

    await expectFreeChoiceKept(FREE_QUOTA_OFFERING!);
  });

  it('sets the routing profile on Auto and leaves the chat model alone', async () => {
    signIn('pro');
    useModelStore.getState().setSelectedModelId(AUTO_MODEL_ID);
    await renderVoiceSurface();

    expect(chatIntelligence()?.choice).toBe('auto');
    act(() => {
      chatIntelligence()?.onChange('quality');
    });

    expect(useModelStore.getState().routingProfile).toBe('quality');
    expect(useModelStore.getState().selectedModelId).toBe(AUTO_MODEL_ID);
    expect(mocks.updateConversation).not.toHaveBeenCalled();
    await waitFor(() => expect(chatIntelligence()?.choice).toBe('quality'));
  });

  it('is not offered when the chat is pinned to one model', async () => {
    expect(PINNED_MODEL_ID).toBeDefined();
    signIn('pro');
    useModelStore.getState().setSelectedModelId(PINNED_MODEL_ID!);
    await renderVoiceSurface();

    expect(chatIntelligence()).toBeUndefined();
  });
});
