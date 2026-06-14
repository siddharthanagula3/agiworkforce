jest.mock('@agiworkforce/utils/signaling', () => ({
  SignalingClient: jest.fn(),
}));

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(() => new Uint8Array(16)),
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(16)),
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/companionNotifications', () => ({
  notifyCompanionMessage: jest.fn(),
}));

import {
  buildRelayControlMessage,
  ingestApprovalRequestPayload,
  parseApprovalRequest,
  useConnectionStore,
} from '../stores/connectionStore';
import { useAgentStore } from '../stores/agentStore';
import { notifyCompanionMessage } from '../services/companionNotifications';
import { SignalingClient } from '@agiworkforce/utils/signaling';

const mockNotifyCompanionMessage = notifyCompanionMessage as jest.Mock;
const mockSignalingClient = SignalingClient as unknown as jest.Mock;

describe('Wave 1 control relay fixes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAgentStore.setState({
      agents: [],
      selectedAgentId: null,
      pendingApprovals: [],
    });
  });

  it('normalizes legacy mobile actions to the signaling relay allowlist', () => {
    expect(buildRelayControlMessage('dispatch_task', { text: 'Run it' }).relay).toMatchObject({
      action: 'dispatch_request',
      data: { action: 'dispatch_request', text: 'Run it' },
    });
    expect(buildRelayControlMessage('ping', { timestamp: 123 }).relay).toMatchObject({
      action: 'heartbeat',
      data: { action: 'heartbeat', timestamp: 123 },
    });
    expect(buildRelayControlMessage('emergency_stop').relay).toMatchObject({
      action: 'cancel',
      data: { action: 'cancel', scope: 'all' },
    });
  });

  it('validates relay-shaped approval_request payloads', () => {
    const approval = parseApprovalRequest({
      action: 'approval_request',
      data: {
        requestId: 'req-1',
        toolName: 'delete_file',
        description: 'Delete /tmp/demo.txt',
        riskLevel: 'high',
        type: 'file_delete',
      },
    });

    expect(approval).toEqual({
      id: 'req-1',
      toolName: 'delete_file',
      description: 'Delete /tmp/demo.txt',
      riskLevel: 'high',
      type: 'file_delete',
      status: 'pending',
    });
  });

  it('populates pendingApprovals and dedupes by request id', () => {
    const first = ingestApprovalRequestPayload({
      action: 'approval_request',
      data: {
        requestId: 'req-2',
        toolName: 'run_command',
        description: 'Run npm test',
        riskLevel: 'medium',
        type: 'command',
      },
    });
    const second = ingestApprovalRequestPayload({
      action: 'approval_request',
      data: {
        requestId: 'req-2',
        toolName: 'run_command',
        description: 'Run pnpm test',
        riskLevel: 'medium',
        type: 'command',
      },
    });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(useAgentStore.getState().pendingApprovals).toHaveLength(1);
    expect(useAgentStore.getState().pendingApprovals[0]).toMatchObject({
      id: 'req-2',
      description: 'Run pnpm test',
      status: 'pending',
    });
    expect(mockNotifyCompanionMessage).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed approval_request payloads before touching state', () => {
    const accepted = ingestApprovalRequestPayload({
      action: 'approval_request',
      data: {
        requestId: 'req-bad',
        toolName: 'run_command',
        description: 'Run command',
        riskLevel: 'critical',
        type: 'command',
      },
    });

    expect(accepted).toBe(false);
    expect(useAgentStore.getState().pendingApprovals).toHaveLength(0);
    expect(mockNotifyCompanionMessage).not.toHaveBeenCalled();
  });

  it('does not open a companion connection while Dispatch is feature-gated', () => {
    useConnectionStore.setState({
      status: 'disconnected',
      pairingCode: null,
      pairToken: null,
      connectionQuality: 'disconnected',
    });

    useConnectionStore.getState().connect(`agiw:ABCDEF123456:${'a'.repeat(64)}`);

    expect(mockSignalingClient).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().status).toBe('disconnected');
    expect(useConnectionStore.getState().pairingCode).toBeNull();
  });
});
