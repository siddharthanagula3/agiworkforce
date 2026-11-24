import { MAX_VALUE_LENGTH, MAX_SELECTOR_LENGTH, sanitizePageText } from '../../background/policy';
import { UUID_PATTERN } from '../../lib/uuid';
import {
  normalizeManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';
import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';
import { MAX_ELEMENT_NAME_CHARS } from '../content/pageElements';
import { readPageDocument } from './documentBridge';
import type { EditableSelectionFrame } from '../../types';

export interface EditableSelectionTarget {
  id: string;
  tabId: number;
  url: string;
  documentId: string;
  label: string;
  selectedText: string;
  owner: ManagedCloudOwner;
  frame?: EditableSelectionFrame;
}

export function parseEditableSelectionFrame(
  value: unknown,
  pageUrl: string,
): EditableSelectionFrame | null {
  if (!value || typeof value !== 'object') return null;
  const { id, url } = value as Record<string, unknown>;
  if (
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof url !== 'string' ||
    url.length > MAX_VALUE_LENGTH
  )
    return null;
  const origin = normalizeApprovedSiteOrigin(url);
  if (!origin || origin !== normalizeApprovedSiteOrigin(pageUrl)) return null;
  const parsed = new URL(url);
  return parsed.username || parsed.password ? null : { id, url };
}

export function readEditableSelectionDocument({
  tabId,
  url,
  documentId,
  frame,
}: Pick<EditableSelectionTarget, 'tabId' | 'url' | 'frame'> & { documentId?: string }) {
  return readPageDocument(
    tabId,
    frame?.url ?? url,
    documentId,
    frame ? { id: frame.id, topUrl: url } : undefined,
  );
}

export function parseEditableSelectionTarget(value: unknown): EditableSelectionTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const target = value as Record<string, unknown>;
  const owner = normalizeManagedCloudOwner(target['owner']);
  if (
    !owner ||
    typeof target['id'] !== 'string' ||
    !UUID_PATTERN.test(target['id']) ||
    typeof target['tabId'] !== 'number' ||
    !Number.isSafeInteger(target['tabId']) ||
    target['tabId'] < 0 ||
    typeof target['url'] !== 'string' ||
    target['url'].length > MAX_VALUE_LENGTH ||
    !normalizeApprovedSiteOrigin(target['url']) ||
    typeof target['documentId'] !== 'string' ||
    !target['documentId'] ||
    target['documentId'].length > MAX_SELECTOR_LENGTH ||
    typeof target['label'] !== 'string' ||
    target['label'].length > MAX_ELEMENT_NAME_CHARS ||
    typeof target['selectedText'] !== 'string' ||
    !target['selectedText'] ||
    target['selectedText'].length > MAX_VALUE_LENGTH ||
    sanitizePageText(target['selectedText']) !== target['selectedText']
  )
    return null;
  const frame = parseEditableSelectionFrame(target['frame'], target['url']);
  if (target['frame'] !== undefined && !frame) return null;
  return {
    id: target['id'],
    tabId: target['tabId'],
    url: target['url'],
    documentId: target['documentId'],
    label: target['label'],
    selectedText: target['selectedText'],
    owner,
    ...(frame ? { frame } : {}),
  };
}
