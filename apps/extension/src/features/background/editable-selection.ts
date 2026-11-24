import { evaluateSitePolicy, sitePolicyDenialMessage } from '@agiworkforce/types';
import { readAdminSitePolicy, readUserSiteAllowlist } from '../site-policy/store';
import { t } from '../../i18n';
import { readUserSiteBlocklist } from '../site-policy/userBlocklist';
import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';
import { sendPageDocumentMessage } from '../browser-tools/documentBridge';
import type { ManagedCloudOwner } from '../cloud-bridge/managedCloudAuthority';
import {
  parseEditableSelectionFrame,
  readEditableSelectionDocument,
  type EditableSelectionTarget,
} from '../browser-tools/editableTarget';
import type {
  ApplyEditableSelectionMessage,
  UndoEditableSelectionMessage,
  EditableSelectionResponse,
} from '../../types';
import { MAX_VALUE_LENGTH, MAX_SELECTOR_LENGTH } from '../../background/policy';
import { UUID_PATTERN } from '../../lib/uuid';

async function assertInlineSite(url: string): Promise<void> {
  const parsed = new URL(url);
  const origin = normalizeApprovedSiteOrigin(url);
  if (
    !origin ||
    parsed.username ||
    parsed.password ||
    (await readUserSiteBlocklist(undefined, { failClosed: true })).includes(origin)
  )
    throw new Error('This site is blocked for selected-text editing.');
  const evaluation = evaluateSitePolicy(
    { admin: await readAdminSitePolicy(), userAllowlist: await readUserSiteAllowlist() },
    url,
    'automation',
  );
  if (!evaluation.allowed)
    throw new Error(sitePolicyDenialMessage(evaluation, t('spRewriteSiteNotApproved')));
}

export async function captureEditableTarget(
  tab: chrome.tabs.Tab,
  selectedText: string,
  owner: ManagedCloudOwner,
  ownerIsCurrent: () => boolean,
  clickedFrame?: { id: number; url: string | undefined },
): Promise<EditableSelectionTarget> {
  if (
    !Number.isSafeInteger(tab.id) ||
    !tab.url ||
    !selectedText ||
    selectedText.length > MAX_VALUE_LENGTH
  )
    throw new Error('Select ordinary text in a field and try again.');
  await assertInlineSite(tab.url);
  const frame = parseEditableSelectionFrame(clickedFrame, tab.url);
  if (clickedFrame && !frame) throw new Error(t('spRewriteFrameUnsupported'));
  const source = { tabId: tab.id!, url: tab.url, ...(frame ? { frame } : {}) };
  const reference = await readEditableSelectionDocument(source);
  if (!ownerIsCurrent()) throw new Error('The signed-in account changed. Select the text again.');
  const response = (await sendPageDocumentMessage(
    reference,
    {
      type: 'CAPTURE_EDITABLE_SELECTION',
      pageUrl: reference.url,
      selectedText,
      owner,
      ...(frame ? { topUrl: tab.url } : {}),
    },
    true,
  )) as EditableSelectionResponse;
  if (
    response?.success !== true ||
    !response.selection ||
    !UUID_PATTERN.test(response.selection.id) ||
    response.selection.selectedText !== selectedText ||
    typeof response.selection.label !== 'string'
  )
    throw new Error(response?.error ?? 'This editor does not expose a supported selection.');
  await readEditableSelectionDocument({ ...source, documentId: reference.documentId });
  if (!ownerIsCurrent()) throw new Error('The signed-in account changed. Select the text again.');
  return {
    id: response.selection.id,
    ...source,
    documentId: reference.documentId,
    label: response.selection.label,
    selectedText,
    owner: { ...owner },
  };
}

export async function executeEditableTarget(
  message: ApplyEditableSelectionMessage | UndoEditableSelectionMessage,
  ownerIsCurrent: () => boolean,
): Promise<EditableSelectionResponse> {
  if (
    !Number.isSafeInteger(message.tabId) ||
    message.tabId < 0 ||
    !UUID_PATTERN.test(message.selectionId) ||
    typeof message.documentId !== 'string' ||
    !message.documentId ||
    message.documentId.length > MAX_SELECTOR_LENGTH ||
    (message.type === 'APPLY_EDITABLE_SELECTION' &&
      (typeof message.text !== 'string' || message.text.length > MAX_VALUE_LENGTH))
  )
    throw new Error('Invalid selected-text editing request.');
  const tab = await chrome.tabs.get(message.tabId);
  if (tab.url !== message.pageUrl)
    throw new Error('The source page changed. Select the text again.');
  await assertInlineSite(message.pageUrl);
  const frame = parseEditableSelectionFrame(message.frame, message.pageUrl);
  if (message.frame !== undefined && !frame) throw new Error(t('spRewriteFrameUnsupported'));
  const reference = await readEditableSelectionDocument({
    tabId: message.tabId,
    url: message.pageUrl,
    documentId: message.documentId,
    ...(frame ? { frame } : {}),
  });
  if (!ownerIsCurrent()) throw new Error('The signed-in account changed. Select the text again.');
  const common = {
    tabId: message.tabId,
    pageUrl: reference.url,
    ...(frame ? { topUrl: message.pageUrl } : {}),
    documentId: message.documentId,
    selectionId: message.selectionId,
    owner: message.owner,
  };
  return (await sendPageDocumentMessage(
    reference,
    message.type === 'APPLY_EDITABLE_SELECTION'
      ? { ...common, type: message.type, text: message.text }
      : { ...common, type: message.type },
  )) as EditableSelectionResponse;
}
