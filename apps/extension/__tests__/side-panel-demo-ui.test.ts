import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getDefaultAutoRoutingProfile } from '@agiworkforce/types';
import {
  getManagedEffortControlState,
  getManagedModelBadgeLabel,
  getManagedModelPickerOptions,
} from '../src/features/cloud-bridge/managedModelPicker';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

describe('Chrome side-panel demo surface', () => {
  it('opens recent chats as its own sheet from the header', () => {
    expect(source).toContain("id: 'sp-history-btn'");
    expect(source).toContain("'aria-label': 'Recent chats'");
    expect(source).toContain("historyBtn.addEventListener('click', openRecents)");
    expect(source).toContain("id: 'sp-recents'");
    expect(source).toContain("id: 'sp-drawer-history-search'");
    expect(source).toContain('filterConversations(ordered, drawerHistorySearch.value)');
    expect(source).toContain(
      'drawerHistorySearch.hidden = entries.length <= RECENTS_SEARCH_THRESHOLD',
    );
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
    const start = source.indexOf('function deleteHistoryEntry(');
    const end = source.indexOf('function buildHistoryMenu(', start);
    const deleteBody = source.slice(start, end);

    expect(deleteBody).toContain('const deletionGeneration = _ctx.conversationGeneration');
    expect(deleteBody).toContain('_ctx.conversationId === entry.id');
    expect(deleteBody).toContain('_ctx.conversationGeneration === deletionGeneration');
  });

  it('renders effort rows only after the catalog supplies a concrete effort ladder', () => {
    expect(source).toContain("class: 'sp-effort-option'");
    expect(source).toContain('getManagedEffortControlState(');
    expect(source).toContain("state.status !== 'ready' || state.effort === undefined");
    const start = source.indexOf('function appendEffortSection');
    const effortSection = source.slice(start, source.indexOf('function appendToggleRow', start));
    expect(
      effortSection.indexOf("state.status !== 'ready' || state.effort === undefined"),
    ).toBeLessThan(effortSection.indexOf("t('spEffortHeading')"));
    expect(getManagedEffortControlState('auto', undefined, undefined)).toMatchObject({
      status: 'awaiting-route',
      options: [],
    });
    expect(source).toContain('getManagedOutboundEffort(');
    expect(source).toContain('return effort === undefined ? {} : { effort }');
  });

  it('uses the canonical Auto routing label and description instead of a synthetic model name', () => {
    const profile = getDefaultAutoRoutingProfile();
    expect(getManagedModelBadgeLabel(profile.id)).toBe(profile.label);
    expect(getManagedModelPickerOptions(null)).toEqual([
      { value: profile.id, label: profile.label, description: profile.description },
    ]);
  });

  it('keeps Quick as a per-turn overlay without erasing durable route state on toggle', () => {
    const start = source.indexOf('function applyQuickMode(');
    const end = source.indexOf('function renderModelDropdown(', start);
    const toggleBody = source.slice(start, end);

    expect(toggleBody).toContain('_ctx.quickMode = next');
    expect(toggleBody).not.toContain('_ctx.currentModelKey = undefined');
    expect(toggleBody).not.toContain('_ctx.previousTaskType = undefined');
    expect(toggleBody).not.toContain('_ctx.reasoningEffort = undefined');
    expect(toggleBody).not.toContain('saveMessages()');
    expect(source).toContain('quickModeByStreamId.set(streamId, quickMode)');
    expect(source).toContain('!streamUsedQuick && applyRoutingContinuation(chunk.routing)');
  });

  it('keeps one composer chip row without hiding where a chat is stored', () => {
    expect(source).toContain("class: 'sp-composer-controls-start'");
    expect(source).toContain("class: 'sp-composer-controls-end'");
    expect(source).toContain('composerBarStart.appendChild(attachWrapper)');
    expect(source).toContain('composerBarStart.appendChild(autonomyControl)');
    expect(source).toContain('composerBarEnd.appendChild(modelSelectorWrap)');
    expect(source).toContain('composerBarEnd.appendChild(micBtn)');
    expect(source).toContain('composerBarEnd.appendChild(sendBtn)');
    expect(source).not.toContain('composerShell.appendChild(trustStrip)');
    expect(source).toContain("label: 'Syncing to your account'");
    expect(source).toContain("label: 'Saved to your account'");
    expect(source).toContain("'Saved on this device'");
    expect(source).toContain("class: 'sp-drawer-history-badge'");
  });

  it('reveals the send button only once there is something to send', () => {
    expect(source).toContain(
      'btn.hidden = text.trim().length === 0 && pendingAttachmentCount() === 0',
    );
    expect(source).toContain('#sp-send-btn[hidden] { display: none; }');
  });

  it('supports keyboard navigation for modal and menu surfaces', () => {
    expect(source).toContain("if (event.key !== 'Tab') return");
    expect(source).toContain("modelDropdownEl.addEventListener('keydown'");
    expect(source).toContain("attachMenu.addEventListener('keydown'");
    expect(source).toContain("['ArrowDown', 'ArrowUp', 'Home', 'End']");
  });

  it('presents More as a small popover with the Options destinations and the version', () => {
    expect(source).toContain("id: 'sp-more-menu'");
    expect(source).toContain('const moreHandle = wirePopupMenu(menuBtn, moreMenu)');
    expect(source).toContain("t('spMoreVersion'");
    for (const key of ['spExtensionSettings', 'spMoreShortcuts', 'spMoreHelp']) {
      expect(source).toContain(`t('${key}')`);
    }
    expect(source).not.toContain("id: 'sp-drawer'");
  });

  it('does not expose unfinished console or desktop actions', () => {
    expect(source).not.toContain('drawerConsoleBtn');
    expect(source).not.toContain('drawerOpenDesktopBtn');
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
    expect(body).toContain('closeRecents()');
    expect(body).toContain("t('spHistoryStopBeforeOpen')");
  });

  it('keeps New chat as the single reset affordance', () => {
    expect(source).toContain("id: 'sp-new-chat-btn'");
    expect(source).not.toContain("id: 'sp-drawer-clear-chat-btn'");
    expect(source).not.toContain("document.createTextNode(' Clear')");
  });

  it('keeps the Workflows view out of the panel', () => {
    expect(source).not.toContain("id: 'sp-workflows'");
    expect(source).not.toContain('announceWorkflowMutation');
  });

  it('gates sends on attachment intake and names each refused file', () => {
    expect(source).toContain('composerAttachmentIntakes.size === 0');
    expect(source).toContain("t('spAttachmentAdding')");
    expect(source).toContain("t('spAttachmentUnsupported', [file.name])");
    expect(source).toContain("t('spAttachmentCaptureFailed')");
  });

  it('uses an honest signed-out model picker label', () => {
    expect(source).toContain("t('spModelsSignedOut')");
    expect(source).toContain('managedModelAccess === null');
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
    expect(source).toContain(
      'usage.has_usage_remaining === false && purchased?.spendable !== true',
    );
    expect(source).toContain("t('spGateUsageLimit')");
  });

  it('derives the chat gate from the canonical account usage', () => {
    expect(source).toContain('const usage = access.usage;');
    expect(source).toContain('usageWindowViews(usage)');
    expect(source).toContain('purchasedCreditsView(usage)');
  });

  it('routes inactive retained subscriptions to billing instead of enabling paid Chrome access', () => {
    expect(source).toContain('!isEntitledSubscriptionStatus(access.subscriptionStatus)');
    expect(source).toContain("t('spBillingManage')");
    expect(source).toContain('/settings/billing?from=chrome-extension');
  });
});

describe('Chrome side-panel slash commands', () => {
  it('drives the menu and the expander from one command list', () => {
    const commands = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/features/side-panel/pageCommands.ts'),
      'utf8',
    );
    expect(commands).toContain('export const SLASH_COMMANDS: Record<string, SlashCommandMeta>');
    expect(commands).toContain('const exact = SLASH_COMMANDS[trimmed]');
    expect(commands).toContain('for (const [cmd, meta] of Object.entries(SLASH_COMMANDS))');
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
    const composerTextSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/features/side-panel/composerText.ts'),
      'utf8',
    );
    expect(voiceSource).toContain('appendComposerText(inputEl, transcript)');
    expect(composerTextSource).toContain("document.execCommand('insertText', false, text)");
    expect(composerTextSource).toContain(
      "input.dispatchEvent(new Event('input', { bubbles: true }))",
    );
  });
});

describe('Chrome side-panel composer placeholder never shows a stale literal', () => {
  it('creates the composer with the catalog ready copy, not a hardcoded literal', () => {
    const start = source.indexOf("id: 'sp-input',");
    const end = source.indexOf('}) as HTMLTextAreaElement', start);
    const textareaCall = source.slice(start, end);

    expect(textareaCall).toContain("placeholder: t('spComposerPlaceholder')");
    expect(textareaCall).not.toContain('Type / for commands');
  });

  it('owns the placeholder for every chat state, loading included', () => {
    const start = source.indexOf('function setManagedCloudChatState');
    const end = source.indexOf('\n}', start);
    const body = source.slice(start, end);

    expect(body).toContain("if (state === 'signed_out')");
    expect(body).toContain("input.placeholder = t('spComposerPlaceholderSignedOut')");
    expect(body).toContain("else if (state === 'unavailable')");
    expect(body).toContain("input.placeholder = t('spComposerPlaceholderNoAccess')");
    expect(body).toMatch(/else\s+input\.placeholder = t\('spComposerPlaceholder'\)/);
  });
});

describe('Chrome side-panel feature surfaces', () => {
  it('shows no usage meter on the Free plan and clears the usage banner', () => {
    const start = source.indexOf('function presentManagedUsage');
    const end = source.indexOf('refreshCloudAccountUI = async function', start);
    const body = source.slice(start, end);
    const freeBranch = body.indexOf('if (upgradeOnly) {');

    expect(body).toContain(
      'const upgradeOnly = isFreeBillingPlanTier(normalizeBillingPlanTier(access.subscriptionTier))',
    );
    expect(body).not.toContain('progressbar');
    expect(freeBranch).toBeGreaterThan(-1);
    expect(body.indexOf('renderUsageBanner(banner)')).toBeGreaterThan(freeBranch);
    expect(body.slice(freeBranch, body.indexOf('return;', freeBranch))).toContain(
      'renderUsageBanner(null)',
    );
  });

  it('gives the More popover the arrow-key contract its role promises', () => {
    expect(source).toContain('wirePopupMenu(menuBtn, moreMenu)');
  });

  it('moves focus to the first available attach menu item when it opens', () => {
    expect(source).toContain(
      'attachMenuItems.find((item) => !item.hidden && !item.disabled)?.focus()',
    );
  });

  it('updates the video progress label and not the spinner', () => {
    expect(source).toContain('.sp-video-progress__label');
  });

  it('has no in-panel account block, plan badge or auth bar', () => {
    expect(source).not.toContain("id: 'sp-quota-badge'");
    expect(source).not.toContain("id: 'sp-auth-bar'");
    expect(source).not.toContain("id: 'sp-bridge-url-input'");
  });
});
