import { render, waitFor } from '@testing-library/react-native';
import type { InteractiveCard, McpAppCardBody } from '@agiworkforce/types';
import {
  MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE,
  mcpAppPlainResultText,
} from '@agiworkforce/unified-chat/mcp-app';

const mockApiGet = jest.fn();

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
  apiFetch: jest.fn(),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'owner', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(),
}));

import { InteractiveCardBlock } from '../../InteractiveCardBlock';
import * as McpAppCardModule from '../McpAppCard';

const BODY: McpAppCardBody = {
  payloadId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  connectorId: 'weather',
  toolName: 'show_forecast',
  resourceUri: 'ui://weather/forecast',
};

const FALLBACK_TEXT =
  'weather returned an MCP App. Open this message in a compatible web client to interact with it.';

function card(): InteractiveCard {
  return {
    schemaVersion: 1,
    cardId: `mcp-app-${BODY.payloadId}`,
    createdAt: '2026-11-14T12:00:00.000Z',
    fallback: { headline: 'Interactive connector result', text: FALLBACK_TEXT },
    producedBy: { toolCallId: BODY.payloadId, toolName: BODY.toolName },
    recognized: true,
    kind: 'mcp-app.v1',
    body: BODY,
  } as InteractiveCard;
}

function renderCard(cloud = true) {
  return render(
    <InteractiveCardBlock
      cards={[card()]}
      tileBaseUrl="https://app.agi.example/"
      canLoadManagedCloudTiles={cloud}
      messageId="msg"
      conversationId="conv"
    />,
  );
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: BODY.payloadId,
    connectorId: BODY.connectorId,
    resourceUri: BODY.resourceUri,
    toolName: BODY.toolName,
    toolInput: { city: 'Austin' },
    toolResult: {
      content: [
        { type: 'text', text: 'Sunny, 24 C' },
        { type: 'text', text: '<script>alert(1)</script>' },
      ],
    },
    ...overrides,
  };
}

describe('MCP App card on mobile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the stored payload and shows the tool result as plain text, never as a page', async () => {
    mockApiGet.mockResolvedValue(payload());
    const { findByTestId, getByText, queryByText } = renderCard();

    const result = await findByTestId('mcp-app-result');
    expect(result).toHaveTextContent('Sunny, 24 C\n\n<script>alert(1)</script>');
    expect(mockApiGet).toHaveBeenCalledWith(`/api/mcp-apps/payload/${BODY.payloadId}`, {
      accountEpoch: { ownerId: 'owner', epoch: 1 },
    });
    expect(
      getByText("This app can't be displayed here, so the tool's result is shown instead."),
    ).toBeTruthy();
    expect(getByText(MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE)).toBeTruthy();
    expect(result).toHaveTextContent(mcpAppPlainResultText(payload().toolResult));
    expect(queryByText('Interactive connector result')).toBeNull();
  });

  it('reads the plain result and the notice from the shared MCP App rules, not a copy', () => {
    expect(McpAppCardModule).not.toHaveProperty('mcpAppPlainResultText');
    expect(McpAppCardModule).not.toHaveProperty('MCP_APP_PHONE_NOTICE');
  });

  it('falls back to structured content when the result has no text', async () => {
    mockApiGet.mockResolvedValue(
      payload({ toolResult: { content: [], structuredContent: { temp: 24 } } }),
    );
    const { findByTestId } = renderCard();

    expect(await findByTestId('mcp-app-result')).toHaveTextContent('{\n  "temp": 24\n}');
  });

  it('refuses a payload whose identity does not match the card', async () => {
    mockApiGet.mockResolvedValue(payload({ connectorId: 'someone-else' }));
    const { findByText, queryByTestId } = renderCard();

    expect(await findByText('This MCP App result expired or is unavailable.')).toBeTruthy();
    expect(queryByTestId('mcp-app-result')).toBeNull();
  });

  it('says the result is unavailable when the payload request fails', async () => {
    mockApiGet.mockRejectedValue(new Error('404'));
    const { findByText } = renderCard();

    expect(await findByText('This MCP App result expired or is unavailable.')).toBeTruthy();
  });

  it('asks nothing of the server outside Managed Cloud and shows the card text', async () => {
    const { getByText } = renderCard(false);

    expect(getByText(FALLBACK_TEXT)).toBeTruthy();
    await waitFor(() => expect(mockApiGet).not.toHaveBeenCalled());
  });
});
