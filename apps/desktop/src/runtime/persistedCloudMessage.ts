import type {
  Artifact,
  Attachment,
  ChatMessage,
  GeneratedFileEntry,
  ToolCall,
  WebSearchResult,
} from '@agiworkforce/unified-chat';
import type { ManagedCloudChatAttachment } from '@agiworkforce/cloud-contracts';
import { mapPersistedCloudApprovalToolCalls } from './cloudToolApproval';

export const EMPTY_ASSISTANT_CONTENT_PLACEHOLDER = String.fromCharCode(0x200b);

export interface PersistedCloudMessageInput {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  model?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function resolveOwnedCloudFileUri(uri: string, apiBaseUrl: string): string | undefined {
  try {
    const browserOrigin =
      typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : undefined;
    const base = apiBaseUrl || browserOrigin;
    if (!base) return undefined;
    const resolved = new URL(uri, base);
    if (resolved.origin !== new URL(base).origin || !resolved.pathname.startsWith('/api/files/')) {
      return undefined;
    }
    return apiBaseUrl
      ? resolved.toString()
      : `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return undefined;
  }
}

function readPersistedToolCalls(value: unknown): ToolCall[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const calls: ToolCall[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item['id'] !== 'string' || typeof item['name'] !== 'string') {
      continue;
    }
    const status = item['status'];
    const validStatus =
      status === 'pending' ||
      status === 'running' ||
      status === 'completed' ||
      status === 'failed' ||
      status === 'awaiting_approval'
        ? status
        : undefined;
    calls.push({
      id: item['id'],
      name: item['name'],
      args: isRecord(item['args']) ? item['args'] : {},
      ...(typeof item['result'] === 'string' ? { result: item['result'] } : {}),
      ...(typeof item['error'] === 'string' ? { error: item['error'] } : {}),
      ...(validStatus ? { status: validStatus } : {}),
      ...(typeof item['requiresApproval'] === 'boolean'
        ? { requiresApproval: item['requiresApproval'] }
        : {}),
      ...(item['approvalDecision'] === 'approved' || item['approvalDecision'] === 'rejected'
        ? { approvalDecision: item['approvalDecision'] }
        : {}),
    });
  }
  return calls.length > 0 ? calls : undefined;
}

function readPersistedGeneratedFiles(
  value: unknown,
  apiBaseUrl: string,
): GeneratedFileEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const files: GeneratedFileEntry[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      typeof item['fileName'] !== 'string' ||
      typeof item['mimeType'] !== 'string' ||
      typeof item['uri'] !== 'string' ||
      typeof item['byteCount'] !== 'number' ||
      typeof item['kind'] !== 'string'
    ) {
      continue;
    }
    const uri = resolveOwnedCloudFileUri(item['uri'], apiBaseUrl);
    if (!uri) continue;
    files.push({
      id: item['id'],
      fileName: item['fileName'],
      mimeType: item['mimeType'],
      uri,
      byteCount: item['byteCount'],
      kind: item['kind'],
      ...(typeof item['checksumSha256'] === 'string'
        ? { checksumSha256: item['checksumSha256'] }
        : {}),
      ...(item['surface'] === 'artifact' || item['surface'] === 'file'
        ? { surface: item['surface'] }
        : {}),
      ...(typeof item['previewable'] === 'boolean' ? { previewable: item['previewable'] } : {}),
    });
  }
  return files.length > 0 ? files : undefined;
}

function readPersistedArtifacts(value: unknown): Artifact[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const artifactTypes = new Set<Artifact['type']>([
    'code',
    'react',
    'component',
    'chart',
    'diagram',
    'table',
    'mermaid',
    'spreadsheet',
    'presentation',
    'html',
    'image',
    'video',
    'audio',
    'music',
    'search',
    'document',
    'markdown',
    'json',
    'csv',
    'svg',
    'email',
    'research',
  ]);
  const artifacts: Artifact[] = [];
  for (const item of value.slice(0, 50)) {
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      typeof item['type'] !== 'string' ||
      !artifactTypes.has(item['type'] as Artifact['type']) ||
      typeof item['content'] !== 'string'
    ) {
      continue;
    }
    artifacts.push({
      id: item['id'],
      type: item['type'] as Artifact['type'],
      content: item['content'],
      ...(typeof item['title'] === 'string' ? { title: item['title'] } : {}),
      ...(typeof item['language'] === 'string' ? { language: item['language'] } : {}),
      ...(typeof item['version'] === 'number' && Number.isInteger(item['version'])
        ? { version: item['version'] }
        : {}),
      ...(typeof item['createdAt'] === 'string' ? { createdAt: item['createdAt'] } : {}),
      ...(typeof item['updatedAt'] === 'string' ? { updatedAt: item['updatedAt'] } : {}),
      ...(typeof item['conversationId'] === 'string'
        ? { conversationId: item['conversationId'] }
        : {}),
      ...(typeof item['messageId'] === 'string' ? { messageId: item['messageId'] } : {}),
      ...(isRecord(item['metadata']) ? { metadata: item['metadata'] } : {}),
    });
  }
  return artifacts.length > 0 ? artifacts : undefined;
}

function readPersistedSearches(value: unknown): WebSearchResult[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const searches: WebSearchResult[] = [];
  for (const item of value.slice(0, 50)) {
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      typeof item['query'] !== 'string' ||
      !Array.isArray(item['results'])
    ) {
      continue;
    }
    const results: WebSearchResult['results'] = [];
    for (const result of item['results'].slice(0, 50)) {
      if (
        !isRecord(result) ||
        typeof result['url'] !== 'string' ||
        typeof result['title'] !== 'string'
      ) {
        continue;
      }
      let url: URL;
      try {
        url = new URL(result['url']);
      } catch {
        continue;
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      results.push({
        url: url.toString(),
        title: result['title'],
        ...(typeof result['snippet'] === 'string' ? { snippet: result['snippet'] } : {}),
        ...(typeof result['faviconUrl'] === 'string' ? { faviconUrl: result['faviconUrl'] } : {}),
        ...(typeof result['domain'] === 'string' ? { domain: result['domain'] } : {}),
      });
    }
    const status = item['status'];
    searches.push({
      id: item['id'],
      query: item['query'],
      results,
      resultCount:
        typeof item['resultCount'] === 'number' &&
        Number.isInteger(item['resultCount']) &&
        item['resultCount'] >= 0
          ? item['resultCount']
          : results.length,
      ...(status === 'pending' ||
      status === 'running' ||
      status === 'completed' ||
      status === 'failed'
        ? { status }
        : {}),
    });
  }
  return searches.length > 0 ? searches : undefined;
}

function readPersistedAttachments(value: unknown, apiBaseUrl: string): Attachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments: Attachment[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const assetId =
      typeof item['assetId'] === 'string'
        ? item['assetId']
        : typeof item['id'] === 'string'
          ? item['id']
          : undefined;
    if (!assetId || typeof item['name'] !== 'string') continue;
    const attachmentUrl =
      typeof item['url'] === 'string'
        ? resolveOwnedCloudFileUri(item['url'], apiBaseUrl)
        : undefined;
    attachments.push({
      id: assetId,
      name: item['name'],
      type:
        item['type'] === 'image' || item['type'] === 'file'
          ? item['type']
          : typeof item['mimeType'] === 'string'
            ? item['mimeType']
            : 'file',
      ...(attachmentUrl ? { url: attachmentUrl } : {}),
      ...(typeof item['size'] === 'number'
        ? { size: item['size'] }
        : typeof item['byteCount'] === 'number'
          ? { size: item['byteCount'] }
          : {}),
    });
  }
  return attachments.length > 0 ? attachments : undefined;
}

export function persistedAttachmentMetadata(attachments: ManagedCloudChatAttachment[]) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    assetId: attachment.id,
    type: attachment.type,
    name: attachment.name,
    size: attachment.byteCount,
    mimeType: attachment.mimeType,
    url: attachment.url,
  }));
}

export function mapPersistedCloudMessage(
  raw: PersistedCloudMessageInput,
  apiBaseUrl: string,
): ChatMessage {
  const approvalToolCalls = mapPersistedCloudApprovalToolCalls(raw.metadata);
  const persistedToolCalls = readPersistedToolCalls(raw.metadata?.['toolCalls']);
  const thinking =
    typeof raw.metadata?.['thinking'] === 'string' ? raw.metadata['thinking'] : undefined;
  const generatedFiles = readPersistedGeneratedFiles(raw.metadata?.['generatedFiles'], apiBaseUrl);
  const artifacts = readPersistedArtifacts(raw.metadata?.['artifacts']);
  const webSearchResults = readPersistedSearches(raw.metadata?.['webSearchResults']);
  const attachments = readPersistedAttachments(raw.metadata?.['attachments'], apiBaseUrl);
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    role: raw.role,
    content: raw.content === EMPTY_ASSISTANT_CONTENT_PLACEHOLDER ? '' : raw.content,
    createdAt: raw.createdAt,
    ...(raw.model ? { model: raw.model } : {}),
    ...(raw.provider ? { provider: raw.provider } : {}),
    ...(raw.metadata ? { metadata: raw.metadata } : {}),
    ...(thinking
      ? {
          thinking,
          thinkingBlock: {
            id: `thinking-${raw.id}`,
            steps: [
              { id: `thinking-step-${raw.id}`, type: 'thinking', content: thinking },
              { id: `thinking-done-${raw.id}`, type: 'done', content: 'Done' },
            ],
            summary: 'Thought process',
            collapsed: true,
          },
        }
      : {}),
    ...(persistedToolCalls || approvalToolCalls
      ? { toolCalls: persistedToolCalls ?? approvalToolCalls }
      : {}),
    ...(generatedFiles ? { generatedFiles } : {}),
    ...(artifacts ? { artifacts } : {}),
    ...(webSearchResults ? { webSearchResults } : {}),
    ...(attachments ? { attachments } : {}),
  };
}
