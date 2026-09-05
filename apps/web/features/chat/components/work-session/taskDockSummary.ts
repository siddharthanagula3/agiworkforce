import type { AgentActivityEntry, AgentActivityState } from '@agiworkforce/client-runtime';
import type { CloudWorkMode } from '@agiworkforce/types';
import type { Message } from '@shared/stores/web-chat-store';
import type { Artifact } from '../../stores/artifacts-store';
import {
  collectMessageResearchSources,
  dedupeResearchSources,
  sourceDisplayHost,
  sourceFaviconUrl,
} from '../../utils/research-sources';
import { humanizeToolName } from '../messages/ToolTimeline';

export type TaskDockStepStatus =
  | 'pending'
  | 'running'
  | 'awaiting-approval'
  | 'completed'
  | 'partial'
  | 'paused'
  | 'failed'
  | 'cancelled';

export type TaskDockRunStatus = TaskDockStepStatus | 'idle';

export interface TaskDockStep {
  id: string;
  label: string;
  detail?: string;
  status: TaskDockStepStatus;
}

export interface TaskDockSource {
  id: string;
  url: string;
  title: string;
  host: string;
  faviconUrl?: string;
}

export interface TaskDockSourceGroup {
  id: string;
  label: string;
  sources: TaskDockSource[];
}

export interface TaskDockOutput {
  id: string;
  name: string;
  mimeType?: string;
  byteCount?: number;
  uri?: string;
  artifactId?: string;
  artifactContent?: string;
  artifactLanguage?: string;
  artifactType?: string;
}

export type TaskDockContextKind = 'connector' | 'skill' | 'project' | 'attachment' | 'path';

export interface TaskDockContextItem {
  id: string;
  label: string;
  detail?: string;
  kind: TaskDockContextKind;
  mark: string;
}

export interface TaskDockSummary {
  status: TaskDockRunStatus;
  title: string | null;
  activity: AgentActivityState | null;
  workMode: CloudWorkMode | undefined;
  steps: TaskDockStep[];
  sources: TaskDockSourceGroup[];
  outputs: TaskDockOutput[];
  context: TaskDockContextItem[];
}

export interface TaskDockInputs {
  messages: Message[];
  artifacts: Artifact[];
  projectName?: string | null;
}

/** Mirrors AGIWORK_GOAL_PROGRESS_ID; the constant itself lives behind `server-only`. */
const AGIWORK_GOAL_PROGRESS_ID = 'agiwork:goal';

const AGI_WORK_MODE: CloudWorkMode = 'agiwork';

const PATH_KEYS = new Set(['path', 'file', 'filePath', 'filepath', 'directory', 'folder', 'cwd']);

const CONNECTOR_SUMMARY_PATTERN = /^(?:using|review)\s+(.+?)\s+(?:connector|tool|action)$/i;
const MCP_QUALIFIED_NAME_PATTERN = /^mcp__([^_]+(?:_[^_]+)*?)__/i;
const OPAQUE_MCP_SERVER_PATTERN = /^custom-/i;
const GENERIC_CONNECTOR_LABELS = new Set(['connector', 'mcp', 'tool', 'action']);
const IDENTIFIER_SEPARATOR_PATTERN = /[_-]+/g;
const WORD_START_PATTERN = /\b\w/g;
const ALPHANUMERIC_PATTERN = /[\p{L}\p{N}]/u;

const SKILL_NAME_KEYS = ['name', 'skill', 'skill_name'] as const;

const FALLBACK_SOURCE_GROUP_LABEL = 'Web search';
const FALLBACK_CONTEXT_MARK = '?';

export function hasWorkSession(
  messages: Message[],
  activeWorkMode: CloudWorkMode | undefined,
): boolean {
  return (
    activeWorkMode === AGI_WORK_MODE ||
    messages.some(
      (message) =>
        message.metadata?.sendReplay?.workMode === AGI_WORK_MODE ||
        message.metadata?.agentActivity !== undefined,
    )
  );
}

/**
 * Identifies the run the dock's open/closed verdict belongs to. The newest turn
 * that reported agent activity is the current run; a conversation with none has
 * no run to open the dock for.
 */
export function taskDockRunKey(
  conversationId: string | null | undefined,
  messages: readonly Message[],
): string | null {
  if (!conversationId) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const activity = messages[index]?.metadata?.agentActivity;
    if (activity) return `${conversationId}:${activity.turnId}`;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(IDENTIFIER_SEPARATOR_PATTERN, ' ')
    .replace(WORD_START_PATTERN, (letter) => letter.toUpperCase());
}

function markFor(label: string): string {
  return label.match(ALPHANUMERIC_PATTERN)?.[0]?.toUpperCase() ?? FALLBACK_CONTEXT_MARK;
}

/**
 * A custom connector's qualified tool name is opaque (`mcp__custom-<id>__<tool>`),
 * so the user's chosen display name only reaches the client inside the summary
 * the server builds ("Using <Name> connector"). The qualified name is the
 * fallback, and an opaque server id yields no name rather than an id.
 */
export function connectorDisplayName(name: string, summary: string): string | undefined {
  const fromSummary = CONNECTOR_SUMMARY_PATTERN.exec(summary.trim())?.[1]?.trim();
  if (fromSummary && !GENERIC_CONNECTOR_LABELS.has(fromSummary.toLowerCase())) return fromSummary;
  const serverId = MCP_QUALIFIED_NAME_PATTERN.exec(name)?.[1];
  if (!serverId || OPAQUE_MCP_SERVER_PATTERN.test(serverId)) return undefined;
  return humanizeIdentifier(serverId);
}

export function skillDisplayName(input: unknown, summary: string): string {
  const record = asRecord(input);
  for (const key of SKILL_NAME_KEYS) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) return humanizeIdentifier(value.trim());
  }
  return summary;
}

function extractPaths(input: unknown): string[] {
  const record = asRecord(input);
  if (!record) return [];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!PATH_KEYS.has(key) || typeof value !== 'string' || !value.trim()) continue;
    paths.push(value.trim());
  }
  return paths;
}

function fetchedUrl(input: unknown): string | undefined {
  const value = asRecord(input)?.['url'];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stepFromActivity(messageId: string, entry: AgentActivityEntry): TaskDockStep | null {
  if (entry.kind === 'progress') {
    return {
      id: `${messageId}:${entry.id}`,
      label: entry.summary,
      ...(entry.detail ? { detail: entry.detail } : {}),
      status: entry.status,
    };
  }
  if (entry.kind === 'tool') {
    return {
      id: `${messageId}:${entry.id}`,
      label: entry.summary || humanizeToolName(entry.name),
      ...(entry.error && entry.error !== entry.summary ? { detail: entry.error } : {}),
      status: entry.status,
    };
  }
  if (entry.kind === 'error') {
    return {
      id: `${messageId}:${entry.id}`,
      label: entry.message,
      ...(entry.code ? { detail: entry.code } : {}),
      status: 'failed',
    };
  }
  return null;
}

function legacyStepStatus(status: string): TaskDockStepStatus {
  if (status === 'awaiting_approval') return 'awaiting-approval';
  if (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'pending';
}

function outputFromArtifact(artifact: Artifact): TaskDockOutput {
  const generatedFile = artifact.generatedFile;
  return {
    id: generatedFile ? `file:${generatedFile.id}` : `artifact:${artifact.id}`,
    name: generatedFile?.fileName ?? artifact.title,
    ...(generatedFile?.mimeType ? { mimeType: generatedFile.mimeType } : {}),
    ...(generatedFile?.byteCount !== undefined ? { byteCount: generatedFile.byteCount } : {}),
    ...(generatedFile?.uri ? { uri: generatedFile.uri } : {}),
    artifactId: artifact.id,
    artifactContent: artifact.content,
    ...(artifact.language ? { artifactLanguage: artifact.language } : {}),
    ...(artifact.type ? { artifactType: artifact.type } : {}),
  };
}

function addOutput(outputs: Map<string, TaskDockOutput>, output: TaskDockOutput): void {
  const existingWithUri = output.uri
    ? Array.from(outputs.values()).find((candidate) => candidate.uri === output.uri)
    : undefined;
  if (existingWithUri) {
    outputs.set(existingWithUri.id, {
      ...existingWithUri,
      ...output,
      id: existingWithUri.id,
      artifactId: output.artifactId ?? existingWithUri.artifactId,
    });
    return;
  }
  const existing = outputs.get(output.id);
  outputs.set(output.id, existing ? { ...existing, ...output } : output);
}

class SourceCollector {
  private readonly groups = new Map<string, TaskDockSourceGroup>();
  private readonly seenUrls = new Set<string>();

  add(groupId: string, label: string, entries: ReadonlyArray<{ url: string; title?: string }>) {
    for (const entry of entries) {
      const url = entry.url?.trim();
      if (!url) continue;
      const key = url.toLowerCase();
      if (this.seenUrls.has(key)) continue;
      this.seenUrls.add(key);
      const host = sourceDisplayHost(url);
      const faviconUrl = sourceFaviconUrl(url);
      let group = this.groups.get(groupId);
      if (!group) {
        group = { id: groupId, label, sources: [] };
        this.groups.set(groupId, group);
      }
      group.sources.push({
        id: `${groupId}:${key}`,
        url,
        title: entry.title?.trim() || host,
        host,
        ...(faviconUrl ? { faviconUrl } : {}),
      });
    }
  }

  groupList(): TaskDockSourceGroup[] {
    return Array.from(this.groups.values()).filter((group) => group.sources.length > 0);
  }
}

function collectSources(collector: SourceCollector, message: Message): void {
  const activity = message.metadata?.agentActivity;
  for (const entry of activity?.entries ?? []) {
    if (entry.kind === 'sources') {
      collector.add(
        `${message.id}:${entry.id}`,
        entry.query?.trim() || FALLBACK_SOURCE_GROUP_LABEL,
        entry.sources,
      );
      continue;
    }
    if (entry.kind !== 'tool') continue;
    if (entry.sources?.length) {
      collector.add(
        `${message.id}:${entry.id}`,
        entry.query?.trim() || entry.summary || FALLBACK_SOURCE_GROUP_LABEL,
        entry.sources,
      );
      continue;
    }
    if (entry.category !== 'web-fetch') continue;
    const url = fetchedUrl(entry.input);
    if (url) collector.add(`${message.id}:${entry.id}`, entry.summary, [{ url }]);
  }

  const { searchSources, searchQuery } = collectMessageResearchSources(message.metadata);
  if (searchSources.length > 0) {
    collector.add(
      `${message.id}:citations`,
      searchQuery?.trim() || FALLBACK_SOURCE_GROUP_LABEL,
      dedupeResearchSources(searchSources),
    );
  }
}

export function buildTaskDockSummary({
  messages,
  artifacts,
  projectName,
}: TaskDockInputs): TaskDockSummary {
  const steps: TaskDockStep[] = [];
  const outputs = new Map<string, TaskDockOutput>();
  const context = new Map<string, TaskDockContextItem>();
  const sourceCollector = new SourceCollector();
  let status: TaskDockRunStatus = 'idle';
  let title: string | null = null;
  let activity: AgentActivityState | null = null;
  let workMode: CloudWorkMode | undefined;

  if (projectName?.trim()) {
    context.set('project', {
      id: 'project',
      label: projectName.trim(),
      detail: 'Project',
      kind: 'project',
      mark: markFor(projectName.trim()),
    });
  }

  for (const artifact of artifacts) addOutput(outputs, outputFromArtifact(artifact));

  for (const message of messages) {
    const replayWorkMode = message.metadata?.sendReplay?.workMode;
    if (replayWorkMode) workMode = replayWorkMode;

    for (const attachment of [
      ...(message.attachments ?? []),
      ...(message.metadata?.attachments ?? []),
    ]) {
      const key = attachment.assetId ?? attachment.id;
      context.set(`attachment:${key}`, {
        id: `attachment:${key}`,
        label: attachment.name,
        ...((attachment.mimeType ?? attachment.type)
          ? { detail: attachment.mimeType ?? attachment.type }
          : {}),
        kind: 'attachment',
        mark: markFor(attachment.name),
      });
    }

    collectSources(sourceCollector, message);

    const messageActivity = message.metadata?.agentActivity;
    if (messageActivity) {
      status = messageActivity.status;
      activity = messageActivity;
      for (const entry of messageActivity.entries) {
        if (entry.kind === 'progress' && entry.progressId === AGIWORK_GOAL_PROGRESS_ID) {
          if (entry.summary.trim()) title = entry.summary.trim();
        }
        const step = stepFromActivity(message.id, entry);
        if (step) steps.push(step);

        if (entry.kind === 'artifact') {
          addOutput(outputs, {
            id: `activity:${message.id}:${entry.artifactId}`,
            name: entry.name,
            mimeType: entry.mimeType,
            ...(entry.sizeBytes !== undefined ? { byteCount: entry.sizeBytes } : {}),
            uri: entry.uri,
            artifactId: entry.artifactId,
          });
          continue;
        }
        if (entry.kind !== 'tool') continue;

        if (entry.category === 'connector' || entry.category === 'mcp') {
          const label = connectorDisplayName(entry.name, entry.summary);
          if (label) {
            context.set(`connector:${label}`, {
              id: `connector:${label}`,
              label,
              detail: 'Connector',
              kind: 'connector',
              mark: markFor(label),
            });
          }
        } else if (entry.category === 'skill') {
          const label = skillDisplayName(entry.input, entry.summary);
          context.set(`skill:${label}`, {
            id: `skill:${label}`,
            label,
            detail: 'Skill',
            kind: 'skill',
            mark: markFor(label),
          });
        }

        for (const path of extractPaths(entry.input)) {
          context.set(`path:${path}`, {
            id: `path:${path}`,
            label: path,
            detail: 'Referenced by task',
            kind: 'path',
            mark: markFor(path),
          });
        }
      }
    } else {
      for (const tool of message.metadata?.tools ?? []) {
        steps.push({
          id: `${message.id}:legacy:${tool.toolCallId ?? tool.id ?? tool.name}`,
          label: humanizeToolName(tool.name, tool.args, tool.parameters),
          ...(tool.error ? { detail: tool.error } : {}),
          status: legacyStepStatus(tool.status),
        });
        for (const path of extractPaths(tool.parameters ?? tool.rawArgs)) {
          context.set(`path:${path}`, {
            id: `path:${path}`,
            label: path,
            detail: 'Referenced by task',
            kind: 'path',
            mark: markFor(path),
          });
        }
      }
    }

    for (const file of message.metadata?.generatedFiles ?? []) {
      addOutput(outputs, {
        id: `file:${file.id}`,
        name: file.fileName,
        mimeType: file.mimeType,
        ...(file.byteCount !== undefined ? { byteCount: file.byteCount } : {}),
        uri: file.uri,
      });
    }

    const generated = message.metadata?.generatedFile;
    if (generated) {
      addOutput(outputs, {
        id: `file:${generated.id}`,
        name: generated.fileName,
        mimeType: generated.mimeType,
        ...(generated.byteCount !== undefined ? { byteCount: generated.byteCount } : {}),
        uri: generated.uri,
      });
    }
  }

  return {
    status,
    title,
    activity,
    workMode,
    steps,
    sources: sourceCollector.groupList(),
    outputs: Array.from(outputs.values()),
    context: Array.from(context.values()),
  };
}
