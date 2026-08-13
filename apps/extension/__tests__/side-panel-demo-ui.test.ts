import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

describe('Chrome side-panel demo surface', () => {
  it('exposes conversation history directly from the header', () => {
    expect(source).toContain("id: 'sp-history-btn'");
    expect(source).toContain("'aria-label': 'Recent chats'");
    expect(source).toContain('openDrawer(historyBtn)');
    expect(source).toContain("id: 'sp-drawer-history-search'");
    expect(source).toContain('filterConversations(entries, drawerHistorySearch.value)');
  });

  it('invalidates delayed history restores and conditionally rolls back a stale owner claim', () => {
    const start = source.indexOf('async function restoreHistoryEntry');
    const end = source.indexOf('// Install the module-scope hook', start);
    const restoreBody = source.slice(start, end);

    expect(source).toContain('historyRestoreToken += 1');
    expect(restoreBody).toContain('const restoreToken = ++historyRestoreToken');
    expect(restoreBody.match(/restoreIsCurrent\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(restoreBody).toContain('restoreConversationOwnerIfCurrent(');
  });

  it('persists a boot-seeded collision branch before relying on in-memory hydration', () => {
    const start = source.indexOf('async function loadMessages');
    const end = source.indexOf('function resumeLatestStoredManagedRun', start);
    const loadBody = source.slice(start, end);

    expect(loadBody).toMatch(
      /persistConversationSeed\(\s*ownerAtStart,\s*conversationOwner\.conversationId,\s*active,?\s*\)/,
    );
    expect(loadBody).toContain('_ctx.conversationGeneration !== expectedGeneration');
  });

  it('does not let a delayed delete clear a newer restored conversation', () => {
    const start = source.indexOf("delBtn.addEventListener('click'");
    const end = source.indexOf('item.appendChild(delBtn)', start);
    const deleteBody = source.slice(start, end);

    expect(deleteBody).toContain('const deletionGeneration = _ctx.conversationGeneration');
    expect(deleteBody).toContain('_ctx.conversationId === entry.id');
    expect(deleteBody).toContain('_ctx.conversationGeneration === deletionGeneration');
  });

  it('shows a catalog-driven reasoning slider with an honest unresolved Auto state', () => {
    expect(source).toContain("id: 'sp-effort-btn'");
    expect(source).toContain("id: 'sp-effort-slider'");
    expect(source).toContain('getManagedEffortControlState(');
    expect(source).toContain("state.status === 'awaiting-route'");
    expect(source).toContain('getManagedOutboundEffort(');
    expect(source).toContain('return effort === undefined ? {} : { effort }');
  });

  it('keeps Quick as a per-turn overlay without erasing durable route state on toggle', () => {
    const start = source.indexOf("quickModeToggle.addEventListener('click'");
    const end = source.indexOf('effortPopover.appendChild(quickModeToggle)', start);
    const toggleBody = source.slice(start, end);

    expect(toggleBody).toContain('_ctx.quickMode = next');
    expect(toggleBody).not.toContain('_ctx.currentModelKey = undefined');
    expect(toggleBody).not.toContain('_ctx.previousTaskType = undefined');
    expect(toggleBody).not.toContain('_ctx.reasoningEffort = undefined');
    expect(toggleBody).not.toContain('saveMessages()');
    expect(source).toContain('quickModeByStreamId.set(streamId, quickMode)');
    expect(source).toContain('!streamUsedQuick && applyRoutingContinuation(chunk.routing)');
  });

  it('keeps the polished composer hierarchy stable without hiding trust state', () => {
    expect(source).toContain("class: 'sp-composer-controls-start'");
    expect(source).toContain("class: 'sp-composer-controls-end'");
    expect(source).toContain('composerBarStart.appendChild(attachWrapper)');
    expect(source).toContain('composerBarStart.appendChild(contextBtn)');
    expect(source).toContain('trustStrip.appendChild(autonomyControl)');
    expect(source).toContain('composerBarEnd.appendChild(effortControl)');
    expect(source).toContain('composerBarEnd.appendChild(micBtn)');
    expect(source).toContain('composerBarEnd.appendChild(sendBtn)');
    expect(source).toContain('composerShell.appendChild(trustStrip)');
    expect(source).toContain("label: 'Syncing to your account'");
    expect(source).toContain("label: 'Saved to your account'");
    expect(source).toContain("'Saved on this device'");
  });

  it('supports keyboard navigation for modal and menu surfaces', () => {
    expect(source).toContain("if (event.key !== 'Tab') return");
    expect(source).toContain('drawer.querySelectorAll<HTMLElement>');
    expect(source).toContain("modelDropdownEl.addEventListener('keydown'");
    expect(source).toContain("attachMenu.addEventListener('keydown'");
    expect(source).toContain("['ArrowDown', 'ArrowUp', 'Home', 'End']");
  });

  it('labels the navigation drawer as an AGI menu instead of settings', () => {
    expect(source).toContain("'aria-label': 'AGI menu'");
    expect(source).toContain("el('div', { id: 'sp-drawer-title' }, 'AGI in Chrome')");
    expect(source).toContain("'aria-label': 'Open AGI menu'");
  });

  it('does not expose unfinished console or desktop actions in the public drawer', () => {
    expect(source).not.toContain('chatActionsRow.appendChild(drawerConsoleBtn)');
    expect(source).not.toContain('chatActionsRow.appendChild(drawerOpenDesktopBtn)');
  });

  it('does not present native WebMCP declarations as managed chat tools', () => {
    expect(source).not.toContain("id: 'sp-tools-btn'");
    expect(source).not.toContain("type: 'WEBMCP_DISCOVER_TOOLS'");
    expect(source).not.toContain('Use the ${tool.name} tool to');
  });

  it('disables conversation restore while busy and closes history only after success', () => {
    expect(source).toContain('[data-conversation-restore="true"]');
    expect(source).toContain('const disabled = _ctx.isStreaming || historyRestoreInProgress');
    expect(source).toContain("'data-conversation-restore': 'true'");
    const start = source.indexOf("openButton.addEventListener('click'");
    const end = source.indexOf('drawerHistoryList.appendChild(item)', start);
    const body = source.slice(start, end);
    expect(body).toContain('if (opened)');
    expect(body).toContain('closeDrawer()');
    expect(body).toContain("t('spHistoryStopBeforeOpen')");
  });

  it('keeps New chat as the single reset affordance', () => {
    expect(source).toContain("id: 'sp-new-chat-btn'");
    expect(source).not.toContain("id: 'sp-drawer-clear-chat-btn'");
    expect(source).not.toContain("document.createTextNode(' Clear')");
  });

  it('announces workflow mutation progress, success, and errors', () => {
    expect(source).toContain("id: 'sp-wf-mutation-status'");
    expect(source).toContain("'aria-live': 'polite'");
    expect(source).toContain("announceWorkflowMutation(t('spWorkflowRunning', [sc.name]))");
    expect(source).toContain("announceWorkflowMutation(t('spWorkflowDeleting', [task.name]))");
    expect(source).toContain("t('spTaskEnabled', [task.name])");
  });

  it('gates sends on attachment intake and states the history limitation', () => {
    expect(source).toContain('composerAttachmentIntakeCount === 0');
    expect(source).toContain("t('spAttachmentAdding')");
    expect(source).toContain("t('spAttachmentHistoryLimitation')");
    expect(source).toContain("t('spAttachmentCaptureFailed')");
  });

  it('uses an honest signed-out model picker label', () => {
    expect(source).toMatch(/providerCount === 0\s*\?\s*'Sign in for models'/);
  });

  it('lets users explicitly refresh the Sync Host session after web sign-in', () => {
    expect(source).toContain("t('spCloudCheckSignIn')");
    expect(source).toContain('refreshCloudAccountUI(true)');
    expect(source).not.toContain('Your account refreshes automatically.');
  });

  it('routes visible managed-tool decisions through the durable approval message', () => {
    expect(source).toContain("type: 'RESOLVE_CHAT_APPROVAL'");
    expect(source).toContain('cloudRun: run');
    expect(source).toContain('toolApprovals');
    expect(source).not.toContain("id: 'sp-action-mode-toggle'");
  });

  it('uses the shared Managed Cloud account capability before enabling the composer', () => {
    expect(source).toContain(
      "canUseBillingPlanCapability(access.subscriptionTier, 'managed_chat')",
    );
    expect(source).toContain('access.hasUsageRemaining === false');
    expect(source).toContain("t('spGateUsageLimit')");
  });

  it('shows canonical account usage and truthful Web handoffs for cloud connectors and teams', () => {
    expect(source).toContain('access.usagePercentage');
    expect(source).toContain('Manage usage');
    expect(source).toContain('Connect apps');
    expect(source).toContain('Cloud connectors open on Web');
    expect(source).toContain('Team & Enterprise');
    expect(source).toContain('https://agiworkforce.com/connectors?from=chrome-extension');
    expect(source).toContain('https://agiworkforce.com/teams?from=chrome-extension');
  });

  it('routes inactive retained subscriptions to billing instead of enabling paid Chrome access', () => {
    expect(source).toContain('!isEntitledSubscriptionStatus(access.subscriptionStatus)');
    expect(source).toContain("t('spBillingManage')");
    expect(source).toContain('https://agiworkforce.com/settings/billing?from=chrome-extension');
  });
});

/**
 * Four separate strings promised "/ for commands" — the placeholder in two
 * places, the empty-state copy, and the composer placeholder — while nothing in
 * the panel listened for the key. The commands existed and expanded correctly on
 * submit, so they worked only for someone who already knew their names.
 */
describe('Chrome side-panel slash commands', () => {
  it('drives the menu and the expander from one command list', () => {
    expect(source).toContain('const SLASH_COMMANDS: Record<string, SlashCommandMeta>');
    // expandSlashCommand must read the shared list, not a private copy.
    expect(source).toContain('const exact = SLASH_COMMANDS[trimmed]');
    expect(source).toContain('for (const [cmd, meta] of Object.entries(SLASH_COMMANDS))');
  });

  it('renders an autocomplete menu that reacts to typing', () => {
    expect(source).toContain("id: 'sp-slash-menu'");
    expect(source).toContain("inputEl.addEventListener('input', refreshSlashMenu)");
    expect(source).toContain('composerShell.appendChild(slashMenu)');
  });

  it('supports keyboard selection and does not send the raw fragment', () => {
    expect(source).toContain("e.key === 'ArrowDown'");
    expect(source).toContain("e.key === 'ArrowUp'");
    expect(source).toContain("e.key === 'Escape'");
    // Without this the send handler also fires and dispatches "/su" as a message.
    expect(source).toContain('e.stopImmediatePropagation()');
  });

  it('exposes the menu to assistive technology', () => {
    expect(source).toContain("role: 'listbox'");
    expect(source).toContain("role: 'option'");
    expect(source).toContain("inputEl.setAttribute('aria-activedescendant'");
  });
});

describe('Chrome side-panel composer input state', () => {
  it('recomputes the visible Send control when the textarea changes', () => {
    expect(source).toMatch(
      /inputEl\.addEventListener\('input', \(\) => \{[\s\S]*autoResizeInput\(inputEl\);[\s\S]*updateSendButton\(\);[\s\S]*\}\);/,
    );
  });

  it('routes voice transcription through the textarea input path', () => {
    const voiceSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/features/side-panel/voice.ts'),
      'utf8',
    );
    expect(voiceSource).toContain("inputEl.dispatchEvent(new Event('input', { bubbles: true }))");
  });
});

describe('Chrome side-panel tab-group state', () => {
  it('renders every group control from one active-tab state', () => {
    expect(source).toContain('const tabGroupStateRenderers = new Set<TabGroupStateRenderer>()');
    expect(source.match(/registerTabGroupStateRenderer\(/g)?.length).toBe(4);
    expect(source).toContain("{ type: 'GET_TAB_GROUP_STATE' }");
    expect(source).toContain('refreshTabGroupUI();');
    expect(source).toContain("id: 'sp-tab-group-notice'");
    expect(source).toContain("t('spTabGroupUpdateFailed')");
  });

  it('routes all group changes through the shared mutation path', () => {
    expect(source).toContain('function requestTabGroupChange(grouped: boolean)');
    expect(source.match(/requestTabGroupChange\(/g)?.length).toBe(5);
    expect(source).not.toContain('let drawerGrouped = false');
    expect(source).not.toContain('let isGrouped = false');
  });
});
