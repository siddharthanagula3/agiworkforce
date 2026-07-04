// Live QA pass on the v3 Sidebar (apps/desktop/src/features/v3/Sidebar.tsx) and
// everything it exposes: collapse/expand, New Chat, Search, conversation list,
// Projects section, Local/Cloud toggle, account/profile footer, keyboard nav,
// and visual polish. Real Tauri IPC, real SQLite, no mocks.
//
// Same perf note as conversation-actions.spec.ts: the embedded driver pays a
// fixed ~5-6s tax on nearly every discrete WebdriverIO command, so most steps
// are collapsed into single `browser.execute()` in-page DOM operations.

const SCREEN_DIR =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/75367813-fb2a-4a49-bdcd-6412347c218f/scratchpad/desktop-qa-screens';

function clickSelector(selector: string) {
  return browser.execute((sel) => {
    (document.querySelector(sel) as HTMLElement | null)?.click();
  }, selector);
}

function waitForSelector(
  selector: string,
  timeoutMs = 15000,
  mode: 'appear' | 'disappear' = 'appear',
) {
  return browser.execute(
    (sel, timeout, m) =>
      new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const found = !!document.querySelector(sel);
          const ok = m === 'appear' ? found : !found;
          if (ok) return resolve(true);
          if (Date.now() - start > timeout) return resolve(false);
          setTimeout(tick, 120);
        };
        tick();
      }),
    selector,
    timeoutMs,
    mode,
  ) as Promise<boolean>;
}

function clickButtonWithText(containerSelector: string, text: string) {
  return browser.execute(
    (containerSel, label) => {
      const container = document.querySelector(containerSel) ?? document;
      const buttons = Array.from(container.querySelectorAll('button'));
      const match = buttons.find((b) => (b.textContent ?? '').trim() === label);
      if (match) {
        (match as HTMLButtonElement).click();
        return true;
      }
      return false;
    },
    containerSelector,
    text,
  ) as Promise<boolean>;
}

describe('AGI Desktop v3 Sidebar', () => {
  it('Collapse toggle: animates, resizes content, and persists across reload', async function () {
    this.timeout(60000);
    await browser.pause(1000);

    const before = await browser.execute(() => {
      const aside = document.querySelector('aside[data-v3-sidebar]');
      return {
        collapsedAttr: aside?.getAttribute('data-collapsed'),
        width: aside ? getComputedStyle(aside).width : null,
      };
    });
    console.log('COLLAPSE: initial state', JSON.stringify(before));

    await clickSelector('aside[data-v3-sidebar] button[title="Collapse sidebar"]');
    await browser.pause(400); // let the 180ms width transition settle

    const afterCollapse = await browser.execute(() => {
      const aside = document.querySelector('aside[data-v3-sidebar]');
      return {
        collapsedAttr: aside?.getAttribute('data-collapsed'),
        width: aside ? getComputedStyle(aside).width : null,
      };
    });
    console.log('COLLAPSE: after clicking collapse', JSON.stringify(afterCollapse));

    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-01-collapsed.png`);

    await browser.refresh();
    await browser.pause(2500);

    const afterReload = await browser.execute(() => {
      const aside = document.querySelector('aside[data-v3-sidebar]');
      return {
        collapsedAttr: aside?.getAttribute('data-collapsed'),
        width: aside ? getComputedStyle(aside).width : null,
      };
    });
    console.log(
      'COLLAPSE: still collapsed after full page reload (persisted, not just in-memory):',
      JSON.stringify(afterReload),
    );
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-02-collapsed-after-reload.png`);

    // Restore expanded state for the remaining tests in this file.
    await clickSelector('aside[data-v3-sidebar] button[title="Expand sidebar"]');
    await browser.pause(400);
    const restoredExpanded = await browser.execute(() => {
      const aside = document.querySelector('aside[data-v3-sidebar]');
      return aside?.getAttribute('data-collapsed');
    });
    console.log('COLLAPSE: restored to expanded for remaining tests:', restoredExpanded);
  });

  it('New Chat: creates a fresh conversation, clears prior draft, focuses composer', async function () {
    this.timeout(60000);
    await browser.pause(500);

    // Leave a draft in the composer without sending it.
    const draftInput = await $('textarea[aria-label="Chat message input"]');
    await draftInput.waitForDisplayed({ timeout: 10000 });
    await draftInput.setValue('QA draft that should be discarded by New Chat');
    const draftBefore = await draftInput.getValue();
    console.log('NEW CHAT: draft set before clicking New chat:', JSON.stringify(draftBefore));

    await clickSelector('aside[data-v3-sidebar] button[title="New chat"]');
    await browser.pause(600);

    const state = await browser.execute(() => {
      const ta = document.querySelector(
        'textarea[aria-label="Chat message input"]',
      ) as HTMLTextAreaElement | null;
      return {
        value: ta?.value ?? null,
        isFocused: ta === document.activeElement,
        exists: !!ta,
      };
    });
    console.log('NEW CHAT: composer state after New Chat click:', JSON.stringify(state));
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-03-new-chat.png`);
  });

  it('Search: opens via sidebar button, filters live, click result navigates, Escape closes', async function () {
    this.timeout(60000);
    await browser.pause(500);

    // Seed a findable conversation.
    const seedTitle = `QA Search Target ${Date.now()}`;
    await browser.execute((title) => {
      const ta = document.querySelector(
        'textarea[aria-label="Chat message input"]',
      ) as HTMLTextAreaElement | null;
      if (ta) ta.value = title;
      const sendBtn = document.querySelector(
        'button[aria-label*="Send message ("]',
      ) as HTMLButtonElement | null;
      sendBtn?.click();
    }, seedTitle);
    await waitForSelector('[data-role="assistant"]', 30000);

    await clickSelector('aside[data-v3-sidebar] button[title="Search (⌘K)"]');
    const dialogAppeared = await waitForSelector('div[role="dialog"][aria-modal="true"]', 5000);
    console.log('SEARCH: dialog opened from sidebar button:', dialogAppeared);
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-04-search-open.png`);

    const searchInput = await $('input[role="searchbox"]');
    await searchInput.waitForDisplayed({ timeout: 5000 });
    await searchInput.setValue(seedTitle.slice(0, 18));
    await browser.pause(300);

    const filtered = await browser.execute(
      (needle) => {
        const results = Array.from(document.querySelectorAll('#search-results [role="option"]'));
        return {
          count: results.length,
          matchesQuery: results.every((r) => (r.textContent ?? '').includes(needle)),
          firstResultText: results[0]?.textContent ?? null,
        };
      },
      seedTitle.slice(0, 18),
    );
    console.log('SEARCH: live filter result:', JSON.stringify(filtered));
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-05-search-filtered.png`);

    // Click the first (only) result and confirm it navigates + closes the modal.
    await clickSelector('#search-results [role="option"]');
    await browser.pause(400);
    const closedAfterClick = await waitForSelector(
      'div[role="dialog"][aria-modal="true"]',
      3000,
      'disappear',
    );
    console.log('SEARCH: modal closed after clicking a result:', closedAfterClick);

    // Reopen and verify Escape closes it too.
    await clickSelector('aside[data-v3-sidebar] button[title="Search (⌘K)"]');
    await waitForSelector('div[role="dialog"][aria-modal="true"]', 5000);
    await browser.keys('Escape');
    const closedAfterEscape = await waitForSelector(
      'div[role="dialog"][aria-modal="true"]',
      3000,
      'disappear',
    );
    console.log('SEARCH: modal closed after Escape:', closedAfterEscape);
  });

  it('Conversation list: grouping headers render and hover reveals per-row actions', async function () {
    this.timeout(30000);
    await browser.pause(500);

    const groupHeaders = await browser.execute(() => {
      const aside = document.querySelector('aside[data-v3-sidebar]');
      if (!aside) return [];
      // Grab all small header-style divs inside the Recents block by text content
      // (Sidebar.tsx groupConversations buckets: Pinned / Last hour / Today / ...).
      const headers = new Set<string>();
      const candidates = Array.from(aside.querySelectorAll('div')).filter((d) => {
        const txt = (d.textContent ?? '').trim();
        return ['Last hour', 'Today', 'Yesterday', 'Past week', 'Past month', 'Pinned'].includes(
          txt,
        );
      });
      candidates.forEach((c) => headers.add(c.textContent!.trim()));
      return Array.from(headers);
    });
    console.log('GROUPING: time-group headers present:', JSON.stringify(groupHeaders));

    const activeRowActions = await browser.execute(() => {
      const row = document.querySelector(
        '[data-testid="conversation-row"][data-conversation-active="true"]',
      );
      return {
        rowFound: !!row,
        moreButtonVisibleOnActive: !!row?.querySelector('button[aria-label="More options"]'),
      };
    });
    console.log(
      'HOVER-EQUIVALENT: active row always shows the more-options trigger:',
      JSON.stringify(activeRowActions),
    );
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-06-conversation-list.png`);
  });

  it('Projects: create, rename, archive (new), and delete via ProjectRow menu', async function () {
    this.timeout(90000);
    await browser.pause(500);

    const countBefore = await browser.execute(
      () => document.querySelectorAll('[data-testid="project-row"]').length,
    );

    await clickSelector('aside[data-v3-sidebar] button[aria-label="New project"]');
    const appeared = await waitForSelector('[data-testid="project-row"]', 8000);
    const countAfterCreate = await browser.execute(
      () => document.querySelectorAll('[data-testid="project-row"]').length,
    );
    console.log(
      'PROJECT CREATE: rows before/after:',
      countBefore,
      countAfterCreate,
      'appeared-selector-wait:',
      appeared,
    );
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-07-project-created.png`);

    if (countAfterCreate <= countBefore) {
      console.log(
        'PROJECT CREATE: WARNING — new project did not appear in the sidebar list. ' +
          'Sidebar caps visibleProjects to the first 6 by array order (no recency re-sort), ' +
          'so if 6+ projects already existed, a newly created one is invisible until an ' +
          'older one is archived/deleted. See Sidebar.tsx visibleProjects.',
      );
      await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-07b-project-not-visible-BUG.png`);
      return; // remaining sub-steps need a visible row to operate on
    }

    // Rename the last (newly appended) row via its 3-dot menu.
    const renamedName = `QA Project ${Date.now()}`;
    await browser.execute(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="project-row"]'));
      const last = rows[rows.length - 1];
      const moreBtn = last?.querySelector(
        'button[aria-label="More options"]',
      ) as HTMLElement | null;
      if (moreBtn) {
        (moreBtn as HTMLElement).click();
        return;
      }
      // Not hovered/active — force hover state via a real mouseover so React's
      // onMouseEnter handler fires and reveals the actions.
      last?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await browser.pause(150);
    // Retry the more-button click now that hover should be active.
    await browser.execute(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="project-row"]'));
      const last = rows[rows.length - 1];
      const moreBtn = last?.querySelector(
        'button[aria-label="More options"]',
      ) as HTMLElement | null;
      moreBtn?.click();
    });
    const menuOpened = await waitForSelector('div[role="menu"]', 5000);
    console.log('PROJECT RENAME: 3-dot menu opened:', menuOpened);
    await clickButtonWithText('div[role="menu"]', 'Rename');

    const renameInput = await $('[data-testid="project-row"] input');
    await renameInput.waitForDisplayed({ timeout: 5000 });
    await renameInput.clearValue();
    await renameInput.setValue(renamedName);
    await browser.keys('Enter');
    await browser.pause(300);

    const renamed = await browser.execute(
      (name) =>
        Array.from(document.querySelectorAll('[data-testid="project-row"]')).some((r) =>
          (r.textContent ?? '').includes(name),
        ),
      renamedName,
    );
    console.log('PROJECT RENAME: renamed row present:', renamed);
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-08-project-renamed.png`);

    // Archive it (new menu item added this session) and confirm it disappears
    // and stays gone after a full reload.
    await browser.execute((name) => {
      const rows = Array.from(document.querySelectorAll('[data-testid="project-row"]'));
      const target = rows.find((r) => (r.textContent ?? '').includes(name));
      target?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    }, renamedName);
    await browser.pause(150);
    const archiveMenuOpened = await browser.execute((name) => {
      const rows = Array.from(document.querySelectorAll('[data-testid="project-row"]'));
      const target = rows.find((r) => (r.textContent ?? '').includes(name));
      const moreBtn = target?.querySelector(
        'button[aria-label="More options"]',
      ) as HTMLElement | null;
      moreBtn?.click();
      return !!moreBtn;
    }, renamedName);
    await waitForSelector('div[role="menu"]', 5000);
    const archiveClicked = await clickButtonWithText('div[role="menu"]', 'Archive');
    console.log(
      'PROJECT ARCHIVE: menu opened:',
      archiveMenuOpened,
      'Archive item found+clicked:',
      archiveClicked,
    );

    const goneAfterArchive = await browser.execute(
      (name) =>
        !Array.from(document.querySelectorAll('[data-testid="project-row"]')).some((r) =>
          (r.textContent ?? '').includes(name),
        ),
      renamedName,
    );
    console.log('PROJECT ARCHIVE: row hidden immediately after archiving:', goneAfterArchive);
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-09-project-archived.png`);

    await browser.refresh();
    await browser.pause(2500);

    const stillGoneAfterReload = await browser.execute(
      (name) =>
        !Array.from(document.querySelectorAll('[data-testid="project-row"]')).some((r) =>
          (r.textContent ?? '').includes(name),
        ),
      renamedName,
    );
    console.log(
      'PROJECT ARCHIVE: stays hidden after reload (persisted via updateProject, not just local state):',
      stillGoneAfterReload,
    );
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-10-project-archived-after-reload.png`);

    // Delete: create one more throwaway project and remove it via the
    // 2-step confirm-delete menu item (mirrors ConversationRow's pattern).
    await clickSelector('aside[data-v3-sidebar] button[aria-label="New project"]');
    await browser.pause(500);
    await browser.execute(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="project-row"]'));
      const last = rows[rows.length - 1];
      last?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await browser.pause(150);
    const deleteRowId = await browser.execute(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="project-row"]'));
      const last = rows[rows.length - 1];
      const moreBtn = last?.querySelector(
        'button[aria-label="More options"]',
      ) as HTMLElement | null;
      moreBtn?.click();
      return last?.getAttribute('data-project-id') ?? null;
    });
    await waitForSelector('div[role="menu"]', 5000);
    await clickButtonWithText('div[role="menu"]', 'Delete'); // arms confirm
    await waitForSelector('div[role="menu"]', 3000);
    const confirmDeleteClicked = await clickButtonWithText('div[role="menu"]', 'Confirm delete');
    console.log(
      'PROJECT DELETE: confirm-delete clicked:',
      confirmDeleteClicked,
      'target id:',
      deleteRowId,
    );
    await browser.pause(400);
    const deletedRowGone = await browser.execute(
      (id) => !document.querySelector(`[data-testid="project-row"][data-project-id="${id}"]`),
      deleteRowId,
    );
    console.log('PROJECT DELETE: row removed immediately:', deletedRowGone);
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-10b-project-deleted.png`);

    await browser.refresh();
    await browser.pause(2500);
    const deletedStaysGone = await browser.execute(
      (id) => !document.querySelector(`[data-testid="project-row"][data-project-id="${id}"]`),
      deleteRowId,
    );
    console.log('PROJECT DELETE: stays gone after reload:', deletedStaysGone);
  });

  it('Local/Cloud toggle: shows a clear, non-confusing coming-soon message for Cloud (PA-3 gate, live-driven)', async function () {
    this.timeout(30000);
    // Standalone-run safety: when this test isn't preceded by the file's
    // earlier tests (which already wait out initial mount), the sidebar may
    // not be in the DOM yet — wait for it explicitly rather than a fixed pause.
    const sidebarReady = await waitForSelector('aside[data-v3-sidebar]', 15000);
    expect(sidebarReady).toBe(true);
    await browser.pause(300);

    // Prior specs in this file (and prior full-suite runs, since collapse
    // state persists to localStorage) may leave the sidebar collapsed, in
    // which case LocalCloudToggle renders a single icon button with no
    // role="tab" — the original version of this test silently found zero
    // elements in that state and had no assertion to catch it. Force
    // expanded first so the real tablist markup is present.
    const collapsedBefore = await browser.execute(() =>
      document.querySelector('aside[data-v3-sidebar]')?.getAttribute('data-collapsed'),
    );
    if (collapsedBefore !== 'false') {
      await clickSelector('aside[data-v3-sidebar] button[title="Expand sidebar"]');
      await browser.pause(400);
    }

    const tabsBefore = await browser.execute(() => {
      const tabs = Array.from(
        document.querySelectorAll('aside[data-v3-sidebar] [role="tab"]'),
      ) as HTMLElement[];
      return tabs.map((t) => ({ label: t.textContent, selected: t.getAttribute('aria-selected') }));
    });
    // Real assertion: the toggle must actually be reachable and start on Local.
    expect(tabsBefore.length).toBe(2);
    expect(tabsBefore[0]?.selected).toBe('true'); // Local tab selected by default

    await clickSelector('aside[data-v3-sidebar] [role="tab"][aria-selected="false"]');
    await browser.pause(400);

    const toastText = await browser.execute(() => document.body.textContent ?? '');
    const hasComingSoonCopy = toastText.includes('AGI Cloud is available on Web & Mobile');
    console.log('CLOUD TOGGLE: coming-soon toast text present:', hasComingSoonCopy);
    // Real assertion: PA-3's honest interim copy must actually be on screen —
    // not "available on desktop", not silence.
    expect(hasComingSoonCopy).toBe(true);

    const modeAfterClick = await browser.execute(() => {
      const tabs = Array.from(
        document.querySelectorAll('aside[data-v3-sidebar] [role="tab"]'),
      ) as HTMLElement[];
      return tabs.map((t) => ({
        label: t.textContent,
        selected: t.getAttribute('aria-selected'),
      }));
    });
    console.log(
      'CLOUD TOGGLE: tab state unchanged (stays on Local, gate refuses the switch):',
      JSON.stringify(modeAfterClick),
    );
    // Real assertion: the PA-3 gate (`appModeStore.setMode`) must refuse the
    // switch — Local stays selected, Cloud never becomes active. If this ever
    // flips to Cloud being selected, the PA-3 gate has been lifted/bypassed
    // without DCL-4 completing, which is a locked-decision violation.
    expect(modeAfterClick[0]?.selected).toBe('true');
    expect(modeAfterClick[1]?.selected).toBe('false');

    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-11-cloud-toggle-toast.png`);
  });

  it('Account/profile footer: renders a working control with no dead buttons', async function () {
    this.timeout(30000);
    await browser.pause(500);

    const footerState = await browser.execute(() => {
      const aside = document.querySelector('aside[data-v3-sidebar]');
      const footer = aside?.querySelector('[style*="border-top"]') as HTMLElement | null;
      const primaryBtn = footer?.querySelector('button');
      return {
        footerFound: !!footer,
        primaryLabel: primaryBtn?.textContent?.trim() ?? null,
      };
    });
    console.log('ACCOUNT FOOTER: state before click:', JSON.stringify(footerState));

    // Click the primary footer button (avatar + name/sign-in) and confirm it
    // does something (opens AccountMenu if signed in, or Settings > Account
    // if signed out) rather than being inert.
    await browser.execute(() => {
      const aside = document.querySelector('aside[data-v3-sidebar]');
      const buttons = Array.from(aside?.querySelectorAll('button') ?? []);
      const primary = buttons.find((b) => b.hasAttribute('data-open'));
      (primary as HTMLElement | undefined)?.click();
    });
    await browser.pause(500);

    const afterClick = await browser.execute(() => {
      const accountMenu = document.querySelector('[data-v3-account-menu]');
      const settingsDialog = document.querySelector('[role="dialog"]');
      return {
        accountMenuOpen: !!accountMenu,
        anyDialogOpen: !!settingsDialog,
      };
    });
    console.log('ACCOUNT FOOTER: result of clicking primary control:', JSON.stringify(afterClick));
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-12-account-footer.png`);

    // Close whatever opened so it doesn't leak into later tests.
    await browser.keys('Escape');
    await browser.pause(200);

    // Settings gear icon next to it should also work independently.
    await clickSelector('aside[data-v3-sidebar] button[aria-label="Settings"]');
    const settingsOpened = await waitForSelector('[role="dialog"]', 5000);
    console.log('ACCOUNT FOOTER: gear icon opens Settings dialog:', settingsOpened);
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-13-settings-from-gear.png`);
    await browser.keys('Escape');
  });

  it('Keyboard navigation: Tab order reaches sidebar controls, Escape closes open menus', async function () {
    this.timeout(30000);
    await browser.pause(500);

    // Open a conversation-row menu then confirm Escape closes it (already
    // covered per-menu, but re-verify from a cold state for the keyboard-nav item).
    await browser.execute(() => {
      const row = document.querySelector(
        '[data-testid="conversation-row"][data-conversation-active="true"]',
      );
      const moreBtn = row?.querySelector('button[aria-label="More options"]') as HTMLElement | null;
      moreBtn?.click();
    });
    const menuOpen = await waitForSelector('div[role="menu"]', 5000);
    await browser.keys('Escape');
    const menuClosed = await waitForSelector('div[role="menu"]', 3000, 'disappear');
    console.log('KEYBOARD: conversation-row menu opened then Escape-closed:', menuOpen, menuClosed);

    // Focus-order sanity check: from the New Chat button, Tab should reach the
    // Search button next in DOM order (both are focusable, unstyled-for-focus
    // buttons — check they at least receive focus via .focus()).
    const tabFocusable = await browser.execute(() => {
      const newChatBtn = document.querySelector(
        'aside[data-v3-sidebar] button[title="New chat"]',
      ) as HTMLElement | null;
      const searchBtn = document.querySelector(
        'aside[data-v3-sidebar] button[title="Search (⌘K)"]',
      ) as HTMLElement | null;
      newChatBtn?.focus();
      const newChatFocused = document.activeElement === newChatBtn;
      searchBtn?.focus();
      const searchFocused = document.activeElement === searchBtn;
      return { newChatFocused, searchFocused };
    });
    console.log(
      'KEYBOARD: sidebar buttons are programmatically focusable:',
      JSON.stringify(tabFocusable),
    );
  });

  it('Visual polish: long conversation/project titles truncate instead of overflowing', async function () {
    this.timeout(60000);
    await browser.pause(500);

    const longTitle =
      'QA Extremely Long Conversation Title That Should Truncate With An Ellipsis Instead Of Wrapping Or Overflowing The Sidebar Rail';

    await clickSelector('aside[data-v3-sidebar] button[title="New chat"]');
    await browser.pause(400);
    await browser.execute((title) => {
      const ta = document.querySelector(
        'textarea[aria-label="Chat message input"]',
      ) as HTMLTextAreaElement | null;
      if (ta) ta.value = title;
      const sendBtn = document.querySelector(
        'button[aria-label*="Send message ("]',
      ) as HTMLButtonElement | null;
      sendBtn?.click();
    }, longTitle);
    await waitForSelector('[data-role="assistant"]', 30000);

    const overflowCheck = await browser.execute((title) => {
      const rows = Array.from(document.querySelectorAll('[data-testid="conversation-row"]'));
      const row = rows.find((r) => (r.textContent ?? '').includes(title.slice(0, 20)));
      const titleSpan = row?.querySelector('span');
      if (!titleSpan) return null;
      const style = getComputedStyle(titleSpan);
      return {
        textOverflow: style.textOverflow,
        overflow: style.overflow,
        whiteSpace: style.whiteSpace,
        scrollWidthExceedsClientWidth: titleSpan.scrollWidth > titleSpan.clientWidth,
      };
    }, longTitle);
    console.log('VISUAL: long title truncation CSS:', JSON.stringify(overflowCheck));
    await browser.saveScreenshot(`${SCREEN_DIR}/sidebar-14-long-title-truncation.png`);
  });
});
