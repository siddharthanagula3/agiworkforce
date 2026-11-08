import { MAX_VALUE_LENGTH, MAX_SELECTOR_LENGTH, sanitizePageText } from '../../background/policy';
import { UUID_PATTERN } from '../../lib/uuid';
import {
  normalizeManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';
import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';
import { MAX_ELEMENT_NAME_CHARS } from '../content/pageElements';

export interface EditableSelectionTarget {
  id: string;
  tabId: number;
  url: string;
  documentId: string;
  label: string;
  selectedText: string;
  owner: ManagedCloudOwner;
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
  return {
    id: target['id'],
    tabId: target['tabId'],
    url: target['url'],
    documentId: target['documentId'],
    label: target['label'],
    selectedText: target['selectedText'],
    owner,
  };
}
