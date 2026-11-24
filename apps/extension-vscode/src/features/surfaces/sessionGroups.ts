import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';

export interface SessionGroup {
  id: string;
  name: string;
}

interface SessionGroupState {
  groups: SessionGroup[];
  assignments: Array<{ sessionId: string; groupId: string }>;
}

interface SessionGroupChoice {
  groupId?: string;
  groups: SessionGroup[];
}

const SESSION_GROUPS_KEY = 'agiWorkforce.sessionGroups';
const MAX_GROUP_NAME_LENGTH = 60;
let groupWrites: Promise<unknown> = Promise.resolve();

export function readSessionGroups(storage?: vscode.Memento): SessionGroupState {
  return storage?.get<SessionGroupState>(SESSION_GROUPS_KEY) ?? { groups: [], assignments: [] };
}

function groupNameError(name: string, groups: readonly SessionGroup[]): string | undefined {
  const normalized = name.trim();
  if (!normalized || normalized.length > MAX_GROUP_NAME_LENGTH)
    return `Enter a name between 1 and ${MAX_GROUP_NAME_LENGTH} characters.`;
  if (groups.some((group) => group.name.toLowerCase() === normalized.toLowerCase()))
    return 'That group name is already in use.';
  return undefined;
}

function updateSessionGroups(
  storage: vscode.Memento,
  isCurrent: () => boolean,
  change: (state: SessionGroupState) => SessionGroupState | undefined,
): Promise<SessionGroupState | undefined> {
  const update = groupWrites.then(async () => {
    if (!isCurrent()) return;
    const next = change(readSessionGroups(storage));
    if (!next) return;
    await storage.update(SESSION_GROUPS_KEY, next);
    return next;
  });
  groupWrites = update.catch(() => undefined);
  return update;
}

export async function chooseSessionGroup(
  storage: vscode.Memento,
  sessionIds: readonly string[],
  isCurrent: () => boolean,
): Promise<SessionGroupChoice | undefined> {
  const state = readSessionGroups(storage);
  const selected = new Set(sessionIds);
  if (selected.size === 0 || !isCurrent()) return;
  const assigned = state.assignments.filter((entry) => selected.has(entry.sessionId));
  const current =
    assigned.length === selected.size &&
    assigned.every((entry) => entry.groupId === assigned[0]?.groupId)
      ? assigned[0]?.groupId
      : undefined;
  type Item = vscode.QuickPickItem &
    ({ action: 'group'; groupId: string } | { action: 'new' | 'none' });
  const items: Item[] = state.groups.map<Item>((group) => ({
    action: 'group',
    groupId: group.id,
    label: group.name,
    description: group.id === current ? 'Current group' : undefined,
  }));
  items.push({ action: 'new', label: 'New session group…' });
  if (assigned.length) items.push({ action: 'none', label: 'Remove from group' });
  const picked = await vscode.window.showQuickPick(items, {
    title: selected.size === 1 ? 'Move session to group' : 'Move sessions to group',
    placeHolder:
      selected.size === 1
        ? 'Choose a group for this conversation'
        : `Choose a group for ${selected.size} conversations`,
  });
  if (!picked || !isCurrent()) return;
  const name =
    picked.action === 'new'
      ? (
          await vscode.window.showInputBox({
            title: 'New session group',
            prompt: 'Name this group',
            validateInput: (value) => groupNameError(value, readSessionGroups(storage).groups),
          })
        )?.trim()
      : undefined;
  if (picked.action === 'new' && !name) return;
  const next = await updateSessionGroups(storage, isCurrent, (latest) => {
    if (name && groupNameError(name, latest.groups)) {
      void vscode.window.showWarningMessage('That group name is no longer available.');
      return;
    }
    const created = name ? { id: randomUUID(), name } : undefined;
    const groups = created ? [...latest.groups, created] : latest.groups;
    const groupId = created?.id ?? (picked.action === 'group' ? picked.groupId : undefined);
    if (groupId !== undefined && !groups.some((group) => group.id === groupId)) return;
    const assignments = latest.assignments.filter((entry) => !selected.has(entry.sessionId));
    if (groupId !== undefined) {
      for (const sessionId of selected) assignments.push({ sessionId, groupId });
    }
    return { groups, assignments };
  });
  if (!next) return;
  return {
    groups: next.groups,
    groupId: next.assignments.find((entry) => selected.has(entry.sessionId))?.groupId,
  };
}

export async function manageSessionGroups(
  storage: vscode.Memento,
  isCurrent: () => boolean,
): Promise<SessionGroup[] | undefined> {
  const { groups } = readSessionGroups(storage);
  if (groups.length === 0 || !isCurrent()) return;
  const selected = await vscode.window.showQuickPick(
    groups.map((group) => ({ label: group.name, group })),
    { title: 'Manage session groups', placeHolder: 'Choose a group' },
  );
  if (!selected || !isCurrent()) return;
  const { id, name } = selected.group;
  const position = groups.findIndex((group) => group.id === id);
  type Item = vscode.QuickPickItem & { action: 'rename' | 'up' | 'down' | 'delete' };
  const actions: Item[] = [{ label: 'Rename group', action: 'rename' }];
  if (position > 0) actions.push({ label: 'Move group up', action: 'up' });
  if (position < groups.length - 1) actions.push({ label: 'Move group down', action: 'down' });
  actions.push({ label: 'Delete group…', action: 'delete' });
  const picked = await vscode.window.showQuickPick(actions, { title: name });
  if (!picked || !isCurrent()) return;
  let renamed: string | undefined;
  if (picked.action === 'rename') {
    renamed = (
      await vscode.window.showInputBox({
        title: 'Rename session group',
        value: name,
        validateInput: (value) =>
          groupNameError(
            value,
            readSessionGroups(storage).groups.filter((group) => group.id !== id),
          ),
      })
    )?.trim();
    if (!renamed) return;
  }
  if (picked.action === 'delete') {
    const confirm = 'Delete group';
    const answer = await vscode.window.showWarningMessage(
      `Delete the session group "${name}"?`,
      { modal: true, detail: 'The conversations stay in the workspace and move to Ungrouped.' },
      confirm,
    );
    if (answer !== confirm) return;
  }

  const next = await updateSessionGroups(storage, isCurrent, (latest) => {
    const index = latest.groups.findIndex((group) => group.id === id);
    const group = latest.groups[index];
    if (!group) return;
    const updated = [...latest.groups];
    if (picked.action === 'delete') {
      updated.splice(index, 1);
      return {
        groups: updated,
        assignments: latest.assignments.filter((entry) => entry.groupId !== id),
      };
    }
    if (renamed !== undefined) {
      if (
        groupNameError(
          renamed,
          latest.groups.filter((entry) => entry.id !== id),
        )
      ) {
        void vscode.window.showWarningMessage('That group name is no longer available.');
        return;
      }
      updated[index] = { ...group, name: renamed };
    } else {
      const destination = index + (picked.action === 'up' ? -1 : 1);
      if (destination < 0 || destination >= updated.length) return;
      updated.splice(index, 1);
      updated.splice(destination, 0, group);
    }
    return { groups: updated, assignments: latest.assignments };
  });
  return next?.groups;
}
