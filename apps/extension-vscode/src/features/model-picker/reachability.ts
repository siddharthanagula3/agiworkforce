import * as vscode from 'vscode';
import { normalizeModelId } from '@agiworkforce/types';
import { turnFailureOffer } from '../sidebar-webview/errorPresentation';
import { isAutoPickerModelId, type GroupedQuickPickItem } from './modelConstants';
import { privacyPinReason, privacyPinRefuses, type PrivacyPin } from './privacyPin';

export type ModelTrustMode = 'local' | 'byok' | 'managed' | 'unknown';

export interface HostModelUnreachable {
  code: string;
  action:
    'sign_in_provider' | 'sign_in_account' | 'upgrade_plan' | 'open_settings' | 'retry' | 'none';
  provider?: string;
}

export interface HostModel {
  id: string;
  provider: string;
  reachable: boolean;
  unreachable?: HostModelUnreachable;
  trustMode: ModelTrustMode;
}

export interface ReachableQuickPickItem extends GroupedQuickPickItem {
  unreachable?: HostModelUnreachable;
  refusedBoundary?: ModelTrustMode;
  pinnedOut?: PrivacyPin;
}

export const UNREACHABLE_SECTION_LABEL = 'Needs setup on this machine';

const PRIVACY_ALLOWS: Readonly<Record<string, readonly ModelTrustMode[]>> = Object.freeze({
  local: ['local'],
  byok: ['local', 'byok'],
  managed: ['local', 'byok', 'managed'],
});

export function offerLabel(unreachable: HostModelUnreachable): string | undefined {
  return turnFailureOffer(unreachable)?.label;
}

function boundaryRefusal(
  trustMode: ModelTrustMode,
  privacyMode: string | undefined,
): ModelTrustMode | undefined {
  if (privacyMode === undefined) return undefined;
  const allowed = PRIVACY_ALLOWS[privacyMode];
  if (allowed === undefined) return undefined;
  return allowed.includes(trustMode) ? undefined : trustMode;
}

function separator(label: string): ReachableQuickPickItem {
  return { label, kind: vscode.QuickPickItemKind.Separator };
}

export function buildReachabilityQuickPickItems(input: {
  items: readonly GroupedQuickPickItem[];
  hostModels?: readonly HostModel[];
  privacyMode?: string;
  privacyPin?: PrivacyPin;
}): ReachableQuickPickItem[] {
  const { items, hostModels, privacyMode, privacyPin } = input;
  if ((hostModels === undefined || hostModels.length === 0) && privacyPin === undefined) {
    return [...items];
  }

  const byId = new Map<string, HostModel>();
  for (const model of hostModels ?? []) {
    const id = normalizeModelId(model.id) ?? model.id;
    if (!byId.has(id)) byId.set(id, model);
  }

  const reachable: ReachableQuickPickItem[] = [];
  const unreachable: ReachableQuickPickItem[] = [];
  const pinnedOut: ReachableQuickPickItem[] = [];

  for (const item of items) {
    if (item.kind === vscode.QuickPickItemKind.Separator) {
      if (reachable.at(-1)?.kind !== vscode.QuickPickItemKind.Separator)
        reachable.push({ ...item });
      continue;
    }
    const host = item.modelId === undefined ? undefined : byId.get(item.modelId);
    const autoOutsideLocal =
      privacyPin?.trustMode === 'local' &&
      item.modelId !== undefined &&
      isAutoPickerModelId(item.modelId);
    if (
      privacyPin !== undefined &&
      (autoOutsideLocal || (host !== undefined && privacyPinRefuses(privacyPin, host.trustMode)))
    ) {
      pinnedOut.push({ ...item, pinnedOut: privacyPin });
      continue;
    }
    if (host !== undefined && !host.reachable && host.unreachable !== undefined) {
      const label = offerLabel(host.unreachable);
      unreachable.push({
        ...item,
        ...(label === undefined ? {} : { description: label }),
        unreachable: host.unreachable,
      });
      continue;
    }
    const refused = host === undefined ? undefined : boundaryRefusal(host.trustMode, privacyMode);
    reachable.push({
      ...item,
      ...(refused === undefined ? {} : { refusedBoundary: refused }),
    });
  }

  while (reachable.at(-1)?.kind === vscode.QuickPickItemKind.Separator) reachable.pop();
  const sections = [...reachable];
  if (unreachable.length > 0) sections.push(separator(UNREACHABLE_SECTION_LABEL), ...unreachable);
  if (privacyPin !== undefined && pinnedOut.length > 0) {
    sections.push(separator(privacyPinReason(privacyPin)), ...pinnedOut);
  }
  return sections;
}
