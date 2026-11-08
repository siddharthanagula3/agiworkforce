import type { SidePanelMessageAttachment } from '../side-panel/chat-state';
import {
  createManagedCloudChatClient,
  MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
  managedCloudMetadataLength,
  durableAttachmentDescriptors,
  type GeneratedFileWire,
  type ManagedCloudChatClient,
  type ManagedCloudChatFetch,
} from '@agiworkforce/cloud-contracts';
import type { InteractiveCard } from '@agiworkforce/types';
import { FREE_TRIAL_GATEWAY, getManagedCloudAuthContext } from './freeTrialClient';
import { sameManagedCloudOwner, type ManagedCloudOwner } from './managedCloudAuthority';
import { platformRequestHeaders } from '../../platformHeaders';

export class ManagedCloudOwnerChangedError extends Error {
  constructor(message = 'The Managed Cloud account changed while this request was in progress.') {
    super(message);
    this.name = 'ManagedCloudOwnerChangedError';
  }
}

export class ManagedCloudSignedOutError extends Error {
  constructor(message = 'Managed Cloud session is not available.') {
    super(message);
    this.name = 'ManagedCloudSignedOutError';
  }
}

export function createExtensionCloudChatClient(
  expectedOwner: ManagedCloudOwner,
  options: { isCurrent?: () => boolean; fetchImpl?: ManagedCloudChatFetch } = {},
): ManagedCloudChatClient {
  return createManagedCloudChatClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getAuthToken: async () => {
      if (options.isCurrent?.() === false) throw new ManagedCloudOwnerChangedError();
      const context = await getManagedCloudAuthContext();
      if (!context) throw new ManagedCloudSignedOutError();
      if (!sameManagedCloudOwner(context.owner, expectedOwner) || options.isCurrent?.() === false) {
        throw new ManagedCloudOwnerChangedError();
      }
      return context.token;
    },
    decorateMutationHeaders: (headers) => ({
      ...headers,
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    }),
    fetchImpl: async (input, init) => {
      if (options.isCurrent?.() === false) throw new ManagedCloudOwnerChangedError();
      const response = await (options.fetchImpl ?? fetch)(input, init);
      if (options.isCurrent?.() === false) {
        await response.body?.cancel().catch(() => undefined);
        throw new ManagedCloudOwnerChangedError();
      }
      return response;
    },
  });
}

export interface ExtensionCloudMessageMetadataInput {
  localConversationId: string;
  runtime: 'managed-cloud';
  managedQuickMode?: boolean;
  cloudAgentRunId?: string;
  model?: string;
  provider?: string;
  generatedFiles?: GeneratedFileWire[];
  interactiveCards?: InteractiveCard[];
  attachments?: readonly SidePanelMessageAttachment[];
  error?: boolean;
  agiWorkPlanDeclined?: boolean;
}

export function buildExtensionCloudMessageMetadata(
  input: ExtensionCloudMessageMetadataInput,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    surface: 'chrome',
    runtime: input.runtime,
    localConversationId: input.localConversationId.slice(0, 200),
    ...(input.managedQuickMode ? { managedQuickMode: true } : {}),
    ...(input.cloudAgentRunId ? { cloudAgentRunId: input.cloudAgentRunId.slice(0, 200) } : {}),
    ...(input.model ? { model: input.model.slice(0, 200) } : {}),
    ...(input.provider ? { provider: input.provider.slice(0, 100) } : {}),
    ...(input.error ? { error: true } : {}),
    ...(input.agiWorkPlanDeclined ? { agiWorkPlanDeclined: true } : {}),
  };

  const appendIfBounded = (
    field: 'generatedFiles' | 'interactiveCards' | 'attachments',
    value: unknown,
  ): boolean => {
    const current = Array.isArray(metadata[field]) ? (metadata[field] as unknown[]) : [];
    const candidate = { ...metadata, [field]: [...current, value] };
    if (managedCloudMetadataLength(candidate) > MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH)
      return false;
    metadata[field] = candidate[field];
    return true;
  };

  if (input.attachments !== undefined) {
    metadata['attachments'] = [];
    const attachments = durableAttachmentDescriptors(
      input.attachments.map((attachment) => ({
        id: attachment.assetId ?? '',
        assetId: attachment.assetId,
        type: attachment.kind,
        name: attachment.name,
        mimeType: attachment.mimeType,
      })),
    );
    for (const attachment of attachments ?? []) {
      if (!appendIfBounded('attachments', attachment)) break;
    }
  }

  for (const file of input.generatedFiles ?? []) {
    if (
      !appendIfBounded('generatedFiles', {
        id: file.id,
        fileName: file.file_name,
        mimeType: file.mime_type,
        uri: file.uri,
        byteCount: file.byte_count,
        kind: file.kind,
        ...(file.checksum_sha256 ? { checksumSha256: file.checksum_sha256 } : {}),
        surface: file.surface,
        previewable: file.previewable,
      })
    ) {
      break;
    }
  }

  for (const card of input.interactiveCards ?? []) {
    if (!appendIfBounded('interactiveCards', card)) break;
  }

  return metadata;
}
